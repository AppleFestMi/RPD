/**
 * Identity-policy decisions: who must enroll MFA, who must reset password.
 * Pure functions — no side effects, easy to test.
 *
 * See docs/SECURITY_MODEL.md §3.3 for the source of truth.
 */
import type { ActorContext } from "@/lib/permissions/check";

/**
 * Roles for which MFA is required, not just available.
 *
 * Aligns with SECURITY_MODEL.md §3.3:
 *   "MFA is required for: SystemAdmin, Admin, CommandStaff, AuditorReadOnly."
 */
export const MFA_REQUIRED_ROLES = new Set<string>([
  "systemAdmin",
  "admin",
  "commandStaff",
  "auditorReadOnly",
]);

export function roleRequiresMfa(roleKey: string): boolean {
  return MFA_REQUIRED_ROLES.has(roleKey);
}

export function actorMfaRequired(actor: Pick<ActorContext, "roleKeys">): boolean {
  return actor.roleKeys.some(roleRequiresMfa);
}

export type SetupGate =
  | { kind: "ok" }
  | { kind: "force-password-reset" }
  | { kind: "mfa-required" };

/**
 * Determine whether an authenticated user must complete a setup flow
 * before reaching the rest of the app.
 *
 * Order matters:
 *   1. forcePasswordReset — addressed first; setting a new password is
 *      cheap and the user just typed the temporary one.
 *   2. MFA required but not enabled — blocks until enrolled.
 */
export function evaluateSetupGate(input: {
  forcePasswordReset: boolean;
  mfaEnabled: boolean;
  roleKeys: string[];
}): SetupGate {
  if (input.forcePasswordReset) return { kind: "force-password-reset" };
  if (!input.mfaEnabled && input.roleKeys.some(roleRequiresMfa)) {
    return { kind: "mfa-required" };
  }
  return { kind: "ok" };
}
