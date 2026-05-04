/**
 * Readiness endpoint. Checks the database is reachable.
 * Distinct from /api/health so a degraded DB doesn't kill the process,
 * but does mark the instance as not-ready for traffic.
 */
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
