"use client";

import { useState, useTransition } from "react";
import { requestAuditExport } from "./actions";

type Filter = {
  from?: string | undefined;
  to?: string | undefined;
  eventType?: string | undefined;
  result?: "success" | "failure" | "denied" | undefined;
  actorUserId?: string | undefined;
  entityType?: string | undefined;
};

type Row = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRoleSnapshot: string[];
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  action: string;
  result: "success" | "failure" | "denied";
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: unknown;
};

export function AuditClient({
  filter,
  rows,
  total,
  page,
  totalPages,
}: {
  filter: Filter;
  rows: Row[];
  total: number;
  page: number;
  totalPages: number;
}) {
  const [exportPending, startExport] = useTransition();
  const [exportNote, setExportNote] = useState<string | null>(null);

  return (
    <>
      <form className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" method="get">
        <Field name="from" label="From (UTC)" type="datetime-local" defaultValue={fmtLocal(filter.from)} />
        <Field name="to" label="To (UTC)" type="datetime-local" defaultValue={fmtLocal(filter.to)} />
        <Field name="eventType" label="Event type" defaultValue={filter.eventType ?? ""} placeholder="auth.login.success" />
        <label className="block">
          <span className="block text-xs text-text3">Result</span>
          <select
            name="result"
            defaultValue={filter.result ?? ""}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="denied">Denied</option>
          </select>
        </label>
        <Field name="actorUserId" label="Actor user ID" defaultValue={filter.actorUserId ?? ""} />
        <Field name="entityType" label="Entity type" defaultValue={filter.entityType ?? ""} placeholder="User, ScheduleShift…" />
        <div className="col-span-full flex items-center gap-2">
          <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink">
            Apply filters
          </button>
          <a href="/admin/audit" className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft">
            Clear
          </a>
          <span className="ml-auto text-sm text-text3">
            {total} match{total === 1 ? "" : "es"}
          </span>
          <button
            type="button"
            disabled={exportPending}
            onClick={() =>
              startExport(async () => {
                setExportNote(null);
                try {
                  const r = await requestAuditExport({
                    from: filter.from ?? undefined,
                    to: filter.to ?? undefined,
                    eventType: filter.eventType ?? undefined,
                    result: filter.result ?? undefined,
                    actorUserId: filter.actorUserId ?? undefined,
                    entityType: filter.entityType ?? undefined,
                  });
                  if (!r.ok) {
                    setExportNote(`Export failed: ${r.error}`);
                    return;
                  }
                  setExportNote(`Export requested for ${r.rowCount} rows. (CSV streaming is not yet implemented; the request is audit-logged.)`);
                } catch (e) {
                  setExportNote(`Export not allowed (${(e as Error).message}). Permission denied is audit-logged.`);
                }
              })
            }
            className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft disabled:opacity-60"
          >
            {exportPending ? "Requesting…" : "Export…"}
          </button>
        </div>
      </form>

      {exportNote ? (
        <p className="mt-2 rounded-md bg-warn-soft/40 p-2 text-[12px] text-text2">{exportNote}</p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-neutral-soft text-left text-[11px] uppercase tracking-wider text-text3">
            <tr>
              <th className="px-2 py-2 whitespace-nowrap">Time</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">Event</th>
              <th className="px-2 py-2">Entity</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Result</th>
              <th className="px-2 py-2">IP</th>
              <th className="px-2 py-2">Req</th>
              <th className="px-2 py-2">Meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-2 py-2 whitespace-nowrap font-mono">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-2 py-2">
                  {r.actorEmail ? (
                    <>
                      <div>{r.actorName}</div>
                      <div className="font-mono text-[11px] text-text3">{r.actorEmail}</div>
                    </>
                  ) : (
                    <span className="text-text3">—</span>
                  )}
                </td>
                <td className="px-2 py-2 font-mono">{r.eventType}</td>
                <td className="px-2 py-2 font-mono">
                  {r.entityType ? `${r.entityType}` : "—"}
                  {r.entityId ? <div className="text-[11px] text-text3">{r.entityId}</div> : null}
                </td>
                <td className="px-2 py-2 font-mono">{r.action}</td>
                <td className="px-2 py-2">
                  <span
                    className={
                      r.result === "success"
                        ? "rounded bg-ok-soft px-2 py-0.5 text-ok"
                        : r.result === "denied"
                          ? "rounded bg-warn-soft px-2 py-0.5 text-warn"
                          : "rounded bg-danger-soft px-2 py-0.5 text-danger"
                    }
                  >
                    {r.result}
                  </span>
                </td>
                <td className="px-2 py-2 font-mono">{r.ip ?? "—"}</td>
                <td className="px-2 py-2 font-mono text-[11px]">{r.requestId?.slice(0, 8) ?? "—"}</td>
                <td className="px-2 py-2 text-[11px] text-text2">
                  {r.metadata ? <code>{JSON.stringify(r.metadata)}</code> : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-text3">
                  No matching events.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} filter={filter} />
    </>
  );
}

function Pagination({
  page,
  totalPages,
  filter,
}: {
  page: number;
  totalPages: number;
  filter: Filter;
}) {
  if (totalPages <= 1) return null;
  const link = (n: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) {
      if (typeof v === "string" && v.length > 0) params.set(k, v);
    }
    params.set("page", String(n));
    return `/admin/audit?${params.toString()}`;
  };
  return (
    <nav className="mt-3 flex items-center justify-end gap-2 text-sm">
      <a aria-disabled={page <= 1} href={page > 1 ? link(page - 1) : "#"} className="rounded-md border border-line bg-white px-3 py-1.5 hover:bg-neutral-soft">
        ← Prev
      </a>
      <span className="text-text3">
        Page {page} of {totalPages}
      </span>
      <a aria-disabled={page >= totalPages} href={page < totalPages ? link(page + 1) : "#"} className="rounded-md border border-line bg-white px-3 py-1.5 hover:bg-neutral-soft">
        Next →
      </a>
    </nav>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-text3">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function fmtLocal(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:MM with no zone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
