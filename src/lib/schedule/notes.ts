/**
 * Schedule note boundary validator.
 *
 * Schedule notes are administrative-only. We do NOT attempt to detect every
 * possible CJI/CAD/RMS leak — that's a policy + training problem. What we
 * CAN do is reject the obviously-prohibited shapes so a typo or a habit
 * doesn't slip through. False positives are cheap (just edit the note);
 * false negatives are the dangerous failure mode.
 *
 * This is one defense layer. The other is the persistent boundary notice
 * in the UI and form-level warnings, which have the same authoritative
 * wording as docs/DATA_BOUNDARIES.md.
 */

const PROHIBITED_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  { pattern: /\bcase\s*(no\.?|number|#)\s*[\w-]+/i, reason: "case number reference" },
  { pattern: /\bincident\s*(no\.?|number|#|id)\s*[\w-]+/i, reason: "incident number reference" },
  { pattern: /\b(lein|ncic|cjis|chri|criminal\s+history)\b/i, reason: "CJIS/CHRI reference" },
  { pattern: /\b(suspect|defendant|victim|witness|juvenile)\b/i, reason: "subject reference" },
  { pattern: /\bbolo\s+for\b/i, reason: "BOLO content" },
  { pattern: /\b(plate|tag)\s+[A-Z0-9]{3,}/i, reason: "plate run reference" },
  { pattern: /\bdob\s*[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i, reason: "DOB reference" },
  { pattern: /\bssn\s*[:\s]*\d{3}-?\d{2}-?\d{4}/i, reason: "SSN reference" },
  { pattern: /\bevidence\s+(item|tag|locker|disposition)\b/i, reason: "evidence chain reference" },
  { pattern: /\bdispatched\s+to\s+\d/i, reason: "dispatch call detail" },
];

const MAX_LEN = 1000;

export type NoteValidation =
  | { ok: true }
  | { ok: false; reasons: string[]; tooLong?: boolean };

export function validateNotes(notes: string | null | undefined): NoteValidation {
  if (!notes) return { ok: true };
  const reasons: string[] = [];
  for (const { pattern, reason } of PROHIBITED_PATTERNS) {
    if (pattern.test(notes)) reasons.push(reason);
  }
  const tooLong = notes.length > MAX_LEN;
  if (reasons.length === 0 && !tooLong) return { ok: true };
  return { ok: false, reasons, ...(tooLong ? { tooLong: true } : {}) };
}

/**
 * Friendly user-facing error string.
 */
export function notesErrorMessage(v: NoteValidation): string | null {
  if (v.ok) return null;
  const parts: string[] = [];
  if (v.reasons.length > 0) {
    parts.push(
      `Note contains content that looks like ${v.reasons.join(", ")}. ` +
        `This portal is administrative-only; remove case/incident/subject references and try again.`,
    );
  }
  if (v.tooLong) parts.push(`Note is too long (max ${MAX_LEN} characters).`);
  return parts.join(" ");
}
