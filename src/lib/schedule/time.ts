/**
 * Time helpers for the schedule module.
 *
 * The schedule stores shifts as (date, startMinute, endMinute) where the
 * minutes count from 00:00 of `date` and may exceed 1440 to indicate an
 * overnight shift (e.g. 21:00–07:00 → start=1260, end=1860).
 *
 * Pure functions — no Date side effects, no timezone surprises.
 */

export type Slot = {
  /** Calendar day at midnight UTC (the shift's "logical" date). */
  date: Date;
  /** Minutes from 00:00. 0..1439. */
  startMinute: number;
  /** Minutes from 00:00. > startMinute. May exceed 1440 for overnight. */
  endMinute: number;
};

const MS_PER_MINUTE = 60_000;

/** Combine (date midnight + minute offset) into an absolute UTC instant. */
export function slotStart(slot: Slot): number {
  return slot.date.getTime() + slot.startMinute * MS_PER_MINUTE;
}
export function slotEnd(slot: Slot): number {
  return slot.date.getTime() + slot.endMinute * MS_PER_MINUTE;
}

/**
 * Two slots overlap iff one starts strictly before the other ends.
 * Adjacent boundaries (a.end === b.start) are NOT considered overlapping.
 */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return slotStart(a) < slotEnd(b) && slotStart(b) < slotEnd(a);
}

/** Format minutes-from-midnight as "HH:MM" (clamped to 24h for display). */
export function formatTime(minute: number): string {
  const m = ((minute % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "07:00–17:00" or "21:00–03:00 (next day)" if overnight. */
export function formatRange(start: number, end: number): string {
  const overnight = end >= 24 * 60;
  return overnight
    ? `${formatTime(start)}–${formatTime(end)} (+${Math.floor(end / (24 * 60))}d)`
    : `${formatTime(start)}–${formatTime(end)}`;
}

/** "07:00 AM" → 420; "5:00 PM" → 1020; "7p" → null. Strict but forgiving. */
export function parseTimeToMinute(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  // "HH:MM" 24-hour
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }
  // "h:mm AM/PM"
  const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(s);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2]);
    const isPm = m12[3]!.toLowerCase() === "pm";
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (h === 12) h = 0;
    if (isPm) h += 12;
    return h * 60 + m;
  }
  return null;
}

/** Calendar day at UTC midnight. Defensive against timezones in inputs. */
export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday-based week start in UTC. */
export function startOfWeek(d: Date): Date {
  const m = utcMidnight(d);
  const dow = (m.getUTCDay() + 6) % 7; // 0 = Mon
  m.setUTCDate(m.getUTCDate() - dow);
  return m;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
