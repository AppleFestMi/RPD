"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-white/85 hover:text-white text-sm"
    >
      Sign out
    </button>
  );
}
