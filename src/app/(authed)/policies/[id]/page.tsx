import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { canSeePolicy } from "@/lib/policies/policy";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/lib/policies/types";
import { policyStatusTone } from "@/lib/policies/badges";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { Icon } from "@/components/ui/Icons";
import { PolicyAckPanel } from "./PolicyAckPanel";
import { PolicyManageActions } from "./PolicyManageActions";

export const dynamic = "force-dynamic";

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor("/policies");
  await requirePermission(actor, "policies.read");
  const { id } = await params;

  const p = await prisma.policyDocument.findUnique({
    where: { id },
    include: {
      file: true,
      acks: {
        include: { user: { select: { name: true, badge: true } } },
        orderBy: { acknowledgedAt: "asc" },
        take: 200,
      },
    },
  });
  if (!p) notFound();

  const visible = canSeePolicy(
    { permissionKeys: actor.permissionKeys },
    { status: p.status as PolicyStatus, archivedAt: p.archivedAt },
  );
  if (!visible) notFound();

  const myAck = p.acks.find((a) => a.userId === actor.userId) ?? null;
  const canManage = can(actor, "policies.manage");
  const canPublish = can(actor, "policies.publish");
  const canAck = can(actor, "policies.acknowledge");
  const canDownload = can(actor, "files.download");

  if (canManage && p.acks.length > 0) {
    const h = await headers();
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.POLICY_ACK_VIEWED,
      entityType: "PolicyDocument",
      entityId: p.id,
      action: "view",
      result: "success",
      requestId: h.get("x-request-id"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
      metadata: { ackCount: p.acks.length },
    });
  }

  const status = p.status as PolicyStatus;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/policies" className="text-[13px] text-text3 hover:text-text2">
        ← All policies
      </Link>

      <PageHeader
        eyebrow={p.category ?? "Policy"}
        title={p.title}
        description={
          <span className="font-mono text-[12px] text-text3">
            #{p.number} · v{p.version} · effective{" "}
            {p.effectiveAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        }
        actions={
          <>
            <Badge tone={policyStatusTone(status)}>{POLICY_STATUS_LABELS[status]}</Badge>
            {p.requiresAcknowledgment ? <Badge tone="info">Requires ack</Badge> : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              {p.summary ? (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text2">
                  {p.summary}
                </p>
              ) : (
                <p className="text-[13px] text-text3">No summary on file.</p>
              )}
            </CardBody>
          </Card>

          {p.file ? (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Icon.FileText size={16} />
                    Document
                  </span>
                }
                meta={
                  <span className="font-mono text-[11.5px] text-text3">
                    {p.file.mimeType}
                  </span>
                }
              />
              <CardBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium tracking-tight">
                      {p.file.filename}
                    </div>
                    <div className="text-[11.5px] text-text3">
                      {(p.file.sizeBytes / 1024).toFixed(1)} KB · uploaded{" "}
                      {p.file.uploadedAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  {canDownload ? (
                    <Button
                      href={`/api/files/${p.file.id}/download`}
                      variant="primary"
                      size="md"
                      external
                    >
                      Download
                    </Button>
                  ) : (
                    <span className="text-[12px] text-text3">
                      Download permission required
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {p.requiresAcknowledgment && status === "published" ? (
            <PolicyAckPanel
              policyId={p.id}
              policyVersion={p.version}
              alreadyAcknowledged={myAck !== null}
              acknowledgedAt={myAck?.acknowledgedAt.toISOString() ?? null}
              canAck={canAck}
            />
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-1.5 text-[13px]">
                <Row label="Status">
                  <Badge tone={policyStatusTone(status)}>{POLICY_STATUS_LABELS[status]}</Badge>
                </Row>
                <Row label="Number / version">
                  <span className="font-mono">
                    {p.number} · v{p.version}
                  </span>
                </Row>
                <Row label="Effective">
                  {p.effectiveAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Row>
                {p.reviewDate ? (
                  <Row label="Next review">
                    {p.reviewDate.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Row>
                ) : null}
                {p.publishedAt ? (
                  <Row label="Published">{p.publishedAt.toLocaleString()}</Row>
                ) : null}
                {p.requiresAcknowledgment ? (
                  <Row label="Acks">
                    <span className="font-mono">{p.acks.length}</span>
                  </Row>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {(canPublish || canManage) && status !== "archived" ? (
            <Card>
              <CardHeader title="Manage" />
              <CardBody>
                <PolicyManageActions
                  policyId={p.id}
                  status={status}
                  canPublish={canPublish}
                  canManage={canManage}
                  hasFile={p.fileId !== null}
                />
              </CardBody>
            </Card>
          ) : null}

          {canManage && p.requiresAcknowledgment && p.acks.length > 0 ? (
            <Card>
              <CardHeader
                title="Acknowledged by"
                meta={<Badge tone="ok">{p.acks.length}</Badge>}
              />
              <CardBody>
                <ul className="space-y-1.5 text-[13px]">
                  {p.acks.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-neutral-soft/60 px-2 py-1.5"
                    >
                      <span>
                        {a.user.name}
                        {a.user.badge ? ` · ${a.user.badge}` : ""}
                      </span>
                      <span className="text-[11.5px] font-mono text-text3">
                        v{a.policyVersion ?? "?"} ·{" "}
                        {a.acknowledgedAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <BoundaryNotice variant="panel" />
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1 last:border-b-0">
      <dt className="text-[12px] text-text3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
