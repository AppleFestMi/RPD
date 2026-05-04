/**
 * Tone mapping helpers — translate request status / kind to the UI's
 * shared Badge tone palette so every surface (landing, detail,
 * approvals queue, dashboard) shows the same colors.
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type { RequestKind, RequestStatus } from "./types";

export function statusTone(s: RequestStatus): BadgeTone {
  switch (s) {
    case "approved":
      return "ok";
    case "denied":
      return "danger";
    case "submitted":
      return "info";
    case "supervisorReview":
    case "commandReview":
      return "pending";
    case "needsMoreInfo":
      return "warn";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export function kindTone(k: RequestKind): BadgeTone {
  switch (k) {
    case "timeOff":
      return "info";
    case "training":
      return "pending";
    case "vehicleIssue":
      return "warn";
    case "equipment":
      return "neutral";
    case "itFacilities":
      return "neutral";
    case "shiftSwap":
      return "info";
  }
}
