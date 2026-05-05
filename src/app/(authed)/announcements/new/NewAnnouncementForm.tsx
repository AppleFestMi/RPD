"use client";

import { useState, useTransition } from "react";
import { createAnnouncement } from "../actions";
import {
  AUDIENCE_OPTIONS,
  AUDIENCE_LABELS,
  CATEGORIES,
  PRIORITY_LABELS,
  type AnnouncementPriority,
  type AudienceScope,
} from "@/lib/announcements/types";

export function NewAnnouncementForm({ canPublishNow }: { canPublishNow: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await createAnnouncement({
            title: String(fd.get("title") ?? ""),
            body: String(fd.get("body") ?? ""),
            category: String(fd.get("category") ?? ""),
            audience: String(fd.get("audience") ?? "all") as AudienceScope,
            priority: String(fd.get("priority") ?? "normal") as AnnouncementPriority,
            pinned: fd.get("pinned") === "on",
            requiresAcknowledgment: fd.get("requiresAcknowledgment") === "on",
            expiresAt: String(fd.get("expiresAt") ?? ""),
            publishNow: fd.get("publishNow") === "on",
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/announcements/${res.announcementId}`);
        });
      }}
    >
      <Field name="title" label="Title" required maxLength={200} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[12px] font-medium text-text2">Category</span>
          <select
            name="category"
            defaultValue="General"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-[12px] font-medium text-text2">Priority</span>
          <select
            name="priority"
            defaultValue="normal"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {(Object.keys(PRIORITY_LABELS) as AnnouncementPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Audience</span>
        <select
          name="audience"
          required
          defaultValue="all"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {AUDIENCE_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABELS[a]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Body</span>
        <textarea
          name="body"
          required
          rows={9}
          maxLength={10_000}
          placeholder="Briefing copy. Administrative content only — no case, incident, LEIN/NCIC, subject, or evidence content."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-[11px] text-text3">
          Attachments will be available once the secure file pipeline is enabled.
        </span>
      </label>

      <Field name="expiresAt" label="Expires at (optional)" type="datetime-local" />

      <fieldset className="space-y-1.5 rounded-md border border-line bg-neutral-soft/30 p-3 text-[13px]">
        <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">
          Options
        </legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pinned" /> Pin to the top of the list
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requiresAcknowledgment" /> Requires per-user acknowledgment
        </label>
        {canPublishNow ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publishNow" /> Publish immediately (otherwise saved as draft)
          </label>
        ) : (
          <p className="text-[11.5px] text-text3">
            Saved as a draft. A publisher must promote it to publish.
          </p>
        )}
      </fieldset>

      {error ? (
        <p className="rounded-md bg-danger-soft/60 p-2 text-[13px] text-danger">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <a
          href="/announcements"
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  maxLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-text2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
