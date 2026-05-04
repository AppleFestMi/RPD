/**
 * Permission catalog — the single source of truth.
 *
 * The Prisma `Permission` table mirrors this list (seeded by prisma/seed.ts).
 * Code reaches for `PERMISSIONS.<area>.<verb>`; database role grants reference
 * the string keys ("schedule.publish") stored on `Permission.key`.
 *
 * Adding a permission:
 *   1. Add it here.
 *   2. Re-run `npm run db:seed` (idempotent — will upsert).
 *   3. Reference it via the typed const in code.
 *
 * Never read permission strings from user-typed input.
 */

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

export const PERMISSION_CATALOG = [
  // Schedule
  { key: "schedule.read",            label: "Read schedule" },
  { key: "schedule.create",          label: "Create schedule entries" },
  { key: "schedule.update",          label: "Update schedule entries" },
  { key: "schedule.publish",         label: "Publish schedule" },
  { key: "schedule.approvePickup",   label: "Approve open-shift pickups" },
  { key: "schedule.requestPickup",   label: "Apply for open shifts" },
  { key: "schedule.swap.request",    label: "Request shift swap" },
  { key: "schedule.swap.approve",    label: "Approve shift swap" },

  // Availability
  { key: "availability.read.own",    label: "Read own availability" },
  { key: "availability.manage.own",  label: "Manage own availability" },
  { key: "availability.read.all",    label: "Read all availability" },

  // Requests
  { key: "requests.create",                label: "Create requests" },
  { key: "requests.read.own",              label: "Read own requests" },
  { key: "requests.read.all",              label: "Read all requests" },
  { key: "requests.approve.supervisor",    label: "Approve at supervisor level" },
  { key: "requests.approve.command",       label: "Approve at command level" },

  // Announcements
  { key: "announcements.read",        label: "Read announcements" },
  { key: "announcements.create",      label: "Draft announcements" },
  { key: "announcements.publish",     label: "Publish announcements" },

  // Policies
  { key: "policies.read",            label: "Read policies" },
  { key: "policies.manage",          label: "Manage policies (upload/edit/version)" },
  { key: "policies.acknowledge",     label: "Acknowledge policies" },

  // Training
  { key: "training.read.own",        label: "Read own training records" },
  { key: "training.read.all",        label: "Read all training records" },
  { key: "training.manage",          label: "Manage training catalog and records" },

  // Equipment
  { key: "equipment.request",        label: "Request equipment" },
  { key: "equipment.manage",         label: "Manage equipment inventory and assignments" },

  // Vehicles
  { key: "vehicles.reportIssue",     label: "Report a vehicle issue" },
  { key: "vehicles.manage",          label: "Manage fleet and issues" },

  // Special events
  { key: "events.read",              label: "Read special events" },
  { key: "events.manage",            label: "Plan and staff special events" },

  // Directory
  { key: "directory.read",           label: "Read directory" },

  // Admin
  { key: "admin.users.manage",       label: "Manage users (invite, disable, force reset)" },
  { key: "admin.roles.manage",       label: "Manage roles and permissions" },
  { key: "admin.mfa.reset",          label: "Reset MFA for another user" },
  { key: "admin.users.unlock",       label: "Unlock a locked-out account" },

  // Audit
  { key: "audit.read",               label: "Read audit log" },
  { key: "audit.export",             label: "Export audit log" },
] as const satisfies readonly { key: string; label: string; description?: string }[];

/**
 * Default role → permission mapping. The seed script writes these to
 * Role / RolePermission. Admin actions in the UI can later modify role
 * grants (and that change is audit-logged) without re-running the seed.
 */
type RolePreset = {
  key: string;
  label: string;
  description?: string;
  permissions: PermissionKey[];
};

export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    key: "officer",
    label: "Officer",
    description: "Full-time sworn personnel.",
    permissions: [
      "schedule.read",
      "schedule.requestPickup",
      "schedule.swap.request",
      "availability.read.own",
      "availability.manage.own",
      "requests.create",
      "requests.read.own",
      "announcements.read",
      "policies.read",
      "policies.acknowledge",
      "training.read.own",
      "equipment.request",
      "vehicles.reportIssue",
      "events.read",
      "directory.read",
    ],
  },
  {
    key: "reserveOfficer",
    label: "Reserve Officer",
    description: "Reserve unit.",
    permissions: [
      "schedule.read",
      "schedule.requestPickup",
      "availability.read.own",
      "availability.manage.own",
      "requests.create",
      "requests.read.own",
      "announcements.read",
      "policies.read",
      "policies.acknowledge",
      "training.read.own",
      "events.read",
      "directory.read",
    ],
  },
  {
    key: "dispatcher",
    label: "Dispatcher",
    description: "Civilian dispatch.",
    permissions: [
      "schedule.read",
      "availability.read.own",
      "availability.manage.own",
      "requests.create",
      "requests.read.own",
      "announcements.read",
      "policies.read",
      "policies.acknowledge",
      "training.read.own",
      "directory.read",
    ],
  },
  {
    key: "supervisor",
    label: "Supervisor",
    description: "Sergeants. Supervisor-level approvals.",
    permissions: [
      "schedule.read",
      "schedule.create",
      "schedule.update",
      "schedule.publish",
      "schedule.approvePickup",
      "schedule.swap.approve",
      "availability.read.own",
      "availability.manage.own",
      "availability.read.all",
      "requests.create",
      "requests.read.own",
      "requests.read.all",
      "requests.approve.supervisor",
      "announcements.read",
      "announcements.create",
      "policies.read",
      "policies.acknowledge",
      "training.read.own",
      "training.read.all",
      "equipment.request",
      "vehicles.reportIssue",
      "vehicles.manage",
      "events.read",
      "events.manage",
      "directory.read",
    ],
  },
  {
    key: "commandStaff",
    label: "Command Staff",
    description: "Lieutenants and above.",
    permissions: [
      "schedule.read",
      "schedule.create",
      "schedule.update",
      "schedule.publish",
      "schedule.approvePickup",
      "schedule.swap.approve",
      "availability.read.all",
      "requests.read.all",
      "requests.approve.supervisor",
      "requests.approve.command",
      "announcements.read",
      "announcements.create",
      "announcements.publish",
      "policies.read",
      "policies.manage",
      "policies.acknowledge",
      "training.read.all",
      "training.manage",
      "equipment.manage",
      "vehicles.manage",
      "events.read",
      "events.manage",
      "directory.read",
    ],
  },
  {
    key: "admin",
    label: "Department Admin",
    description: "Administrative users; manages people and operational records.",
    permissions: [
      "schedule.read",
      "schedule.create",
      "schedule.update",
      "schedule.publish",
      "availability.read.all",
      "requests.read.all",
      "announcements.read",
      "announcements.create",
      "announcements.publish",
      "policies.read",
      "policies.manage",
      "training.read.all",
      "training.manage",
      "equipment.manage",
      "vehicles.manage",
      "events.read",
      "events.manage",
      "directory.read",
      "admin.users.manage",
      "admin.users.unlock",
    ],
  },
  {
    key: "systemAdmin",
    label: "System Admin",
    description: "IT/system administrator. Manages roles, settings, MFA resets.",
    permissions: PERMISSION_CATALOG.map((p) => p.key) as PermissionKey[],
  },
  {
    key: "auditorReadOnly",
    label: "Auditor (read-only)",
    description: "Read-only access to audit, settings, and role history.",
    permissions: [
      "audit.read",
      "audit.export",
      "directory.read",
      "announcements.read",
      "policies.read",
    ],
  },
] as const;
