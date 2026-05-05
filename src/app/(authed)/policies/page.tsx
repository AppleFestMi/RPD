/**
 * /policies — landing.
 *
 * Filters: all / pinned to "needs my ack" / archived (managers).
 * Visibility is filtered with canSeePolicy so officers never see
 * drafts or archived rows; managers see everything.
 */
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { canSeePolicy } from "@/lib/policies/policy";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/lib/policies/types";
import { policyStatusTone } from "@/lib/policies/badges";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

type Filter = "all" | "unack" | "archived";

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireActor("/policies");
  await requirePermission(actor, "policies.read");

  const sp = await searchParams;
  const filter = (["all", "unack", "archived"] as Filter[]).includes(sp.filter as Filter)
    ? (sp.filter as Filter)
    : "all";

  const canManage = can(actor, "policies.manage");

  const includeArchived = filter === "archived" && canManage;
  const rows = await prisma.policyDocument.findMany({
    where: includeArchived ? { status: "archived" } : { status: { in: ["published"] } },
    include: { acks: { where: { userId: actor.userId }, select: { id: true } } },
    orderBy: [{ effectiveAt: "desc" }],
    take: 200,
  });

  const visible = rows.filter((p) =>
    canSeePolicy(
      { permissionKeys: actor.permissionKeys },
      { status: p.status as PolicyStatus, archivedAt: p.archivedAt },
    ),
  );

  const filtered = visible.filter((p) => {
    if (filter === "unack") return p.requiresAcknowledgment && p.acks.length === 0;
    return true;
  });

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        eyebrow="Policies"
        title="Policy & SOP library"
        description="Versioned department policies and standing orders. Acknowledgments are recorded with the policy version."
        actions={
          canManage ? (
            <Button href="/policies/new" variant="accent" size="md">
              + New policy
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader title="Filters" />
        <CardBody>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <FilterChip filter="all" current={filter}>
              All ({visible.length})
            </FilterChip>
            <FilterChip filter="unack" current={filter}>
              Needs my acknowledgment (
              {visible.filter((p) => p.requiresAcknowledgment && p.acks.length === 0).length})
            </FilterChip>
            {canManage ? (
              <FilterChip filter="archived" current={filter}>
                Archived
              </FilterChip>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Icon.BookOpen size={20} />}
              title={
                filter === "unack"
                  ? "No outstanding acknowledgments"
                  : filter === "archived"
                    ? "No archived policies"
                    : "No policies on file"
              }
              description={
                filter === "all"
                  ? "Policies will appear here as command staff publishes them."
                  : ""
              }
              action={
                filter === "all" && canManage ? (
                  <Button href="/policies/new" variant="accent" size="sm">
                    Upload a policy
                  </Button>
                ) : null
              }
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/policies/${p.id}`}
                className="block rounded-lg border border-line bg-white p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="navy">
                        {p.number} · v{p.version}
                      </Badge>
                      {p.requiresAcknowledgment && p.acks.length === 0 ? (
                        <Badge tone="warn" dot>
                          Action required
                        </Badge>
                      ) : null}
                      {p.requiresAcknowledgment && p.acks.length > 0 ? (
                        <Badge tone="ok">Acknowledged</Badge>
                      ) : null}
                      {p.status !== "published" ? (
                        <Badge tone={policyStatusTone(p.status as PolicyStatus)}>
                          {POLICY_STATUS_LABELS[p.status as PolicyStatus]}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
                      {p.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text3">
                      {p.category ? <span>{p.category}</span> : null}
                      {p.category ? <span aria-hidden="true">·</span> : null}
                      <span>
                        Effective{" "}
                        {p.effectiveAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {p.reviewDate ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Review{" "}
                            {p.reviewDate.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterChip({
  filter,
  current,
  children,
}: {
  filter: Filter;
  current: Filter;
  children: React.ReactNode;
}) {
  const active = filter === current;
  return (
    <Link
      href={filter === "all" ? "/policies" : `/policies?filter=${filter}`}
      className={
        "rounded-full border px-2.5 py-0.5 transition-colors " +
        (active
          ? "border-accent bg-accent text-white"
          : "border-line bg-white text-text2 hover:bg-neutral-soft")
      }
    >
      {children}
    </Link>
  );
}
