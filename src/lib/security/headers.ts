/**
 * Application-level security headers.
 *
 * Caddy sets the static, non-nonced headers (HSTS, X-Frame-Options, etc.)
 * — see Caddyfile. The application is responsible for the strict CSP
 * because the per-request nonce must match the rendered HTML.
 */
import { NextResponse } from "next/server";

export type CspContext = {
  nonce: string;
  isDev: boolean;
};

export function buildCspHeader({ nonce, isDev }: CspContext): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    // Next.js streams script chunks; the nonce gates them.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // In dev, Next's HMR uses eval/inline. NEVER allow these in prod.
      ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
    ],
    "style-src": ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-inline'"] : [])],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(isDev ? ["ws:", "http:"] : [])],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([k, v]) => (v.length === 0 ? k : `${k} ${v.join(" ")}`))
    .join("; ");
}

export function applyAppHeaders(res: NextResponse, ctx: CspContext): NextResponse {
  res.headers.set("Content-Security-Policy", buildCspHeader(ctx));
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), interest-cohort=()",
  );
  return res;
}
