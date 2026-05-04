import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RPD Internal Ops",
  description: "Richmond PD administrative coordination portal.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const nonce = h.get("x-csp-nonce") ?? undefined;

  return (
    <html lang="en">
      <head>
        {/* The nonce is forwarded to runtime scripts via Next's CSP nonce
            integration; declared here so style-src nonce in dev is honored. */}
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
