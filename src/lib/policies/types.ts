/**
 * Policies module — runtime-agnostic types. The Prisma enum mirrors are
 * deliberate (insulates UI/test code from import-shape drift).
 */

export type PolicyStatus = "draft" | "published" | "archived";

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/**
 * UI-curated category list. The DB column is free-text so adding a
 * category doesn't require a migration. Categories may *name* sensitive
 * subject areas (e.g. Body-Worn Camera Policy) — the actual document
 * content must remain administrative policy, not evidence or footage.
 */
export const POLICY_CATEGORIES = [
  "General Orders",
  "Patrol Procedures",
  "Use of Force",
  "Vehicle Pursuit",
  "Body-Worn Camera Policy",
  "Evidence Procedure",
  "Training",
  "Equipment",
  "Administrative",
  "Emergency Management",
  "Other",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];
