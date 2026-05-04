/**
 * auditLog() — the only way an audit row gets written.
 *
 * Rules:
 *   - Server-only.
 *   - Synchronous w.r.t. its caller (await it).
 *   - Metadata is redacted before persisting.
 *   - Failures THROW. A request whose audit cannot be written must fail.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redact } from "@/lib/security/redact";
import type { EventType } from "./events";

// Mirror the schema enum as a local string union. Avoids depending on a
// specific Prisma export shape that has shifted across releases (sometimes
// at the top level, sometimes via Prisma.$Enums).
type AuditResult = "success" | "failure" | "denied";

const MAX_METADATA_BYTES = 8 * 1024;

type AuditActor = {
  userId: string | null;
  roleSnapshot?: string[];
};

type AuditInput = {
  actor: AuditActor;
  eventType: EventType | string;
  entityType?: string | null;
  entityId?: string | null;
  action?: string;
  result: AuditResult;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function auditLog(input: AuditInput): Promise<void> {
  const safeMetadata = input.metadata ? redact(input.metadata) : null;

  // Cap payload size to avoid runaway rows.
  let metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (safeMetadata) {
    const json = JSON.stringify(safeMetadata);
    if (json.length > MAX_METADATA_BYTES) {
      metadata = {
        truncated: true,
        reason: "metadata exceeded MAX_METADATA_BYTES",
        sampleKeys: Object.keys(safeMetadata).slice(0, 32),
      };
    } else {
      metadata = safeMetadata as Prisma.InputJsonValue;
    }
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actor.userId ?? null,
      actorRoleSnapshot: input.actor.roleSnapshot ?? [],
      actorIp: input.ip ?? null,
      actorUserAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      action: input.action ?? deriveAction(input.eventType),
      result: input.result,
      requestId: input.requestId ?? null,
      metadata,
    },
  });
}

/**
 * Derive a default `action` verb from the dot-segmented event type.
 *   "schedule.published" → "publish"
 *   "auth.login.success" → "login"
 *   "permission.denied"  → "deny"
 */
function deriveAction(eventType: string): string {
  const last = eventType.split(".").pop() ?? "act";
  switch (last) {
    case "success":
    case "failure":
    case "triggered":
    case "expired":
      return eventType.split(".").slice(-2, -1)[0] ?? last;
    case "denied":
      return "deny";
    case "published":
      return "publish";
    case "approved":
      return "approve";
    case "acknowledged":
      return "acknowledge";
    case "reported":
      return "report";
    case "assigned":
      return "assign";
    case "returned":
      return "return";
    case "exported":
      return "export";
    case "viewed":
      return "view";
    case "purged":
      return "purge";
    default:
      return last;
  }
}

/**
 * withAudit — convenience wrapper for server actions.
 *
 *   const result = await withAudit(
 *     { actor, eventType: EVENTS.SCHEDULE_PUBLISHED, entityType: 'ScheduleShift', entityId, requestId },
 *     async () => publishShift(input),
 *   );
 *
 * On thrown error: emits the same eventType with result='failure' and
 * `metadata.error` set to the error name (not the message — message could
 * leak details).
 */
export async function withAudit<T>(
  input: Omit<AuditInput, "result"> & { successMetadata?: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    await auditLog({
      ...input,
      result: "success",
      metadata: { ...(input.metadata ?? {}), ...(input.successMetadata ?? {}) },
    });
    return result;
  } catch (err) {
    await auditLog({
      ...input,
      result: "failure",
      metadata: {
        ...(input.metadata ?? {}),
        error: err instanceof Error ? err.name : "UnknownError",
      },
    });
    throw err;
  }
}
