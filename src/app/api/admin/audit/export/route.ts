/**
 * GET /api/admin/audit/export
 *
 * Streams a filtered slice of the audit log as RFC-4180 CSV.
 *
 * Security:
 *   1. Authentication — getCurrentActor → 401 if absent.
 *   2. Authorization — requirePermission("audit.export") emits
 *      `permission.denied` and throws ForbiddenError → 403. We additionally
 *      emit `audit.export.denied` so denied export attempts stand out from
 *      generic denials in review.
 *   3. Column projection is intentionally narrow. We only select the same
 *      fields the audit viewer already shows, plus the metadata column
 *      (which `auditLog()` already redacts on write via `redact()`).
 *      We deliberately do NOT include passwordHash, MFA secrets, session
 *      tokens, file storage paths, file checksums, or raw request bodies
 *      anywhere on this route — none of those live on AuditLog to begin
 *      with, and we never join to tables that contain them.
 *   4. CSV cells are escaped (`csvEscape`) — formula-injection prefix
 *      then RFC-4180 quoting. Filename is sanitized to ASCII via
 *      `exportFilename`. `Cache-Control: no-store` to keep exports off
 *      shared caches.
 *
 * Performance:
 *   - Cursor pagination keyed on `(createdAt asc, id asc)`. Each batch is
 *     `BATCH_SIZE` rows; we stream batch-by-batch so memory is bounded
 *     regardless of total row count.
 *   - Actor email/name lookup is batched per page (one `findMany` per
 *     batch with `where: id IN (...)`), avoiding the per-row N+1.
 *   - Date range is clamped to a hard ceiling so a wide-open export can't
 *     accidentally pull millions of rows.
 *
 * Audit:
 *   - `audit.export.requested` before streaming — captures filter intent
 *     even if the client hangs up mid-stream.
 *   - `audit.exported` after the stream closes successfully — records
 *     `rowCount` and `bytesWritten` for review.
 */
import "server-only";
import { headers } from "next/headers";
import { getCurrentActor } from "@/lib/auth/session";
import { ForbiddenError, requirePermission, UnauthenticatedError } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import {
  CSV_COLUMNS,
  csvRow,
  exportFilename,
  metadataForCsv,
} from "@/lib/audit/csv";
import { buildWhere, type AuditFilter } from "@/app/(authed)/admin/audit/where";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 500;
/** Hard ceiling so a runaway export can't tie up the DB indefinitely. */
const MAX_ROWS = 250_000;

export async function GET(req: Request): Promise<Response> {
  const h = await headers();
  const ctx = {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };

  const actor = await getCurrentActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });

  try {
    await requirePermission(actor, "audit.export");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      // Make audit-export denials specifically searchable. requirePermission
      // already emitted the generic permission.denied event.
      await auditLog({
        actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
        eventType: EVENTS.AUDIT_EXPORT_DENIED,
        action: "export",
        result: "denied",
        ...ctx,
        metadata: { permission: "audit.export" },
      });
      return new Response("Forbidden", { status: 403 });
    }
    if (e instanceof UnauthenticatedError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw e;
  }

  const filter = parseFilter(new URL(req.url).searchParams);
  const where = buildWhere(filter);

  // Log intent before opening the stream so a mid-stream client disconnect
  // still leaves a row that explains "who tried to export what".
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_EXPORT_REQUESTED,
    action: "export",
    result: "success",
    ...ctx,
    metadata: { ...filter, format: "csv", batchSize: BATCH_SIZE, maxRows: MAX_ROWS },
  });

  const filename = exportFilename();
  const exporter = {
    actorUserId: actor.userId,
    roleSnapshot: actor.roleKeys,
    ctx,
    filter,
    filename,
  };

  const stream = buildCsvStream(where, exporter);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

type ExporterCtx = {
  actorUserId: string;
  roleSnapshot: string[];
  ctx: { ip: string | null; userAgent: string | null; requestId: string | null };
  filter: AuditFilter;
  filename: string;
};

