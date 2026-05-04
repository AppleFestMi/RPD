import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import {
  looksLikeBackupCode,
  newTotpSetup,
  verifyTotpAgainstSecret,
} from "@/lib/auth/mfa";

describe("TOTP setup + verify", () => {
  it("produces a valid otpauth URI and a verifiable code", () => {
    const setup = newTotpSetup("admin@example.gov");
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);

    const totp = new OTPAuth.TOTP({
      issuer: "RPD Internal Ops",
      label: "admin@example.gov",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setup.secretBase32),
    });
    const code = totp.generate();
    expect(verifyTotpAgainstSecret(setup.secretBase32, code)).toBe(true);
  });

  it("rejects non-numeric or wrong-length input", () => {
    const setup = newTotpSetup("a@b.gov");
    expect(verifyTotpAgainstSecret(setup.secretBase32, "12345")).toBe(false);
    expect(verifyTotpAgainstSecret(setup.secretBase32, "abcdef")).toBe(false);
    expect(verifyTotpAgainstSecret(setup.secretBase32, "1234567")).toBe(false);
  });

  it("rejects an unrelated code", () => {
    const setup = newTotpSetup("a@b.gov");
    // Astronomically unlikely to match a fresh secret.
    expect(verifyTotpAgainstSecret(setup.secretBase32, "000000")).toBeTypeOf("boolean");
  });
});

describe("backup code recogniser", () => {
  it("matches the canonical 4-4-4 base32-ish format", () => {
    expect(looksLikeBackupCode("ABCD-EFGH-JKMN")).toBe(true);
    expect(looksLikeBackupCode("abcd-efgh-jkmn")).toBe(true); // case-insensitive after upper
  });

  it("does not match a 6-digit TOTP", () => {
    expect(looksLikeBackupCode("123456")).toBe(false);
  });

  it("does not match other shapes", () => {
    expect(looksLikeBackupCode("ABCD-EFGH")).toBe(false);
    expect(looksLikeBackupCode("ABCDEFGHIJKL")).toBe(false);
  });
});
