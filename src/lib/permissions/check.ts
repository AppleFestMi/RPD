/**
 * Permission enforcement.
 *
 * `requirePermission` is the only thing that produces an authorization
 * decision in this app. UI hiding via `can()` is for ergonomics and is
 * NEVER the only gate.
 *
 * On denial, an audit event is emitted. On success, no event is emitted
 * (otherwise the audit log would drown in noise) — successful actions
 * emit their own domain-specific event from inside the handler.
 */
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import type { PermissionKey } from "./catalog";

export class ForbiddenError extends Error {
  readonly code = "forbidden";
  constructor(public readonly permission: PermissionKey) {
    super(`Permission denied: ${permission}`);
  }
}

export class UnauthenticatedError extends Error {
  readonly code = "unauthenticated";
  constructor() {
    super("Not authenticated");
  }
}

export type ActorContext = {
  userId: string;
  email: string;
  roleKeys: string[];
  permissionKeys: PermissionKey[];
};

/**
 * Pure check — does the user hold this permission?
 * Use in components/pages to hide UI; never the only gate on a server action.
 */
export function can(actor: ActorContext | null, permission: PermissionKey): boolean {
  if (!actor) return false;
  return actor.permissionKeys.includes(permission);
}

/**
 * Throws ForbiddenError if the actor lacks the permission. Logs `permission.denied`.
 * Returns the actor on success for ergonomic chaining:
 *
 *   const actor = await requirePermission('schedule.publish');
 */
export async function requirePermission(
  actor: ActorContext | null,
  permission: PermissionKey,
  entity?: { type?: string; id?: string },
): Promise<ActorContext> {
  if (!actor) throw new UnauthenticatedError();
  if (actor.permissionKeys.includes(permission)) return actor;

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.PERMISSION_DENIED,
    entityType: entity?.type ?? null,
    entityId: entity?.id ?? null,
    action: "deny",
    result: "denied",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
    requestId: h.get("x-request-id") ?? null,
    metadata: { permission },
  });

  throw new ForbiddenError(permission);
}

/**
 * Ownership check for *.own permissions.
 *
 *   await requirePermission(actor, 'requests.read.own');
 *   assertOwnership(actor, request.userId);
 */
export function assertOwnership(actor: ActorContext, ownerUserId: string): void {
  if (actor.userId !== ownerUserId) {
    throw new ForbiddenError("requests.read.own"); // generic; caller can supply specifics
  }
}

/**
 * Resolve an actor's effective permissions from the DB.
 * Cached on the request via React's `cache()` would be ideal; here we keep
 * it explicit and let getCurrentActor() do the once-per-request memoization.
 */
export async function loadActor(userId: string): Promise<ActorContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });
  if (!user) return null;
  if (user.disabledAt) return null;

  const roleKeys = user.roles.map((ur) => ur.role.key);
  const permissionKeys = Array.from(
    new Set(
      user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
    ),
  ) as PermissionKey[];

  return {
    userId: user.id,
    email: user.email,
    roleKeys,
    permissionKeys,
  };
}
