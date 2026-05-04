"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/security/password";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";

const SCHEMA = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
});

export async function changePassword(
  input: z.infer<typeof SCHEMA>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireActor("/setup/password");
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

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) return { ok: false, error: "Account not found." };

  const ok = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!ok) {
    await auditLog({
      actor: { userId: user.id, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.AUTH_PASSWORD_RESET_FAILURE,
      action: "reset",
      result: "failure",
      ...ctx,
      metadata: { reason: "wrong_current" },
    });
    return { ok: false, error: "Current password is incorrect." };
  }

  // Reject reuse — if the new password verifies as the current, reject.
  if (await verifyPassword(user.passwordHash, parsed.data.newPassword)) {
    await auditLog({
      actor: { userId: user.id, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.AUTH_PASSWORD_RESET_FAILURE,
      action: "reset",
      result: "failure",
      ...ctx,
      metadata: { reason: "reuse" },
    });
    return { ok: false, error: "New password must differ from the current one." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      forcePasswordReset: false,
    },
  });

  await auditLog({
    actor: { userId: user.id, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_PASSWORD_RESET_SUCCESS,
    action: "reset",
    result: "success",
    ...ctx,
  });

  return { ok: true };
}
