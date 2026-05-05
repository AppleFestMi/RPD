/**
 * High-level file pipeline service. Combines validation, storage,
 * metadata, and audit logging behind one entry point per operation.
 *
 * Calling modules (Policies today, Training/Vehicles/Equipment later)
 * still own the entity-permission check; this layer only enforces the
 * cross-cutting `files.upload` / `files.download` / `files.archive`
 * permissions plus all the validation/storage/audit invariants.
 */
import "server-only";
import type { FileClassification } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { requirePermission, type ActorContext } from "@/lib/permissions/check";
import {
  sanitizeFilename,
  validateUpload,
  validationErrorMessage,
  type FileKind,
} from "./validation";
import { newStorageKey, readFileBytes, readStream, writeFileBytes } from "./storage";
import { checksumPrefix, sha256Hex } from "./checksum";

export type IngestInput = {
  actor: ActorContext;
  bytes: Buffer;
  originalFilename: string;
  mimeType: string;
  kind: FileKind;
  classification?: FileClassification;
  /** Logging context (ip / userAgent / requestId). */
  ctx: { ip: string | null; userAgent: string | null; requestId: string | null };
};

export type IngestResult =
  | { ok: true; fileId: string; storageKey: string; checksumSha256: string }
  | { ok: false; error: string };

/**
 * Validate, hash, write, and persist a new FileAttachment row. The
 * caller must have already established that the actor is authorized to
 * upload for the target kind (e.g. policies.manage for kind="policy");
 * here we additionally enforce files.upload.
 */
export async function ingestUpload(input: IngestInput): Promise<IngestResult> {
  await requirePermission(input.actor, "files.upload");

  const candidate = {
    filename: input.originalFilename,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
    kind: input.kind,
  };
  const failure = validateUpload(candidate);
  if (failure) {
    await auditLog({
      actor: { userId: input.actor.userId, roleSnapshot: input.actor.roleKeys },
      eventType: EVENTS.FILE_UPLOAD_REJECTED,
      action: "upload",
      result: "failure",
      ip: input.ctx.ip,
      userAgent: input.ctx.userAgent,
      requestId: input.ctx.requestId,
      metadata: {
        kind: input.kind,
        reason: failure.kind,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
      },
    });
    return { ok: false, error: validationErrorMessage(failure) };
  }

  const safeName = sanitizeFilename(input.originalFilename);
  const storageKey = newStorageKey({ kind: input.kind, originalFilename: safeName });
  const checksum = sha256Hex(input.bytes);

  await writeFileBytes(storageKey, input.bytes);

  const row = await prisma.fileAttachment.create({
    data: {
      storageKey,
      filename: safeName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      checksumSha256: checksum,
      classification: input.classification ?? "operational",
      kind: input.kind,
      uploadedById: input.actor.userId,
    },
  });

  await auditLog({
    actor: { userId: input.actor.userId, roleSnapshot: input.actor.roleKeys },
    eventType: EVENTS.FILE_UPLOADED,
    entityType: "FileAttachment",
    entityId: row.id,
    action: "upload",
    result: "success",
    ip: input.ctx.ip,
    userAgent: input.ctx.userAgent,
    requestId: input.ctx.requestId,
    metadata: {
      kind: input.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      checksumPrefix: checksumPrefix(checksum),
      classification: row.classification,
    },
  });

  return { ok: true, fileId: row.id, storageKey, checksumSha256: checksum };
}

export type DownloadResult =
  | {
      ok: true;
      stream: NodeJS.ReadableStream;
      filename: string;
      mimeType: string;
      sizeBytes: number;
    }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Stream a file's bytes to the response. The caller has already
 * established the actor's right to see the parent entity (policy,
 * training, etc.); this layer enforces files.download and the file's
 * own archive state.
 */
export async function loadDownload(
  actor: ActorContext,
  fileId: string,
  ctx: { ip: string | null; userAgent: string | null; requestId: string | null },
): Promise<DownloadResult> {
  await requirePermission(actor, "files.download");

  const row = await prisma.fileAttachment.findUnique({ where: { id: fileId } });
  if (!row) return { ok: false, status: 404, error: "Not found." };
  if (row.archivedAt) return { ok: false, status: 404, error: "Not found." };

  const stream = readStream(row.storageKey);
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.FILE_DOWNLOADED,
    entityType: "FileAttachment",
    entityId: row.id,
    action: "download",
    result: "success",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata: {
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      checksumPrefix: checksumPrefix(row.checksumSha256),
    },
  });
  return {
    ok: true,
    stream,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}

/**
 * Verify a file on disk still matches its recorded checksum. Not run
 * inline on every download (would double the I/O); call from an admin
 * script or a periodic integrity check.
 */
export async function verifyChecksum(fileId: string): Promise<{ ok: boolean; expected: string; actual: string }> {
  const row = await prisma.fileAttachment.findUnique({ where: { id: fileId } });
  if (!row) throw new Error("File not found");
  const bytes = await readFileBytes(row.storageKey);
  const actual = sha256Hex(bytes);
  return { ok: actual === row.checksumSha256, expected: row.checksumSha256, actual };
}

export async function archiveFile(
  actor: ActorContext,
  fileId: string,
  ctx: { ip: string | null; userAgent: string | null; requestId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission(actor, "files.archive");
  const row = await prisma.fileAttachment.findUnique({ where: { id: fileId } });
  if (!row) return { ok: false, error: "File not found." };
  if (row.archivedAt) return { ok: true };

  await prisma.fileAttachment.update({
    where: { id: fileId },
    data: { archivedAt: new Date(), archivedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.FILE_ARCHIVED,
    entityType: "FileAttachment",
    entityId: row.id,
    action: "archive",
    result: "success",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    metadata: { kind: row.kind, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
  });
  return { ok: true };
}
