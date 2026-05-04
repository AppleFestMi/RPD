/**
 * Liveness endpoint. No DB call — answers "is the process up?".
 * Caddy uses this for healthcheck.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
