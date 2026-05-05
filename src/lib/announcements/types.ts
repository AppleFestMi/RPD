/**
 * Announcement domain types — runtime-agnostic, importable from anywhere
 * (server actions, pages, vitest). Mirrors the Prisma enums one-for-one
 * to avoid import-shape drift between Prisma releases.
 */

export type AnnouncementStatus = "draft" | "published" | "archived";

export type AnnouncementPriority = "normal" | "important" | "urgent";

export type AudienceScope =
  | "all"
  | "sworn"
  | "patrol"
  | "reserves"
  | "dispatch"
  | "supervisorsOnly"
  | "command"
  | "admin";

/**
 * Audience labels exposed in the UI. Categories the schema still supports
 * but the UI does not advertise (`patrol` and `dispatch`) are kept here
 * so historical announcements still render correctly.
 */
export const AUDIENCE_LABELS: Record<AudienceScope, string> = {
  all: "All staff",
  sworn: "Sworn",
  patrol: "Patrol",
  reserves: "Reserve officers",
  dispatch: "Dispatch",
  supervisorsOnly: "Supervisors",
  command: "Command staff",
  admin: "Admin staff",
};

/** The audiences exposed in the create-announcement form. */
export const AUDIENCE_OPTIONS: AudienceScope[] = [
  "all",
  "sworn",
  "reserves",
  "supervisorsOnly",
  "command",
  "admin",
];

export const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/**
 * UI-curated category list. The DB column is a free-text string for
 * forward compatibility — the form just emits one of these strings.
 */
export const CATEGORIES = [
  "General",
  "Shift Briefing",
  "Training Notice",
  "Policy Update",
  "Schedule Notice",
  "Equipment / Vehicle Notice",
  "Special Event",
  "Administrative",
] as const;

export type Category = (typeof CATEGORIES)[number];
