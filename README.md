# RPD Internal Ops

Administrative coordination portal for the Richmond Police Department. Schedule, requests, training, equipment, vehicles, special events, announcements.

> **Boundary:** This system is for administrative coordination only. It is **not** for CAD, RMS, evidence, body-camera footage, HR/payroll, LEIN, NCIC, or any CJIS-regulated criminal justice information. See [`docs/DATA_BOUNDARIES.md`](docs/DATA_BOUNDARIES.md).

## Status

This branch (`main`) holds the **production-grade foundation plus the live-pilot security/admin floor**. Identity, MFA, RBAC, audit, and the user/role/audit admin UIs land here so the next session can begin scheduling on top of a real security baseline.

What works after `npm install && npm run dev`:
- Health and readiness endpoints
- Login (Argon2id, lockout, MFA: TOTP + single-use backup codes, audit-logged)
- MFA enrollment at `/setup/mfa` with QR + manual entry, regeneratable backup codes
- Force password reset flow at `/setup/password` (gated by `forcePasswordReset` on User)
- Account activation flow at `/activate/<token>` from admin-issued invitations
- `/admin/users` list, `/admin/users/new` invite, `/admin/users/[id]` detail with: enable/disable, force-reset, unlock, role grant/revoke, MFA reset (typed-email confirmation), invitation re-issue
- `/admin/roles` read view of role definitions and their permissions
- `/admin/audit` log viewer with filters, pagination, and an audit-logged export request stub
- Full Prisma schema for the operational data model
- Permission catalog and role presets, seeded into the database
- Vitest with unit tests for password policy, redaction, encryption, TOTP/backup-code shape, MFA gate evaluation, and audit filter builder

What is intentionally not yet implemented:
- SMTP delivery of invitations — admin currently copy/pastes the activation URL. The hook is in place; only the mail step is missing.
- Audit log CSV streaming — `requestAuditExport` enforces permission and audit-logs the request and any denial; the CSV body itself is the next thing to plug in.
- Re-authentication challenge for high-risk admin actions — current MFA reset uses a typed-email confirmation. Re-auth (re-enter password) is the upgrade path.
- Time-off **submission and approval UX** — model exists and approved time-off surfaces as a schedule conflict warning. Full request flow lands with the Requests module.
- Requests, training, announcements, policies, equipment, vehicles, events, directory feature modules.
- File attachment upload pipeline (schema present, route handler pending).
- Multi-instance backing store for in-progress MFA enrollment (today: in-memory; fine for one VPS, not for a horizontally-scaled deploy).

**Scheduling module (live in this build):**

- Week calendar at `/schedule` with day cards, status chips, category filters, "My schedule" toggle, week navigation
- Add / edit / archive shifts (with administrative-notes validator that rejects case/incident/CJI/subject references)
- Publish week flow at `/schedule/publish` showing draft / changed / unstaffed counts; idempotent and audit-logged with shift IDs
- Open shifts board at `/schedule/open` — create, apply, withdraw, supervisor approve/deny, close
- Reserve availability at `/schedule/availability` — manage own (Available/Preferred/Unavailable) plus admin aggregate summary
- Shift swaps at `/schedule/swaps` — three-stage flow: requester → replacement accept/decline → supervisor approve/deny
- Time-off list at `/schedule/timeoff` — read-only; approved time-off surfaces as a conflict warning when assigning users
- Print Daily Roster at `/schedule-print/<YYYY-MM-DD>` — no nav, no notes, print CSS
- Conflict warnings: double-booking, approved-time-off overlap, applicant-already-assigned, replacement-already-assigned, end-before-start, open-shift-already-filled

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
npm test                  # Vitest (unit tests, no DB)
npm run preflight         # typecheck + lint + tests
npm run prisma:generate   # Regenerate Prisma client
npm run prisma:migrate:dev   # Create/apply a dev migration
npm run prisma:migrate:deploy # Apply migrations in production
npm run db:seed           # Idempotent seed of permissions/roles + bootstrap admin
```

## First-pilot checklist

1. Bootstrap SystemAdmin via `npm run db:seed` (sets `forcePasswordReset = true`).
2. Sign in at `/login` with the seed password — the app redirects to `/setup/password` to set a real one.
3. SystemAdmin's role requires MFA, so the next stop is `/setup/mfa`. Scan the QR, verify, and **save the backup codes** (shown once).
4. From `/admin/users/new`, invite the rest of the staff. Hand each user the activation URL via department email.
5. Each invitee activates at `/activate/<token>`, sets a password, accepts the boundary notice, then enrolls MFA if their role requires it.
6. `/admin/audit` should already show login successes, MFA setups, role grants. That's the live-pilot smoke test passing.

To populate fictional schedule data for development:

```bash
SEED_ADMIN_EMAIL=admin@example.gov \
SEED_ADMIN_PASSWORD='ChangeMeImmediately123!' \
SEED_SCHEDULE=1 \
  npm run db:seed
```

This creates one week of patrol/dispatch/reserve/training/special-event/court shifts plus two open shifts and three availability blocks for the seed admin. It is idempotent — re-runs replace prior **draft** shifts in the same week, never touching published rows.

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
