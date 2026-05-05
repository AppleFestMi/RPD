import { describe, expect, it } from "vitest";
import {
  extractExtension,
  sanitizeFilename,
  validateUpload,
  validationErrorMessage,
} from "@/lib/files/validation";
import { sha256Hex } from "@/lib/files/checksum";

describe("validateUpload — policy kind", () => {
  const base = {
    filename: "uof_v6.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    kind: "policy" as const,
  };

  it("accepts PDF / DOC / DOCX", () => {
    expect(validateUpload(base)).toBeNull();
    expect(
      validateUpload({
        ...base,
        filename: "ord.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBeNull();
    expect(
      validateUpload({
        ...base,
        filename: "ord.doc",
        mimeType: "application/msword",
      }),
    ).toBeNull();
  });

  it("rejects executable extensions outright", () => {
    const r = validateUpload({
      ...base,
      filename: "evil.exe",
      mimeType: "application/octet-stream",
    });
    expect(r?.kind).toBe("blocked-extension");
  });

  it("rejects archives", () => {
    const r = validateUpload({
      ...base,
      filename: "archive.zip",
      mimeType: "application/zip",
    });
    expect(r?.kind).toBe("blocked-extension");
  });

  it("rejects non-allowlist mime even with .pdf extension", () => {
    const r = validateUpload({
      ...base,
      mimeType: "image/png",
    });
    expect(r?.kind).toBe("mime");
  });

  it("rejects allowed mime with non-allowlist extension", () => {
    // .html isn't in BLOCKED_EXTENSIONS but isn't in the policy ext
    // allowlist either — it falls through to the extension check.
    const r = validateUpload({
      ...base,
      filename: "policy.html",
    });
    expect(r?.kind).toBe("extension");
  });

  it("rejects allowlist-foreign mime + extension combo", () => {
    const r = validateUpload({
      ...base,
      filename: "policy.txt",
      mimeType: "text/plain",
    });
    expect(r?.kind).toBe("mime");
  });

  it("rejects size > MAX_UPLOAD_MB", () => {
    const r = validateUpload(
      { ...base, sizeBytes: 50 * 1024 * 1024 },
      { maxBytes: 10 * 1024 * 1024 },
    );
    expect(r?.kind).toBe("size");
    expect(validationErrorMessage(r!)).toMatch(/too large/i);
  });

  it("rejects empty / missing fields", () => {
    expect(validateUpload({ ...base, filename: "" })?.kind).toBe("missing");
    expect(validateUpload({ ...base, mimeType: "" })?.kind).toBe("missing");
    expect(validateUpload({ ...base, sizeBytes: 0 })?.kind).toBe("missing");
  });
});

describe("sanitizeFilename", () => {
  it("strips path components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Windows\\System32\\bad.dll")).toBe("bad.dll");
  });

  it("replaces shell-/Windows-unsafe characters", () => {
    // No path separator in the input — those would split off earlier.
    expect(sanitizeFilename('a"b<c>d|e?f*g.pdf')).toBe("a_b_c_d_e_f_g.pdf");
  });

  it("collapses dot runs and trims leading dots", () => {
    expect(sanitizeFilename("....hidden.pdf")).toBe("hidden.pdf");
    expect(sanitizeFilename("policy..v6.pdf")).toBe("policy.v6.pdf");
  });

  it("never returns empty", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("///")).toBe("file");
  });
});

describe("extractExtension", () => {
  it("returns lowercase including dot", () => {
    expect(extractExtension("Policy.PDF")).toBe(".pdf");
    expect(extractExtension("foo.tar.gz")).toBe(".gz");
    expect(extractExtension("noext")).toBe("");
    expect(extractExtension("trailingdot.")).toBe("");
  });
});

describe("sha256Hex", () => {
  it("produces stable 64-char hex", () => {
    const buf = Buffer.from("abc");
    const h = sha256Hex(buf);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("differs across inputs", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });
});
