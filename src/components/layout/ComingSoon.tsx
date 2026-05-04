import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { Icon } from "@/components/ui/Icons";

/**
 * ComingSoon — placeholder page for modules whose UI is not yet built.
 *
 * The Chief should be able to see the full nav and understand each
 * module's intended purpose without us pretending they're complete.
 * Lists planned capabilities and includes the boundary reminder where
 * the module will eventually accept user input.
 */
export function ComingSoon({
  title,
  eyebrow,
  description,
  capabilities,
  showBoundary = true,
  icon = <Icon.Settings size={18} />,
}: {
  title: string;
  eyebrow?: string;
  description: ReactNode;
  capabilities: string[];
  showBoundary?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <PageHeader
        eyebrow={eyebrow ?? "Module"}
        title={
          <span className="flex items-center gap-2">
            {title}
            <Badge tone="info">Coming soon</Badge>
          </span>
        }
        description={description}
      />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="text-text3">{icon}</span>
              Planned capabilities
            </span>
          }
          meta={<Badge tone="neutral">Pre-pilot</Badge>}
        />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2">
            {capabilities.map((c) => (
              <li
                key={c}
                className="flex items-start gap-2 rounded-md border border-line/70 bg-neutral-soft/40 px-3 py-2 text-[13px] text-text2"
              >
                <span aria-hidden="true" className="mt-1 text-accent">
                  ●
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <CardBody>
          <p className="text-[13px] text-text2">
            This module is on the post-foundation roadmap. The link is included in the sidebar
            so command staff can see the planned scope of the portal — the underlying
            permissions, audit events, and data model already exist for it.
          </p>
          <p className="mt-2 text-[12.5px] text-text3">
            Until the module ships, treat the corresponding system of record (paper, the
            existing shared calendar, or the relevant external system) as authoritative.
          </p>
        </CardBody>
      </Card>

      {showBoundary ? <BoundaryNotice variant="panel" /> : null}
    </div>
  );
}
