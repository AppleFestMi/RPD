import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

describe("AES-GCM envelope encryption", () => {
  it("round-trips a secret", () => {
    const plain = "JBSWY3DPEHPK3PXP";
    const ct = encryptSecret(plain);
    expect(ct).not.toContain(plain);
    expect(ct.startsWith("v1.")).toBe(true);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("produces unique ciphertexts for the same plaintext (random nonce)", () => {
    const a = encryptSecret("identical");
    const b = encryptSecret("identical");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("rejects tampered ciphertext", () => {
    const ct = encryptSecret("x");
    const broken = ct.replace(/.$/, ct.endsWith("a") ? "b" : "a");
    expect(() => decryptSecret(broken)).toThrow();
  });
});
