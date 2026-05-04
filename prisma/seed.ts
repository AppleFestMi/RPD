/**
 * Seed script — fictional data only.
 *
 * Creates:
 *   - The full permission catalog (mirroring src/lib/permissions/catalog.ts).
 *   - System roles with default permission sets.
 *   - One SystemAdmin user with a one-time invitation.
 *
 * It does NOT create any operational records (shifts, requests, events).
 * Use the admin UI for that, so every record carries a real audit trail.
 *
 * Run:   npm run db:seed
 *
 * Required env at run time:
 *   - SEED_ADMIN_EMAIL    (no default)
 *   - SEED_ADMIN_PASSWORD (no default — temp; user must reset on first login)
 *
 * The script refuses to run if either is missing.
 */

import { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG, ROLE_PRESETS } from "../src/lib/permissions/catalog";
import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "seed: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required (one-time bootstrap).",
    );
  }
  if (adminPassword.length < 12) {
    throw new Error("seed: SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  console.warn("Seeding permissions...");
  for (const p of PERMISSION_CATALOG) {
    const description = p.description ?? null;
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description },
      create: { key: p.key, label: p.label, description },
    });
  }

  console.warn("Seeding roles...");
  for (const preset of ROLE_PRESETS) {
    const role = await prisma.role.upsert({
      where: { key: preset.key },
      update: { label: preset.label, description: preset.description ?? null, isSystem: true },
      create: {
        key: preset.key,
        label: preset.label,
        description: preset.description ?? null,
        isSystem: true,
      },
    });

    // Reset role permissions to match catalog (idempotent).
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of preset.permissions) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!perm) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  console.warn("Seeding bootstrap SystemAdmin...");
  const passwordHash = await hashPassword(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: {
      email: adminEmail.toLowerCase(),
      name: "System Administrator",
      passwordHash,
      forcePasswordReset: true,
      invitedAt: new Date(),
      activatedAt: new Date(),
    },
  });

  const sysadminRole = await prisma.role.findUnique({ where: { key: "systemAdmin" } });
  if (sysadminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: sysadminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: sysadminRole.id, grantedBy: "seed" },
    });
  }

  // Optional: schedule fixture for development. Set SEED_SCHEDULE=1 to run.
  // Idempotent within a week — wipes existing draft shifts in the seeded
  // window before re-creating. Never run in production.
  if (process.env.SEED_SCHEDULE === "1") {
    await seedScheduleFixture(admin.id);
  }

  console.warn("Seed complete.");
  console.warn(
    "Admin must change password on first login. Enroll MFA before granting other roles.",
  );
}

/**
 * Schedule fixture: 1 week of fictional shifts + open shifts + availability.
 *
 * Names are illustrative only. No real data. Notes are administrative-only;
 * see docs/DATA_BOUNDARIES.md.
 */
