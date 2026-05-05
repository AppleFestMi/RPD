"use client";

import { useState, useTransition } from "react";
import {
  archiveAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
} from "../actions";
import type { AnnouncementStatus } from "@/lib/announcements/types";

export function AnnouncementActions({
  announcementId,
  status,
  canPublish,
  canManage,
}: {
  announcementId: string;
  status: AnnouncementStatus;
  canPublish: boolean;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok && r.error) setError(r.error);
      else window.location.reload();
    });

  return (
    <div className="space-y-2 text-[13px]">
      {status === "draft" && canPublish ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => wrap(() => publishAnnouncement({ announcementId }))}
          className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          Publish
        </button>
      ) : null}

      {status === "published" && canPublish ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => wrap(() => unpublishAnnouncement({ announcementId }))}
          className="w-full rounded-md border border-line bg-white px-3 py-2 font-medium text-text2 hover:bg-neutral-soft disabled:opacity-60"
        >
          Unpublish (return to draft)
        </button>
      ) : null}

      {canManage ? (
        !confirmArchive ? (
          <button
            type="button"
            className="w-full rounded-md border border-danger bg-white px-3 py-2 font-medium text-danger hover:bg-danger-soft"
            onClick={() => setConfirmArchive(true)}
          >
            Archive
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-danger/40 bg-danger-soft/30 p-2">
            <p className="text-[12.5px] text-text2">
              Archiving hides this announcement from non-managers. The audit trail is preserved.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-danger px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
                onClick={() => wrap(() => archiveAnnouncement({ announcementId }))}
              >
                Confirm archive
              </button>
              <button
                type="button"
                className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px]"
                onClick={() => setConfirmArchive(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p className="rounded-md bg-danger-soft/60 p-2 text-[12.5px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
