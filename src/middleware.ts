/**
 * Edge middleware.
 *
 * Responsibilities:
 *   1. Generate/propagate a request ID.
 *   2. Set strict Content-Security-Policy with a per-request nonce.
 *   3. Rate-limit auth endpoints by IP.
 *
 * Does NOT make permission decisions. Routes/server actions enforce auth
 * and permissions themselves so middleware bypasses (e.g. via a misconfigured
 * matcher) cannot grant access.
 */
import { NextResponse, type NextRequest } from "next/server";
import { newRequestId } from "@/lib/security/request-id";
import { applyAppHeaders } from "@/lib/security/headers";
import { rateLimit } from "@/lib/security/rate-limit";

export const config = {
  matcher: [
    // All paths except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

const AUTH_PATH_PREFIXES = ["/api/auth", "/login"];

export async function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const url = req.nextUrl;

  // Rate-limit auth endpoints by IP.
  if (AUTH_PATH_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    const ip = clientIp(req);
    const limit = Number(process.env.RATE_LIMIT_AUTH_PER_MIN ?? 10);
    const result = rateLimit(`auth:${ip}`, limit, 60_000);
    if (!result.allowed) {
      const r = new NextResponse("Too Many Requests", { status: 429 });
      r.headers.set("Retry-After", Math.max(1, Math.round((result.resetAt - Date.now()) / 1000)).toString());
      r.headers.set("x-request-id", requestId);
      return r;
    }
  }

  // CSP nonce — generated per request, propagated to RSC via header.
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));

  // Forward request ID + nonce to the application.
  const fwd = new Headers(req.headers);
  fwd.set("x-request-id", requestId);
  fwd.set("x-csp-nonce", nonce);

  const res = NextResponse.next({ request: { headers: fwd } });
  res.headers.set("x-request-id", requestId);
  applyAppHeaders(res, { nonce, isDev });
  return res;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
