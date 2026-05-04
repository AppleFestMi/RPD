/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Security headers are layered:
  //   - Reverse proxy (Caddy) sets HSTS, X-Frame-Options, etc.
  //   - The application sets a strict CSP with a per-request nonce in middleware.
  // We do NOT configure headers here because middleware-based per-request
  // headers are required for the nonce to match the rendered HTML.
  async redirects() {
    return [];
  },
  // The prototype/ directory is served only via the legacy GitHub Pages workflow.
  // It is excluded from the Next.js build output.
};

export default nextConfig;
