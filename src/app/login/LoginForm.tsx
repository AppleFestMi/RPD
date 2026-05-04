"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

export function LoginForm({
  callbackUrl,
  showError,
}: {
  callbackUrl: string;
  showError: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(showError ? "Sign-in failed." : null);

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") ?? "");
        const password = String(fd.get("password") ?? "");
        const mfaCode = String(fd.get("mfaCode") ?? "");
        startTransition(async () => {
          setError(null);
          const res = await signIn("credentials", {
            email,
            password,
            mfaCode,
            redirect: false,
          });
          if (!res || res.error) {
            // Generic message — never tell the client *why* it failed.
            setError("Sign-in failed. Check your email, password, and MFA code.");
            return;
          }
          window.location.assign(callbackUrl);
        });
      }}
    >
      <label className="block">
        <span className="block text-xs text-white/70">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-navy-ink/70 px-3 py-2 text-white outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-white/70">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-navy-ink/70 px-3 py-2 text-white outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-white/70">
          MFA code <span className="text-white/40">(if enrolled)</span>
        </span>
        <input
          name="mfaCode"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={20}
          placeholder="123456 or AAAA-BBBB-CCCC"
          className="mt-1 w-full rounded-md border border-white/10 bg-navy-ink/70 px-3 py-2 text-white font-mono tracking-wide outline-none focus:border-accent"
        />
      </label>

      {error ? <p className="text-[12px] text-danger-soft">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
