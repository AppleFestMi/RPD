import { describe, expect, it, afterEach } from "vitest";
import { newRequestId } from "@/lib/security/request-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("newRequestId", () => {
  it("returns a UUID v4 string", () => {
    expect(newRequestId()).toMatch(UUID_V4);
  });

  it("returns unique values across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(newRequestId());
    expect(seen.size).toBe(50);
  });

  describe("fallback path (no randomUUID)", () => {
    const realCrypto = globalThis.crypto;

    afterEach(() => {
      Object.defineProperty(globalThis, "crypto", {
        value: realCrypto,
        configurable: true,
      });
    });

    it("derives a UUID v4 from getRandomValues when randomUUID is absent", () => {
      Object.defineProperty(globalThis, "crypto", {
        value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
        configurable: true,
      });
      const id = newRequestId();
      expect(id).toMatch(UUID_V4);
    });

    it("throws if no Web Crypto source exists", () => {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      expect(() => newRequestId()).toThrow(/Web Crypto/);
    });
  });
});
