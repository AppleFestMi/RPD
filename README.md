# RPD Internal Ops

Administrative coordination portal for the Richmond Police Department. Schedule, requests, training, equipment, vehicles, special events, announcements.

> **Boundary:** This system is for administrative coordination only. It is **not** for CAD, RMS, evidence, body-camera footage, HR/payroll, LEIN, NCIC, or any CJIS-regulated criminal justice information. See [`docs/DATA_BOUNDARIES.md`](docs/DATA_BOUNDARIES.md).

## Status

This branch (`main`) holds the **production-grade foundation**. Identity, authorization, and audit logging exist before features. Most feature modules are **stubbed**, intentionally.

What works after `npm install && npm run dev`:
- Health and readiness endpoints
- Login (credentials provider with Argon2id, lockout, audit logging)
- Authenticated dashboard demonstrating the auth/permission/audit pattern
- Full Prisma schema for the operational data model
- Permission catalog and role presets, seeded into the database

What is intentionally not yet implemented:
- TOTP MFA verifier (schema + login flow are wired; the verifier function is the next commit)
- Schedule, requests, training, announcements, policies, equipment, vehicles, events, directory, admin UIs
- Audit log viewer UI
- File attachment upload pipeline (schema present, route handler pending)

The single-file demo from the prototype phase lives at [`prototype/index.html`](prototype/index.html). It is reference only, not the deployed system.

## Local development

Prerequisites: Node 20+, Docker (for Postgres), `openssl`.

```bash
# 1. Copy env and fill in secrets
cp .env.example .env.local
openssl rand -base64 48 | tr -d '\n' | xargs -I{} sed -i '' "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET={}|" .env.local
openssl rand -base64 32 | tr -d '\n' | xargs -I{} sed -i '' "s|^MFA_ENCRYPTION_KEY=.*|MFA_ENCRYPTION_KEY={}|" .env.local

# 2. Bring up Postgres
docker compose up -d db

# 3. Install + generate Prisma client
npm install
npx prisma generate

# 4. Apply schema (creates the database tables)
npx prisma migrate dev --name init

# 5. Seed permissions, roles, and one bootstrap admin
SEED_ADMIN_EMAIL=admin@example.gov \
SEED_ADMIN_PASSWORD='ChangeMeImmediately123!' \
  npm run db:seed

# 6. Start the dev server
npm run dev
```

Sign in at <http://localhost:3000/login> with the seeded admin. The seed forces a password reset on first login (UI for that lands in the next commit; for now you can update directly in `npx prisma studio`).

## Project layout

```
prototype/             ← Single-file demo. Reference only.
docs/                  ← Security model, data boundaries, hardening, audit.
prisma/
  schema.prisma        ← Phase 4 entities.
  seed.ts              ← Permissions, roles, bootstrap admin.
src/
  app/                 ← Next.js App Router.
    (authed)/          ← Routes that require a session (gated by layout).
    api/               ← Route handlers (health, ready, auth/*).
    login/             ← Login page + form client component.
  components/          ← Shared UI atoms.
  lib/
    auth/              ← Auth.js v5 config, session helpers.
    audit/             ← auditLog() and event catalog.
    permissions/       ← Permission catalog, can(), requirePermission().
    security/          ← Headers/CSP, rate limiting, password, redaction, request ID.
    db.ts              ← Prisma singleton.
  middleware.ts        ← Per-request CSP nonce, rate limit, request ID.
docker-compose.yml     ← Local dev (app + db).
docker-compose.prod.yml← Production (Caddy + app + db, no published db port).
Dockerfile             ← Multi-stage build with Next standalone output.
Caddyfile              ← Reverse proxy with security headers + auto-HTTPS.
```

## Scripts

```bash
npm run dev               # Next.js dev server
npm run build             # Production build
npm run start             # Start production server (post-build)
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit (strict mode + noUncheckedIndexedAccess)
npm run preflight         # typecheck + lint
npm run prisma:generate   # Regenerate Prisma client
npm run prisma:migrate:dev   # Create/apply a dev migration
npm run prisma:migrate:deploy # Apply migrations in production
npm run db:seed           # Idempotent seed of permissions/roles + bootstrap admin
```

## Deploying

See [`docs/DEPLOYMENT_HARDENING.md`](docs/DEPLOYMENT_HARDENING.md). Summary:

- Hardened Linux VPS, SSH key only, UFW, unattended-upgrades, fail2ban.
- Docker Compose stack: Caddy (reverse proxy, auto-TLS) → app → Postgres (no published port).
- `/srv/rpd-ops/.env.production` (root:rpdadmin 0640) holds secrets.
- Quarterly restore drills.

## Security model in one paragraph

Auth is database-backed Auth.js v5. Roles are bundles of permissions; **every server action calls `requirePermission(...)`**. Every audit-relevant action emits an `AuditLog` row through the `auditLog()` helper. Per-request CSP nonces, request IDs, and rate-limited auth endpoints. No secrets in source. Postgres has no published port. The single deployed VPS is small and boring on purpose. See [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) for the full picture.

## License / use

Internal department property. No public license.
