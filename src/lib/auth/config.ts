/**
 * Auth.js v5 configuration.
 *
 * Login flow (single-step):
 *   - User submits email + password + (optional) MFA code in one form.
 *   - authorize() verifies password.
 *   - If user has MFA enabled, the code is required:
 *       * 6-digit numeric → verified as TOTP against decrypted secret
 *       * AAAA-BBBB-CCCC  → verified as a backup code (single-use)
 *   - All four outcomes (success, password failure, MFA failure, lockout)
 *     are audit-logged.
 *
 * Account lockout is on password failure. MFA failure does NOT increment the
 * password-failure counter (separate concern; we audit-log it instead). A
 * future revision may add an MFA-specific limiter.
 */
import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/security/password";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import {
  consumeBackupCode,
  looksLikeBackupCode,
  verifyTotpForUser,
} from "@/lib/auth/mfa";

const LOGIN_SCHEMA = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  // Either a 6-digit TOTP or a hyphenated backup code; validated for shape
  // here, contents verified after we know if MFA is required.
  mfaCode: z.string().max(64).optional().default(""),
});

const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60_000;

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: Math.max(
      Number(process.env.SESSION_ABSOLUTE_MS ?? 12 * 60 * 60_000) / 1000,
      60 * 60,
    ),
    updateAge: 60 * 5,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA code", type: "text" },
      },
      async authorize(rawCredentials, req) {
        const ip = extractIp(req);
        const userAgent = req?.headers?.get?.("user-agent") ?? null;

        const parsed = LOGIN_SCHEMA.safeParse(rawCredentials);
        if (!parsed.success) {
          await auditLog({
            actor: { userId: null },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip,
            userAgent,
            metadata: { reason: "invalid_payload" },
          });
          return null;
        }
        const { email, password, mfaCode } = parsed.data;
        const lower = email.toLowerCase();

        const user = await prisma.user.findUnique({ where: { email: lower } });
        if (!user || user.disabledAt || !user.activatedAt) {
          await auditLog({
            actor: { userId: user?.id ?? null },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip,
            userAgent,
            metadata: {
              reason: !user
                ? "no_such_user"
                : user.disabledAt
                  ? "disabled"
                  : "not_activated",
            },
          });
          return null;
        }

        // Lockout check (password-failure-driven).
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await auditLog({
            actor: { userId: user.id },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "denied",
            ip,
            userAgent,
            metadata: { reason: "locked", lockedUntil: user.lockedUntil.toISOString() },
          });
          return null;
        }

        // Password verification.
        const passwordOk = await verifyPassword(user.passwordHash, password);
        if (!passwordOk) {
          const newFails = user.failedLoginCount + 1;
          const triggerLock = newFails >= MAX_FAILS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: triggerLock ? 0 : newFails,
              lockedUntil: triggerLock ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
            },
          });
          await auditLog({
            actor: { userId: user.id },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip,
            userAgent,
            metadata: { reason: "wrong_password", failures: newFails },
          });
          if (triggerLock) {
            await auditLog({
              actor: { userId: user.id },
              eventType: EVENTS.AUTH_LOCKOUT_TRIGGERED,
              action: "lockout",
              result: "success",
              ip,
              userAgent,
              metadata: { lockoutMs: LOCKOUT_MS },
            });
          }
          return null;
        }

        // MFA gate.
        if (user.mfaEnabled) {
          if (!user.mfaSecretEncrypted) {
            // Shouldn't happen — defensive. Audit and refuse.
            await auditLog({
              actor: { userId: user.id },
              eventType: EVENTS.AUTH_MFA_CHALLENGE_FAILURE,
              action: "challenge",
              result: "failure",
              ip,
              userAgent,
              metadata: { reason: "missing_secret" },
            });
            return null;
          }
          if (!mfaCode) {
            await auditLog({
              actor: { userId: user.id },
              eventType: EVENTS.AUTH_MFA_CHALLENGE_FAILURE,
              action: "challenge",
              result: "failure",
              ip,
              userAgent,
              metadata: { reason: "missing_code" },
            });
            return null;
          }

          let mfaOk = false;
          if (looksLikeBackupCode(mfaCode)) {
            const consumedId = await consumeBackupCode(user.id, mfaCode, ip);
            mfaOk = consumedId !== null;
            if (mfaOk) {
              await auditLog({
                actor: { userId: user.id },
                eventType: EVENTS.AUTH_BACKUP_CODE_USED,
                action: "use",
                result: "success",
                ip,
                userAgent,
                metadata: { backupCodeId: consumedId },
              });
            } else {
              await auditLog({
                actor: { userId: user.id },
                eventType: EVENTS.AUTH_BACKUP_CODE_FAILURE,
                action: "use",
                result: "failure",
                ip,
                userAgent,
              });
            }
          } else {
            mfaOk = verifyTotpForUser(user.mfaSecretEncrypted, mfaCode);
          }

          if (!mfaOk) {
            await auditLog({
              actor: { userId: user.id },
              eventType: EVENTS.AUTH_MFA_CHALLENGE_FAILURE,
              action: "challenge",
              result: "failure",
              ip,
              userAgent,
              metadata: { reason: "wrong_code" },
            });
            return null;
          }

          await auditLog({
            actor: { userId: user.id },
            eventType: EVENTS.AUTH_MFA_CHALLENGE_SUCCESS,
            action: "challenge",
            result: "success",
            ip,
            userAgent,
          });
        }

        // Success path.
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });
        await auditLog({
          actor: { userId: user.id },
          eventType: EVENTS.AUTH_LOGIN_SUCCESS,
          action: "login",
          result: "success",
          ip,
          userAgent,
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // FUTURE: OIDC/SAML providers can be added here. The session strategy stays
    // "database" so admin can revoke sessions regardless of provider.
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

function extractIp(req: { headers?: { get?: (n: string) => string | null } } | undefined): string | null {
  if (!req?.headers?.get) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}
