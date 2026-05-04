"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { issueInvitation } from "@/lib/auth/invitation";

async function loggingContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

const INVITE_SCHEMA = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  rank: z.string().max(60).optional().default(""),
  badge: z.string().max(40).optional().default(""),
  roleKey: z.string().min(1).max(40), // initial role
});

/**
 * Create a user (disabled until activation) and issue an invitation token.
 *
 * Returns the activation URL. The admin will copy this URL into department
 * email or hand it to the invitee directly. Email delivery is intentionally
 * not wired in this iteration; once SMTP is configured, this server action
 * is the place to send the message.
 */
export async function inviteUser(input: z.infer<typeof INVITE_SCHEMA>): Promise<
  | { ok: true; activationUrl: string; expiresAt: string }
  | { ok: false; error: string }
> {
  const actor = await requireActor("/admin/users");
  await requirePermission(actor, "admin.users.manage");
  const ctx = await loggingContext();

  const parsed = INVITE_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const lower = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const role = await prisma.role.findUnique({ where: { key: parsed.data.roleKey } });
  if (!role) return { ok: false, error: "Selected role does not exist." };

  const user = await prisma.user.create({
    data: {
      email: lower,
      name: parsed.data.name,
      rank: parsed.data.rank || null,
      badge: parsed.data.badge || null,
      passwordHash: "", // set during activation
      invitedAt: new Date(),
      forcePasswordReset: false,
      roles: { create: { roleId: role.id, grantedBy: actor.userId } },
    },
  });

  const invite = await issueInvitation({
    userId: user.id,
    invitedById: actor.userId,
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const activationUrl = `${baseUrl.replace(/\/$/, "")}/activate/${invite.token}`;

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_INVITED,
    entityType: "User",
    entityId: user.id,
    action: "invite",
    result: "success",
    ...ctx,
    metadata: {
      email: lower,
      roleKey: parsed.data.roleKey,
      invitationId: invite.invitationId,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_ROLE_GRANTED,
    entityType: "User",
    entityId: user.id,
    action: "grant",
    result: "success",
    ...ctx,
    metadata: { roleKey: parsed.data.roleKey, viaInvite: true },
  });

  revalidatePath("/admin/users");
  return { ok: true, activationUrl, expiresAt: invite.expiresAt.toISOString() };
}

const USER_ID = z.object({ userId: z.string().min(1).max(40) });

export async function disableUser(input: z.infer<typeof USER_ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.users.manage");
  const ctx = await loggingContext();
  const { userId } = USER_ID.parse(input);
  if (userId === actor.userId) return { ok: false as const, error: "You cannot disable your own account." };

  await prisma.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  await prisma.session.deleteMany({ where: { userId } }); // revoke sessions
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_DISABLED,
    entityType: "User",
    entityId: userId,
    action: "disable",
    result: "success",
    ...ctx,
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function enableUser(input: z.infer<typeof USER_ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.users.manage");
  const ctx = await loggingContext();
  const { userId } = USER_ID.parse(input);
  await prisma.user.update({ where: { id: userId }, data: { disabledAt: null } });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_ENABLED,
    entityType: "User",
    entityId: userId,
    action: "enable",
    result: "success",
    ...ctx,
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function unlockUser(input: z.infer<typeof USER_ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.users.unlock");
  const ctx = await loggingContext();
  const { userId } = USER_ID.parse(input);
  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil: null, failedLoginCount: 0 },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_UNLOCKED,
    entityType: "User",
    entityId: userId,
    action: "unlock",
    result: "success",
    ...ctx,
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

const FORCE_RESET = z.object({ userId: z.string().min(1).max(40) });

export async function forcePasswordReset(input: z.infer<typeof FORCE_RESET>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.users.manage");
  const ctx = await loggingContext();
  const { userId } = FORCE_RESET.parse(input);
  await prisma.user.update({
    where: { id: userId },
    data: { forcePasswordReset: true },
  });
  await prisma.session.deleteMany({ where: { userId } }); // force re-login
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_PASSWORD_RESET_FORCED,
    entityType: "User",
    entityId: userId,
    action: "forceReset",
    result: "success",
    ...ctx,
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

const MFA_RESET = z.object({
  userId: z.string().min(1).max(40),
  /** Confirmation: admin types the target user's email to confirm. */
  confirmEmail: z.string().email(),
});

export async function resetUserMfa(input: z.infer<typeof MFA_RESET>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.mfa.reset");
  const ctx = await loggingContext();
  const parsed = MFA_RESET.parse(input);

  const target = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!target) return { ok: false as const, error: "User not found." };
  if (parsed.confirmEmail.toLowerCase() !== target.email.toLowerCase()) {
    return { ok: false as const, error: "Confirmation email did not match the target user." };
  }

  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId: target.id } }),
    prisma.user.update({
      where: { id: target.id },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaVerifiedAt: null,
        mfaResetAt: new Date(),
      },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_MFA_RESET_BY_ADMIN,
    entityType: "User",
    entityId: target.id,
    action: "reset",
    result: "success",
    ...ctx,
  });
  revalidatePath(`/admin/users/${target.id}`);
  return { ok: true as const };
}

const ROLE_GRANT = z.object({
  userId: z.string().min(1).max(40),
  roleKey: z.string().min(1).max(40),
});

export async function grantRole(input: z.infer<typeof ROLE_GRANT>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.roles.manage");
  const ctx = await loggingContext();
  const { userId, roleKey } = ROLE_GRANT.parse(input);
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) return { ok: false as const, error: "Role not found." };
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id, grantedBy: actor.userId },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_ROLE_GRANTED,
    entityType: "User",
    entityId: userId,
    action: "grant",
    result: "success",
    ...ctx,
    metadata: { roleKey },
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function revokeRole(input: z.infer<typeof ROLE_GRANT>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.roles.manage");
  const ctx = await loggingContext();
  const { userId, roleKey } = ROLE_GRANT.parse(input);
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) return { ok: false as const, error: "Role not found." };
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_ROLE_REVOKED,
    entityType: "User",
    entityId: userId,
    action: "revoke",
    result: "success",
    ...ctx,
    metadata: { roleKey },
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

/**
 * Re-issue an invitation for an unactivated user (e.g. token expired).
 */
export async function resendInvitation(input: z.infer<typeof USER_ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "admin.users.manage");
  const ctx = await loggingContext();
  const { userId } = USER_ID.parse(input);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false as const, error: "User not found." };
  if (user.activatedAt) return { ok: false as const, error: "User is already activated." };

  // Invalidate any prior unused invitations for this user.
  await prisma.userInvitation.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date(), expiresAt: new Date() },
  });
  const invite = await issueInvitation({ userId, invitedById: actor.userId });
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const activationUrl = `${baseUrl.replace(/\/$/, "")}/activate/${invite.token}`;

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.USER_INVITATION_RESENT,
    entityType: "User",
    entityId: userId,
    action: "resend",
    result: "success",
    ...ctx,
  });

  return { ok: true as const, activationUrl, expiresAt: invite.expiresAt.toISOString() };
}
