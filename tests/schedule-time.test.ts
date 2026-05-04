import { describe, expect, it } from "vitest";
import {
  formatRange,
  formatTime,
  parseTimeToMinute,
  slotsOverlap,
  startOfWeek,
  utcMidnight,
} from "@/lib/schedule/time";

describe("schedule time helpers", () => {
  it("formats minutes to HH:MM", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(7 * 60)).toBe("07:00");
    expect(formatTime(23 * 60 + 59)).toBe("23:59");
  });

  it("formats overnight ranges with day suffix", () => {
    expect(formatRange(7 * 60, 17 * 60)).toBe("07:00–17:00");
    expect(formatRange(21 * 60, 27 * 60)).toMatch(/21:00–03:00 \(\+1d\)/);
  });

  it("parses 24h and 12h forms", () => {
    expect(parseTimeToMinute("07:00")).toBe(420);
    expect(parseTimeToMinute("23:59")).toBe(23 * 60 + 59);
    expect(parseTimeToMinute("12:00 AM")).toBe(0);
    expect(parseTimeToMinute("12:30 PM")).toBe(12 * 60 + 30);
    expect(parseTimeToMinute("3:15 pm")).toBe(15 * 60 + 15);
    expect(parseTimeToMinute("nope")).toBeNull();
    expect(parseTimeToMinute("25:00")).toBeNull();
  });

  it("slotsOverlap: simple overlap", () => {
    const day = new Date("2026-05-04T00:00:00Z");
    const a = { date: day, startMinute: 7 * 60, endMinute: 17 * 60 };
    const b = { date: day, startMinute: 16 * 60, endMinute: 20 * 60 };
    expect(slotsOverlap(a, b)).toBe(true);
  });

  it("slotsOverlap: adjacent (a.end === b.start) does not overlap", () => {
    const day = new Date("2026-05-04T00:00:00Z");
    const a = { date: day, startMinute: 7 * 60, endMinute: 17 * 60 };
    const b = { date: day, startMinute: 17 * 60, endMinute: 22 * 60 };
    expect(slotsOverlap(a, b)).toBe(false);
  });

  it("slotsOverlap: overnight crossing midnight overlaps next-day morning", () => {
    const d1 = new Date("2026-05-04T00:00:00Z");
    const d2 = new Date("2026-05-05T00:00:00Z");
    const a = { date: d1, startMinute: 21 * 60, endMinute: 31 * 60 }; // 21:00–07:00 next day
    const b = { date: d2, startMinute: 6 * 60, endMinute: 10 * 60 }; // 06:00–10:00 next day
    expect(slotsOverlap(a, b)).toBe(true);
  });

  it("startOfWeek anchors to Monday UTC", () => {
    // 2026-05-04 is a Monday; 2026-05-05 is Tuesday.
    const sun = new Date("2026-05-10T18:00:00Z");
    const mon = startOfWeek(sun);
    expect(mon.getUTCDay()).toBe(1); // Monday
    expect(mon.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("utcMidnight strips time", () => {
    const d = new Date("2026-05-04T17:42:13Z");
    expect(utcMidnight(d).toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });
});
