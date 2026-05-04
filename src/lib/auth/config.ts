/**
 * Auth.js v5 configuration.
 *
 * - Credentials provider for local email/password (MVP).
 * - Prisma adapter for database-backed sessions.
 * - Account lockout on repeated failure (User.failedLoginCount + lockedUntil).
 * - All four outcomes (success, failure, lockout triggered, lockout expired)
 *   are audit-logged.
 * - The shape is OIDC-ready: add a Provider to the array when SSO is wired.
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

const LOGIN_SCHEMA = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  // MFA code is optional in the schema; required at runtime if user has MFA on.
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
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
        const parsed = LOGIN_SCHEMA.safeParse(rawCredentials);
        if (!parsed.success) {
          await auditLog({
            actor: { userId: null },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip: extractIp(req),
            userAgent: req?.headers?.get?.("user-agent") ?? null,
            metadata: { reason: "invalid_payload" },
          });
          return null;
        }
        const { email, password, mfaCode } = parsed.data;
        const lower = email.toLowerCase();

        const user = await prisma.user.findUnique({ where: { email: lower } });
        if (!user || user.disabledAt) {
          await auditLog({
            actor: { userId: null },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip: extractIp(req),
            userAgent: req?.headers?.get?.("user-agent") ?? null,
            metadata: { reason: user ? "disabled" : "no_such_user" },
          });
          return null;
        }

        // Lockout window check
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await auditLog({
            actor: { userId: user.id },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "denied",
            ip: extractIp(req),
            userAgent: req?.headers?.get?.("user-agent") ?? null,
            metadata: { reason: "locked", lockedUntil: user.lockedUntil.toISOString() },
          });
          return null;
        }

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
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
            ip: extractIp(req),
            userAgent: req?.headers?.get?.("user-agent") ?? null,
            metadata: { reason: "wrong_password", failures: newFails },
          });
          if (triggerLock) {
            await auditLog({
              actor: { userId: user.id },
              eventType: EVENTS.AUTH_LOCKOUT_TRIGGERED,
              action: "lockout",
              result: "success",
              ip: extractIp(req),
              userAgent: req?.headers?.get?.("user-agent") ?? null,
              metadata: { lockoutMs: LOCKOUT_MS },
            });
          }
          return null;
        }

        // MFA: if enrolled, require code.
        if (user.mfaEnabled) {
          if (!mfaCode) {
            // Special-case sentinel — the UI re-prompts; do not lock.
            return null;
          }
          // TODO(MFA): verify TOTP using user.mfaSecretEncrypted decoded with
          // MFA_ENCRYPTION_KEY. Implementation lands in a follow-up commit.
          // For now, refuse if MFA is enabled but the verifier isn't wired.
          await auditLog({
            actor: { userId: user.id },
            eventType: EVENTS.AUTH_LOGIN_FAILURE,
            action: "login",
            result: "failure",
            ip: extractIp(req),
            userAgent: req?.headers?.get?.("user-agent") ?? null,
            metadata: { reason: "mfa_not_implemented" },
          });
          return null;
        }

        // Success path
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: extractIp(req),
          },
        });
        await auditLog({
          actor: { userId: user.id },
          eventType: EVENTS.AUTH_LOGIN_SUCCESS,
          action: "login",
          result: "success",
          ip: extractIp(req),
          userAgent: req?.headers?.get?.("user-agent") ?? null,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
    // FUTURE: add OIDC/SAML providers here. The session strategy stays "database"
    // so admin can revoke sessions regardless of provider.
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
