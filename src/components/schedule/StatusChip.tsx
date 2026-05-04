/**
 * Status chip used across schedule, open shifts, swaps, time-off.
 *
 * The visual mapping mirrors the prototype: ok=green, warn=amber, info=blue,
 * danger=red, pending=violet, neutral=grey.
 */
type Tone = "ok" | "warn" | "danger" | "info" | "pending" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  pending: "bg-pending-soft text-pending",
  neutral: "bg-neutral-soft text-neutral",
};

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11.5px] font-medium ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}

export function shiftStatusTone(s: string): Tone {
  switch (s) {
    case "published":
      return "ok";
    case "draft":
      return "neutral";
    case "changed":
      return "info";
    case "cancelled":
      return "danger";
    case "archived":
      return "neutral";
    default:
      return "neutral";
  }
}

export function openShiftStatusTone(s: string): Tone {
  switch (s) {
    case "open":
      return "warn";
    case "filled":
      return "ok";
    case "closed":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function appDecisionTone(s: string): Tone {
  switch (s) {
    case "approved":
      return "ok";
    case "denied":
      return "danger";
    case "pending":
      return "pending";
    case "submitted":
      return "info";
    case "supervisorReview":
      return "pending";
    case "acceptedByReplacement":
      return "info";
    case "withdrawn":
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}
