"use client";

import { useState, useTransition } from "react";
import { completeMfaSetup } from "./actions";

export function MfaSetupClient() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [acknowledged, setAck] = useState(false);

  if (codes) {
    return (
      <div className="mt-3 rounded-md border border-warn bg-warn-soft/40 p-4 text-text2">
        <p className="text-[13px] font-semibold">
          Save these backup codes somewhere safe.
        </p>
        <p className="text-[12px] text-text3">
          Each code works once. You'll see them only this time.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-[13px]">
          {codes.map((c) => (
            <li key={c} className="rounded bg-white px-2 py-1 border border-line">
              {c}
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I've recorded these backup codes in a secure location (password manager,
            sealed envelope, etc.).
          </span>
        </label>
        <a
          aria-disabled={!acknowledged}
          href="/dashboard"
          onClick={(e) => {
            if (!acknowledged) e.preventDefault();
          }}
          className={
            "mt-4 inline-block rounded-md px-3 py-2 text-sm font-medium text-white " +
            (acknowledged ? "bg-accent hover:bg-accent-ink" : "bg-neutral cursor-not-allowed")
          }
        >
          Continue
        </a>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "");
        start(async () => {
          setError(null);
          const res = await completeMfaSetup({ code });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setCodes(res.backupCodes);
        });
      }}
    >
      <label className="flex-1">
        <span className="block text-xs text-text3">6-digit code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          pattern="\d{6}"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-mono tracking-widest text-lg outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-white font-medium hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
      {error ? <p className="ml-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}
