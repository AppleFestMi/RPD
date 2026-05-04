"use client";

import { useState, useTransition } from "react";
import { deleteAvailability } from "./actions";

export function AvailabilityRowActions({ blockId }: { blockId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-[11.5px] text-danger">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        className="text-[12px] text-danger hover:underline disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await deleteAvailability({ blockId });
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "Delete"}
      </button>
    </div>
  );
}
