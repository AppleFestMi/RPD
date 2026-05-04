"use client";

import { useState, useTransition } from "react";
import { addRequestComment } from "../actions";

export function CommentForm({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body = String(fd.get("body") ?? "");
        if (!body.trim()) return;
        start(async () => {
          setError(null);
          const res = await addRequestComment({ requestId, body });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          (e.target as HTMLFormElement).reset();
        });
      }}
    >
      <textarea
        name="body"
        required
        rows={3}
        maxLength={2000}
        placeholder="Add a comment for the requester or reviewer."
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
      />
      {error ? (
        <p className="rounded-md bg-danger-soft/60 p-2 text-[12.5px] text-danger">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add comment"}
      </button>
    </form>
  );
}
