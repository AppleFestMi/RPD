/**
 * Local filesystem storage for FileAttachment bytes.
 *
 * Layout under `FILE_STORAGE_ROOT` (default `./var/uploads`):
 *
 *   {kind}/{YYYY-MM}/{random32}{ext}
 *
 * The random key is the only thing that ever appears as a filesystem
 * name; the user's original filename is preserved in metadata only.
 *
 * This module is server-only; importing it from a client component is
 * a build-time error via the directive below.
 */
import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { extractExtension } from "./validation";

const DEFAULT_ROOT = "./var/uploads";

function rootDir(): string {
  return resolve(process.env.FILE_STORAGE_ROOT ?? DEFAULT_ROOT);
}

/**
 * Build a fresh storage key. Caller must persist this on the
 * FileAttachment row before writing the bytes — if a write fails the
 * metadata never references a phantom file.
 *
 * The returned key is *relative* to FILE_STORAGE_ROOT and uses forward
 * slashes (DB columns are platform-agnostic).
 */
export function newStorageKey(input: { kind: string; originalFilename: string }): string {
  const ext = extractExtension(input.originalFilename);
  const ym = monthFolder(new Date());
  const rand = randomBytes(16).toString("hex");
  return [safeSegment(input.kind), ym, `${rand}${ext}`].join("/");
}

export async function writeFileBytes(storageKey: string, bytes: Buffer): Promise<void> {
  const abs = resolveStored(storageKey);
  await mkdir(absDir(abs), { recursive: true });
  // 0o600 — owner read/write only. Defense-in-depth on a shared host.
  await writeFile(abs, bytes, { mode: 0o600, flag: "wx" });
}

export async function readFileBytes(storageKey: string): Promise<Buffer> {
  return readFile(resolveStored(storageKey));
}

export function readStream(storageKey: string): NodeJS.ReadableStream {
  return createReadStream(resolveStored(storageKey));
}

export async function fileExists(storageKey: string): Promise<boolean> {
  try {
    await stat(resolveStored(storageKey));
    return true;
  } catch {
    return false;
  }
}

/** Returns the absolute filesystem path for a key, refusing escape attempts. */
function resolveStored(storageKey: string): string {
  if (storageKey.includes("..") || storageKey.includes("\0")) {
    throw new Error("Refused suspicious storageKey");
  }
  // Normalize separators so a Windows checkout writes the same path
  // shape Linux production reads.
  const normalized = storageKey.split("/").join(sep);
  const abs = resolve(rootDir(), normalized);
  if (!abs.startsWith(rootDir() + sep) && abs !== rootDir()) {
    throw new Error("Refused storageKey outside FILE_STORAGE_ROOT");
  }
  return abs;
}

function absDir(absPath: string): string {
  const parts = absPath.split(sep);
  parts.pop();
  return parts.join(sep);
}

function monthFolder(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function safeSegment(s: string): string {
  // Only allow [a-zA-Z0-9_-]; everything else collapses to "_".
  const cleaned = s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned || "misc";
}