function buildCsvStream(
  where: ReturnType<typeof buildWhere>,
  exporter: ExporterCtx,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let cursor: { id: string } | undefined;
  let rowCount = 0;
  let bytesWritten = 0;
  let done = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const header = csvRow(CSV_COLUMNS as unknown as string[]);
      controller.enqueue(enc.encode(header));
      bytesWritten += header.length;
    },
    async pull(controller) {
      if (done) return;
      try {
        const remaining = MAX_ROWS - rowCount;
        if (remaining <= 0) {
          done = true;
          await finalize(controller, "success", rowCount, bytesWritten, exporter, true);
          return;
        }

        const take = Math.min(BATCH_SIZE, remaining);
        const batch = await prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          ...(cursor ? { cursor, skip: 1 } : {}),
        });

        if (batch.length === 0) {
          done = true;
          await finalize(controller, "success", rowCount, bytesWritten, exporter, false);
          return;
        }

        const actorIds = Array.from(
          new Set(batch.map((r) => r.actorUserId).filter((v): v is string => typeof v === "string")),
        );
        const actorMap = new Map<string, { email: string; name: string }>(
          actorIds.length === 0
            ? []
            : (
                await prisma.user.findMany({
                  where: { id: { in: actorIds } },
                  select: { id: true, email: true, name: true },
                })
              ).map((u) => [u.id, { email: u.email, name: u.name }]),
        );

        for (const r of batch) {
          const actor = r.actorUserId ? actorMap.get(r.actorUserId) : undefined;
          const cells: ReadonlyArray<unknown> = [
            r.createdAt,
            r.result,
            r.eventType,
            actor?.email ?? "",
            actor?.name ?? "",
            r.actorUserId ?? "",
            r.actorRoleSnapshot.join("|"),
            r.entityType ?? "",
            r.entityId ?? "",
            r.action,
            r.requestId ?? "",
            r.actorIp ?? "",
            r.actorUserAgent ?? "",
            metadataForCsv(r.metadata),
          ];
          const line = csvRow(cells);
          controller.enqueue(enc.encode(line));
          bytesWritten += line.length;
          rowCount += 1;
        }

        const last = batch[batch.length - 1];
        if (!last || batch.length < take) {
          done = true;
          await finalize(controller, "success", rowCount, bytesWritten, exporter, false);
          return;
        }
        cursor = { id: last.id };
      } catch (err) {
        done = true;
        const errName = err instanceof Error ? err.name : "UnknownError";
        await auditLog({
          actor: { userId: exporter.actorUserId, roleSnapshot: exporter.roleSnapshot },
          eventType: EVENTS.AUDIT_EXPORTED,
          action: "export",
          result: "failure",
          ...exporter.ctx,
          metadata: {
            ...exporter.filter,
            rowCount,
            bytesWritten,
            error: errName,
          },
        }).catch(() => {});
        controller.error(err);
      }
    },
    cancel() {
      done = true;
      // Client hung up. We already logged AUDIT_EXPORT_REQUESTED at the
      // top of the route; record completion as failure with the partial
      // counts so review can tell exports apart from clean disconnects.
      auditLog({
        actor: { userId: exporter.actorUserId, roleSnapshot: exporter.roleSnapshot },
        eventType: EVENTS.AUDIT_EXPORTED,
        action: "export",
        result: "failure",
        ...exporter.ctx,
        metadata: {
          ...exporter.filter,
          rowCount,
          bytesWritten,
          cancelled: true,
        },
      }).catch(() => {});
    },
  });
}

async function finalize(
  controller: ReadableStreamDefaultController<Uint8Array>,
  result: "success" | "failure",
  rowCount: number,
  bytesWritten: number,
  exporter: ExporterCtx,
  truncated: boolean,
): Promise<void> {
  controller.close();
  await auditLog({
    actor: { userId: exporter.actorUserId, roleSnapshot: exporter.roleSnapshot },
    eventType: EVENTS.AUDIT_EXPORTED,
    action: "export",
    result,
    ...exporter.ctx,
    metadata: {
      ...exporter.filter,
      rowCount,
      bytesWritten,
      truncated,
      filename: exporter.filename,
    },
  });
}

/**
 * Parse and validate the filter from URL search params.
 *
 * Light validation only — `buildWhere()` is the authoritative consumer;
 * its tests cover the matrix. We trim, length-cap, and gate `result` to
 * the enum so a hostile param can't slip into a Prisma where clause as a
 * non-string.
 */
function parseFilter(sp: URLSearchParams): AuditFilter {
  const fromRaw = sp.get("from") ?? undefined;
  const toRaw = sp.get("to") ?? undefined;
  const from = validIso(fromRaw);
  const to = validIso(toRaw);

  const eventType = sp.get("eventType")?.trim().slice(0, 64) || undefined;
  const actorUserId = sp.get("actorUserId")?.trim().slice(0, 40) || undefined;
  const entityType = sp.get("entityType")?.trim().slice(0, 40) || undefined;

  const resultRaw = sp.get("result")?.trim();
  const result =
    resultRaw === "success" || resultRaw === "failure" || resultRaw === "denied"
      ? resultRaw
      : undefined;

  return { from, to, eventType, result, actorUserId, entityType };
}

function validIso(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
