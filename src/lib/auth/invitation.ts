/**
 * User invitation tokens.
 *
 * - Token = 32 random bytes, base64url. Shown to admin once; never persisted in
 *   plaintext. The DB stores SHA-256(token) so a DB read alone cannot forge a
 *   valid activation link.
 * - One-time use: `usedAt` is set on consume. Re-use returns null.
 * - Default lifetime: 7 days. Expired tokens are inert.
 */
import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedInvitation = {
  /** Plaintext token. Show to admin; never persisted. */
  token: string;
  /** Persisted hash; row already inserted. */
  invitationId: string;
  expiresAt: Date;
};

export async function issueInvitation(opts: {
  userId: string;
  invitedById: string;
  ttlMs?: number;
}): Promise<IssuedInvitation> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS));

  const row = await prisma.userInvitation.create({
    data: {
      userId: opts.userId,
      tokenHash,
      expiresAt,
      invitedById: opts.invitedById,
    },
  });

  return { token, invitationId: row.id, expiresAt };
}

/**
 * Look up an invitation by its plaintext token without consuming it.
 * Used by the activation page to render the form.
 */
export async function peekInvitation(token: string): Promise<{
  invitationId: string;
  userId: string;
  expired: boolean;
  used: boolean;
} | null> {
  const tokenHash = sha256Hex(token);
  const row = await prisma.userInvitation.findUnique({ where: { tokenHash } });
  if (!row) return null;
  return {
    invitationId: row.id,
    userId: row.userId,
    expired: row.expiresAt < new Date(),
    used: row.usedAt !== null,
  };
}

/**
 * Atomically consume the invitation. Returns the invitation row (with userId)
 * on success, null if missing/expired/already-used. Use this inside the
 * activation transaction so an interrupted retry cannot double-activate.
 */
export async function consumeInvitation(
  token: string,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = sha256Hex(token);
  // Single-row update with conditional WHERE; updateMany returns count.
  const updated = await prisma.userInvitation.updateMany({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) return null;
  const row = await prisma.userInvitation.findUnique({ where: { tokenHash } });
  if (!row) return null;
  return { id: row.id, userId: row.userId };
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
