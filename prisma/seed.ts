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
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description: p.description ?? null },
      create: { key: p.key, label: p.label, description: p.description ?? null },
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

  console.warn("Seed complete.");
  console.warn(
    "Admin must change password on first login. Enroll MFA before granting other roles.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
