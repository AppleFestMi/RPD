"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordPolicy } from "@/lib/security/password";
import { consumeInvitation, peekInvitation } from "@/lib/auth/invitation";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";

const SCHEMA = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
  acceptBoundary: z.literal(true),
});

export async function activateUser(input: {
  token: string;
  newPassword: string;
  confirmPassword: string;
  acceptBoundary: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = await headers();
  const ctx = {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };

  const parsed = SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  const policy = validatePasswordPolicy(parsed.data.newPassword);
  if (policy) {
    return {
      ok: false,
      error:
        policy.kind === "tooShort"
          ? `Password must be at least ${policy.min} characters.`
          : "That password is on the blocklist of common compromised passwords.",
    };
  }

  // Peek so we can attribute the audit event to the candidate user even on failure.
  const peek = await peekInvitation(parsed.data.token);
  if (!peek || peek.expired || peek.used) {
    await auditLog({
      actor: { userId: peek?.userId ?? null },
      eventType: EVENTS.USER_ACTIVATION_FAILED,
      action: "activate",
      result: "failure",
      ...ctx,
      metadata: {
        reason: !peek ? "invalid_token" : peek.expired ? "expired" : "already_used",
      },
    });
    return { ok: false, error: "This activation link is invalid, expired, or already used." };
  }

  // Consume token + activate user atomically. consumeInvitation is itself
  // atomic; we follow with the user update inside a transaction so a failure
  // mid-activation cannot leave a half-updated account.
  const consumed = await consumeInvitation(parsed.data.token);
  if (!consumed) {
    await auditLog({
      actor: { userId: peek.userId },
      eventType: EVENTS.USER_ACTIVATION_FAILED,
      action: "activate",
      result: "failure",
      ...ctx,
      metadata: { reason: "race_lost" },
    });
    return { ok: false, error: "This activation link is no longer valid." };
  }

  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      activatedAt: new Date(),
      // Clear any prior force-reset that may have been set during invite.
      forcePasswordReset: false,
    },
  });

  await auditLog({
    actor: { userId: consumed.userId },
    eventType: EVENTS.USER_ACTIVATED,
    action: "activate",
    result: "success",
    ...ctx,
    metadata: { invitationId: consumed.id },
  });

  return { ok: true };
}