async function seedScheduleFixture(adminUserId: string) {
  const startOfWeek = (d: Date) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (m.getUTCDay() + 6) % 7;
    m.setUTCDate(m.getUTCDate() - dow);
    return m;
  };
  const monday = startOfWeek(new Date());
  const day = (n: number) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const wkEnd = day(7);

  console.warn("Seeding 1 week of fictional schedule data starting", monday.toISOString().slice(0, 10));

  // Wipe any existing drafts in the window so re-runs are idempotent. We
  // never touch published rows.
  await prisma.openShiftApplication.deleteMany({
    where: { openShift: { date: { gte: monday, lt: wkEnd } } },
  });
  await prisma.openShift.deleteMany({ where: { date: { gte: monday, lt: wkEnd } } });
  await prisma.scheduleAssignment.deleteMany({
    where: { shift: { date: { gte: monday, lt: wkEnd }, status: "draft" } },
  });
  await prisma.scheduleShift.deleteMany({
    where: { date: { gte: monday, lt: wkEnd }, status: "draft" },
  });
  await prisma.availabilityBlock.deleteMany({
    where: { userId: adminUserId, date: { gte: monday, lt: wkEnd } },
  });

  type ShiftDef = {
    dayIndex: number;
    label: string;
    category: string;
    startMinute: number;
    endMinute: number;
    location?: string;
    notes?: string;
  };
  const shifts: ShiftDef[] = [
    // Patrol Mon–Fri days
    ...[0, 1, 2, 3, 4].map<ShiftDef>((i) => ({
      dayIndex: i, label: "Patrol 1st", category: "patrol", startMinute: 7 * 60, endMinute: 17 * 60, location: "City-wide",
    })),
    // Patrol 2nd Mon–Fri evenings
    ...[0, 1, 2, 3, 4].map<ShiftDef>((i) => ({
      dayIndex: i, label: "Patrol 2nd", category: "patrol", startMinute: 17 * 60, endMinute: 27 * 60, location: "City-wide",
    })),
    // Patrol 3rd nights
    ...[0, 1, 2, 3, 4, 5].map<ShiftDef>((i) => ({
      dayIndex: i, label: "Patrol 3rd", category: "patrol", startMinute: 21 * 60, endMinute: 31 * 60, location: "City-wide",
    })),
    // Dispatch shifts
    ...[0, 1, 2, 3, 4, 5, 6].map<ShiftDef>((i) => ({
      dayIndex: i, label: "Dispatch 1st", category: "dispatch", startMinute: 7 * 60, endMinute: 15 * 60, location: "Comm Center",
    })),
    // Reserves Fri/Sat
    { dayIndex: 4, label: "Reserve detail", category: "reserve", startMinute: 17 * 60, endMinute: 27 * 60, location: "City-wide", notes: "Reserve coverage requested" },
    { dayIndex: 5, label: "Reserve detail", category: "reserve", startMinute: 17 * 60, endMinute: 27 * 60, location: "City-wide" },
    // Training day Wed
    { dayIndex: 2, label: "Range qualification", category: "training", startMinute: 8 * 60, endMinute: 16 * 60, location: "Range" },
    // Special event Sat
    { dayIndex: 5, label: "Farmer's Market detail", category: "event", startMinute: 17 * 60, endMinute: 22 * 60, location: "Town Square", notes: "Special event staffing" },
    // Court appearance Mon
    { dayIndex: 0, label: "Court appearance", category: "court", startMinute: 9 * 60, endMinute: 11 * 60, notes: "See official court system" },
  ];

  for (const s of shifts) {
    await prisma.scheduleShift.create({
      data: {
        date: day(s.dayIndex),
        label: s.label,
        category: s.category,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        location: s.location ?? null,
        notes: s.notes ?? null,
        status: "draft",
        createdById: adminUserId,
      },
    });
  }

  // Open shifts: an OT slot Thursday and a reserve Saturday.
  await prisma.openShift.create({
    data: {
      date: day(3),
      startMinute: 17 * 60,
      endMinute: 27 * 60,
      post: "Patrol 2nd — coverage",
      location: "City-wide",
      type: "ot",
      status: "open",
      eligibilityRole: "officer",
      notes: "Smith out — mandatory training",
      createdById: adminUserId,
    },
  });
  await prisma.openShift.create({
    data: {
      date: day(5),
      startMinute: 21 * 60,
      endMinute: 31 * 60,
      post: "Reserve 3rd",
      location: "City-wide",
      type: "reserve",
      status: "open",
      eligibilityRole: "reserveOfficer",
      notes: "Sign-up at monthly meeting",
      createdById: adminUserId,
    },
  });

  // Availability for the seed admin (purely illustrative).
  await prisma.availabilityBlock.createMany({
    data: [
      { userId: adminUserId, date: day(4), startMinute: 17 * 60, endMinute: 23 * 60, state: "preferred", notes: "Friday detail" },
      { userId: adminUserId, date: day(5), startMinute: 17 * 60, endMinute: 23 * 60, state: "available" },
      { userId: adminUserId, date: day(6), startMinute: 0, endMinute: 23 * 60, state: "unavailable" },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
