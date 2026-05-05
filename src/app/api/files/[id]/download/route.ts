/**
 * GET /api/files/[id]/download
 *
 * Streams a stored file to the requesting user, behind:
 *   1. Authentication (getCurrentActor → 401 if absent).
 *   2. files.download (loadDownload calls requirePermission internally).
 *   3. Entity-level visibility check — for the current build the only
 *      consumer is the Policies module, so we check canSeePolicy on the
 *      PolicyDocument that owns the file. Future kinds (training,
 *      vehicle, equipment, announcement) will branch here similarly.
 *   4. The file row's own archive state (404 if archived).
 *
 * Bytes never leave the server's private storage — `FILE_STORAGE_ROOT`
 * is outside `public/`, the route streams via `Response(stream)`, and
 * the storage path is never exposed in the response.
 */
import { headers } from "next/headers";
import { getCurrentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { loadDownload } from "@/lib/files/service";
import { canSeePolicy } from "@/lib/policies/policy";
import type { PolicyStatus } from "@/lib/policies/types";
import type { Readable } from "node:stream";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const actor = await getCurrentActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });

  const file = await prisma.fileAttachment.findUnique({
    where: { id },
    include: {
      policyDocs: {
        select: { id: true, status: true, archivedAt: true },
      },
    },
  });
  if (!file || file.archivedAt) {
    return new Response("Not found", { status: 404 });
  }

  // Entity-level visibility. Today the only file kind in use is
  // "policy"; deny anything else by default rather than silently
  // serving it. Add branches per kind as future modules wire in.
  if (file.kind === "policy" || file.policyDocs.length > 0) {
    const policy = file.policyDocs[0];
    if (!policy) return new Response("Not found", { status: 404 });
    if (!actor.permissionKeys.includes("policies.read")) {
      return new Response("Forbidden", { status: 403 });
    }
    const visible = canSeePolicy(
      { permissionKeys: actor.permissionKeys },
      { status: policy.status as PolicyStatus, archivedAt: policy.archivedAt },
    );
    if (!visible) return new Response("Not found", { status: 404 });
  } else {
    // No supported entity wiring yet — refuse.
    return new Response("Not found", { status: 404 });
  }

  const h = await headers();
  const result = await loadDownload(actor, id, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  });
  if (!result.ok) {
    return new Response(result.error, { status: result.status });
  }

  // Cast Node Readable to Web ReadableStream — supported in Node 18+.
  const webStream = (result.stream as unknown as Readable & { toWeb?: () => ReadableStream }).toWeb
    ? (result.stream as unknown as { toWeb: () => ReadableStream }).toWeb()
    : (result.stream as unknown as ReadableStream);

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.sizeBytes),
      "Content-Disposition": `attachment; filename="${encodeRfc5987(result.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * RFC 5987 / RFC 8187 encoded filename for non-ASCII safety. Browsers
 * also accept the simple `filename="..."` form for ASCII names; we do
 * both to stay friendly with older clients.
 */
function encodeRfc5987(s: string): string {
  return s.replace(/[\\"\r\n]/g, "_");
}
