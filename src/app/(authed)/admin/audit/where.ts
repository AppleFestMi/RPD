/**
 * Pure builder for the audit log Prisma `where` clause.
 *
 * Lives outside actions.ts because Next.js requires every export of a
 * "use server" file to be an async function. Keeping this builder pure
 * also makes it trivially unit-testable (see tests/audit-where.test.ts).
 */
import type { Prisma } from "@prisma/client";

export type AuditFilter = {
  from?: string | undefined;
  to?: string | undefined;
  eventType?: string | undefined;
  result?: "success" | "failure" | "denied" | undefined;
  actorUserId?: string | undefined;
  entityType?: string | undefined;
};

export function buildWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  const conds: Prisma.AuditLogWhereInput[] = [];
  if (filter.from) conds.push({ createdAt: { gte: new Date(filter.from) } });
  if (filter.to) conds.push({ createdAt: { lte: new Date(filter.to) } });
  if (filter.eventType) conds.push({ eventType: filter.eventType });
  if (filter.result) conds.push({ result: filter.result });
  if (filter.actorUserId) conds.push({ actorUserId: filter.actorUserId });
  if (filter.entityType) conds.push({ entityType: filter.entityType });
  if (conds.length === 0) return {};
  return { AND: conds };
}
