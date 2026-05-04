"use client";

import { useState, useTransition } from "react";
import { publishWeek } from "../actions";

export function PublishConfirm({
  weekStart,
  expectShifts,
}: {
  weekStart: string;
  expectShifts: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (expectShifts === 0) {
    return (
      <div className="mt-6 rounded-md bg-ok-soft/40 p-3 text-sm text-text2">
        Nothing to publish — all shifts in this week are already published, cancelled, or archived.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await publishWeek({ weekStart, expectShifts });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            window.location.assign(`/schedule?week=${r.weekStart}`);
          })
        }
        className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Publishing…" : `Publish ${expectShifts} shift${expectShifts === 1 ? "" : "s"}`}
      </button>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
