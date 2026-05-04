"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import {
  generateBackupCodes,
  newTotpSetup,
  verifyTotpAgainstSecret,
} from "@/lib/auth/mfa";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

/**
 * In-memory pending enrollment store.
 *
 * The plaintext TOTP secret only lives here until the user verifies the
 * first 6-digit code. Single-instance only. For multi-instance deployments,
 * this needs a backing store (Redis, signed cookie, or a temporary table
 * with TTL). Out of scope for the live-pilot single-VPS target.
 */
type Pending = { secret: string; expiresAt: number };
const pendingByUserId = new Map<string, Pending>();

const PENDING_TTL_MS = 10 * 60_000;

function gcPending() {
  const now = Date.now();
  for (const [k, v] of pendingByUserId) if (v.expiresAt <= now) pendingByUserId.delete(k);
}

async function loggingContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

/**
 * Begin enrollment. Returns the otpauth URI for QR rendering and the
 * base32 secret for manual entry. The user must call completeMfaSetup
 * with a fresh TOTP code to actually enable MFA.
 */
export async function startMfaSetup(): Promise<{
  otpauthUri: string;
  secretBase32: string;
}> {
  const actor = await requireActor("/setup/mfa");
  const { ip, userAgent, requestId } = await loggingContext();

  gcPending();
  const setup = newTotpSetup(actor.email);
  pendingByUserId.set(actor.userId, {
    secret: setup.secretBase32,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_MFA_SETUP_STARTED,
    action: "start",
    result: "success",
    ip,
    userAgent,
    requestId,
  });

  // Persist the encrypted secret in a "draft" state. We do NOT yet flip
  // mfaEnabled — that happens on completeMfaSetup.
  await prisma.user.update({
    where: { id: actor.userId },
    data: { mfaSecretEncrypted: setup.encrypted, mfaVerifiedAt: null, mfaEnabled: false },
  });

  return { otpauthUri: setup.otpauthUri, secretBase32: setup.secretBase32 };
}

const COMPLETE_SCHEMA = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code shown in your authenticator."),
});

/**
 * Verify the candidate TOTP and enable MFA. Generates one-time backup
 * codes and returns them in plaintext (the only time we ever do).
 */
export async function completeMfaSetup(
  input: z.infer<typeof COMPLETE_SCHEMA>,
): Promise<
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string }
> {
  const actor = await requireActor("/setup/mfa");
  const { ip, userAgent, requestId } = await loggingContext();

  const parsed = COMPLETE_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid code." };
  }

  gcPending();
  const pending = pendingByUserId.get(actor.userId);
  let secret: string | null = pending?.secret ?? null;

  // Fall back to the draft secret on the user row (e.g. if process restarted
  // mid-flow). Refusing this would make the UX brittle for no real benefit.
  if (!secret) {
    const u = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { mfaSecretEncrypted: true, mfaEnabled: true },
    });
    if (u?.mfaEnabled) {
      return { ok: false, error: "MFA already enabled. Reset before re-enrolling." };
    }
    if (u?.mfaSecretEncrypted) {
      try {
        secret = decryptSecret(u.mfaSecretEncrypted);
      } catch {
        secret = null;
      }
    }
  }
  if (!secret) {
    return { ok: false, error: "Setup expired. Start enrollment again." };
  }

  if (!verifyTotpAgainstSecret(secret, parsed.data.code)) {
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.AUTH_MFA_CHALLENGE_FAILURE,
      action: "challenge",
      result: "failure",
      ip,
      userAgent,
      requestId,
      metadata: { stage: "enroll" },
    });
    return { ok: false, error: "That code didn't match. Try again." };
  }

  // Generate backup codes BEFORE flipping mfaEnabled so a failure leaves
  // the user in a consistent (still-pre-MFA) state.
  const codes = await generateBackupCodes();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Wipe any prior backup codes (e.g. from a previous attempt).
    await tx.backupCode.deleteMany({ where: { userId: actor.userId } });
    await tx.backupCode.createMany({
      data: codes.hashes.map((h) => ({ userId: actor.userId, codeHash: h })),
    });
    await tx.user.update({
      where: { id: actor.userId },
      data: {
        mfaEnabled: true,
        mfaSecretEncrypted: encryptSecret(secret as string),
        mfaVerifiedAt: new Date(),
      },
    });
  });

  pendingByUserId.delete(actor.userId);

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_MFA_SETUP_COMPLETED,
    action: "complete",
    result: "success",
    ip,
    userAgent,
    requestId,
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_BACKUP_CODES_GENERATED,
    action: "generate",
    result: "success",
    ip,
    userAgent,
    requestId,
    metadata: { count: codes.plaintext.length },
  });

  return { ok: true, backupCodes: codes.plaintext };
}

/**
 * Generate a fresh set of backup codes for an already-enrolled user,
 * invalidating prior codes.
 */
export async function regenerateBackupCodes(): Promise<
  { ok: true; backupCodes: string[] } | { ok: false; error: string }
> {
  const actor = await requireActor();
  const { ip, userAgent, requestId } = await loggingContext();

  const u = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true },
  });
  if (!u?.mfaEnabled) return { ok: false, error: "MFA not enabled." };

  const codes = await generateBackupCodes();
  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId: actor.userId } }),
    prisma.backupCode.createMany({
      data: codes.hashes.map((h) => ({ userId: actor.userId, codeHash: h })),
    }),
  ]);

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_BACKUP_CODES_REGENERATED,
    action: "regenerate",
    result: "success",
    ip,
    userAgent,
    requestId,
    metadata: { count: codes.plaintext.length },
  });

  return { ok: true, backupCodes: codes.plaintext };
}
