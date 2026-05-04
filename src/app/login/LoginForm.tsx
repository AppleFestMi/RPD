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
      className="space-y-3.5"
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
      <Field label="Email" name="email" type="email" autoComplete="username" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="MFA code"
        hint="6-digit code or AAAA-BBBB-CCCC backup code (if enrolled)"
        name="mfaCode"
        type="text"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={20}
        placeholder="123456"
        mono
      />

      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger-soft/20 px-3 py-2 text-[12.5px] text-danger-soft">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-md bg-accent px-3 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  name,
  type,
  required,
  autoComplete,
  spellCheck,
  maxLength,
  placeholder,
  mono,
}: {
  label: string;
  hint?: string;
  name: string;
  type: string;
  required?: boolean;
  autoComplete?: string;
  spellCheck?: boolean;
  maxLength?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/65">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        maxLength={maxLength}
        placeholder={placeholder}
        className={
          "w-full rounded-md border border-white/10 bg-navy-ink/70 px-3 py-2 text-white outline-none transition-colors focus:border-accent " +
          (mono ? "font-mono tracking-wider" : "")
        }
      />
      {hint ? <span className="mt-1 block text-[11px] text-white/55">{hint}</span> : null}
    </label>
  );
}
