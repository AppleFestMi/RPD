import { describe, expect, it } from "vitest";
import { notesErrorMessage, validateNotes } from "@/lib/schedule/notes";

describe("schedule note boundary validator", () => {
  it("accepts administrative notes", () => {
    const cases = [
      "Reserve coverage requested",
      "Training day — range qualification",
      "Special event staffing — Town Square Farmer's Market",
      "Court appearance — see official court system",
      "",
      undefined,
      null,
    ];
    for (const c of cases) {
      expect(validateNotes(c as string | null | undefined).ok).toBe(true);
    }
  });

  it("rejects case-number references", () => {
    const v = validateNotes("Officer Walker subpoena for case # 24-CR-0142");
    expect(v.ok).toBe(false);
    expect(notesErrorMessage(v)).toContain("case number reference");
  });

  it("rejects subject references", () => {
    const v = validateNotes("Witness statement received from victim");
    expect(v.ok).toBe(false);
  });

  it("rejects LEIN/NCIC references", () => {
    const v = validateNotes("Run LEIN before reporting");
    expect(v.ok).toBe(false);
  });

  it("rejects BOLO content", () => {
    const v = validateNotes("BOLO for blue F-150");
    expect(v.ok).toBe(false);
  });

  it("rejects plate run references", () => {
    const v = validateNotes("Tag ABC123 came back stolen");
    expect(v.ok).toBe(false);
  });

  it("rejects DOB references", () => {
    const v = validateNotes("DOB 01/02/1990");
    expect(v.ok).toBe(false);
  });

  it("rejects evidence chain references", () => {
    const v = validateNotes("Evidence locker disposition pending");
    expect(v.ok).toBe(false);
  });

  it("rejects very long notes", () => {
    const v = validateNotes("a".repeat(1500));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.tooLong).toBe(true);
  });
});
