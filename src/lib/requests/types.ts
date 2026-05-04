/**
 * Public types for the Requests module — kept narrow and Prisma-free so
 * helpers and tests don't need a database connection to import them.
 *
 * The strings match the Prisma enums one-for-one; the duplication is a
 * deliberate choice (Prisma enum types have shifted across releases and
 * we don't want a publishing surprise to ripple into UI code).
 */

export type RequestKind =
  | "timeOff"
  | "training"
  | "shiftSwap"
  | "equipment"
  | "vehicleIssue"
  | "itFacilities";

export type RequestStatus =
  | "submitted"
  | "supervisorReview"
  | "commandReview"
  | "approved"
  | "denied"
  | "needsMoreInfo"
  | "cancelled";

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  timeOff: "Time off",
  training: "Training",
  shiftSwap: "Shift swap",
  equipment: "Equipment",
  vehicleIssue: "Vehicle issue",
  itFacilities: "IT / Facilities",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  supervisorReview: "Supervisor review",
  commandReview: "Command review",
  approved: "Approved",
  denied: "Denied",
  needsMoreInfo: "Needs more info",
  cancelled: "Cancelled",
};

/** Statuses that count as "open" — visible on the actor's pending list. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "supervisorReview",
  "commandReview",
  "needsMoreInfo",
];

/** Statuses that count as "decided" / closed for status-summary cards. */
export const DECIDED_REQUEST_STATUSES: RequestStatus[] = [
  "approved",
  "denied",
  "cancelled",
];
