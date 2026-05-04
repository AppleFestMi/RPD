"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "../actions";

export function InviteForm({ roles }: { roles: Array<{ key: string; label: string }> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null);

  if (issued) {
    return (
      <div className="mt-5 rounded-md border border-warn bg-warn-soft/40 p-4">
        <p className="text-sm font-semibold">Activation link issued</p>
        <p className="mt-1 text-[12px] text-text3">
          Expires {new Date(issued.expiresAt).toLocaleString()}. Share via department email
          or in person — never post on public chat.
        </p>
        <code className="mt-3 block break-all rounded bg-white p-2 font-mono text-[12px]">
          {issued.url}
        </code>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft"
            onClick={() => navigator.clipboard?.writeText(issued.url)}
          >
            Copy link
          </button>
          <a
            href="/admin/users"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink"
          >
            Done
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await inviteUser({
            email: String(fd.get("email") ?? ""),
            name: String(fd.get("name") ?? ""),
            rank: String(fd.get("rank") ?? ""),
            badge: String(fd.get("badge") ?? ""),
            roleKey: String(fd.get("roleKey") ?? ""),
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setIssued({ url: res.activationUrl, expiresAt: res.expiresAt });
        });
      }}
    >
      <Field name="name" label="Full name" required />
      <Field name="email" label="Email" type="email" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="rank" label="Rank / title" />
        <Field name="badge" label="Badge / employee ID" />
      </div>
      <label className="block">
        <span className="block text-xs text-text3">Initial role</span>
        <select
          name="roleKey"
          required
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          defaultValue=""
        >
          <option value="" disabled>Select a role…</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-white font-medium hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Issuing…" : "Issue activation link"}
      </button>
    </form>
  );
}

function Field({ name, label, type = "text", required }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs text-text3">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
      />
    </label>
  );
}
