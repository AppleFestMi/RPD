# Security Model

**Status:** Foundation document. Authoritative for design decisions.
**Last updated:** 2026-05-04
**Audience:** Engineers, system administrators, command staff reviewing this system.

---

## 1. Boundary statement (read this first)

This system, **RPD Internal Ops**, is an **administrative coordination portal**. It exists to schedule shifts, route internal requests, publish department announcements, track training and equipment, and run command dashboards.

It is **not approved for, and must not contain**, any of the following:

- Computer-Aided Dispatch (CAD) data
- Records Management System (RMS) data
- Evidence records or chain-of-custody data
- Body-worn camera footage or metadata
- HR records, payroll, benefits, or discipline files
- LEIN / NCIC query results
- Any CJIS-regulated criminal justice information (CJI)
- Criminal history (CHRI)
- Case reports
- Victim/witness data
- Juvenile records
- Intelligence records
- Active investigative material

> If a feature request would require any of the above to live in this system, **do not implement it here**. Route the requirement to the system that holds the data of record.

This boundary is enforced by:

1. **Schema design** — the database has no fields for the data above.
2. **User-facing copy** — every form, attachment field, and admin surface that could plausibly be misused carries a visible boundary notice.
3. **Code review** — pull requests adding fields that look like CJI must be rejected.
4. **Audit logging** — admin and export actions are logged so any drift is detectable.

The system is designed with **CJIS-aware discipline** (least privilege, MFA, encryption, audit) so that the operational habits, controls, and posture are equivalent to a CJIS-bound system. It is **not certified** for CJIS, and CJI must not be entered.

---

## 2. Data classification

Every record in this system falls into one of four classifications. This drives access defaults, retention, and logging granularity.

| Class | Examples | Default access | Audit events |
| --- | --- | --- | --- |
| **Public-Internal** | Department-wide announcements, policy library, training catalog | All authenticated users | Read events not logged; create/update/publish logged |
| **Operational** | Schedule, open shifts, availability, vehicle issues, equipment requests | Permission-gated by role | Create/update/approve/deny logged |
| **Personnel-Sensitive** | Time-off requests, personal training records, complaint metadata (admin-only summaries), directory contact details | Strict permission gates; subject + supervisors + admin | All read and write logged |
| **Security** | Audit log, access log, role assignments, system settings, MFA secrets | SystemAdmin / AuditorReadOnly only | Append-only; reads logged; exports require elevated permission |

There is no "Restricted/CJI" class. If a record would need one, it does not belong here.

See [`DATA_BOUNDARIES.md`](DATA_BOUNDARIES.md) for the prohibited-data list and form-level warnings.

---

## 3. Authentication

### 3.1 Identity strategy

- **Phase 1 (MVP):** Email + password local authentication, with strong hashing (Argon2id preferred; bcrypt cost ≥ 12 acceptable), account lockout, and TOTP-based MFA available per user.
- **Phase 2 (target):** Single sign-on via OIDC or SAML, integrated with the department's identity provider (Microsoft Entra ID, Google Workspace, or county-issued SSO). Local auth remains as a break-glass path for a small number of system administrators.
- The auth layer (Auth.js) is configured so adding an OIDC provider is a config change, not a rewrite.

### 3.2 Password policy (while local auth is enabled)

- Minimum length: 12 characters.
- Reject the most common 10,000 breached passwords (use a static blocklist, not external API calls).
- Hash with Argon2id (`memoryCost ≥ 64MB`, `timeCost ≥ 3`, `parallelism ≥ 1`).
- Hashes are stored only in `User.passwordHash`. Never in logs, errors, or audit metadata.
- Forced password reset on first login, after admin password reset, and after any suspected compromise.

### 3.3 Multi-factor authentication

- Schema: `User.mfaEnabled`, `User.mfaSecretEncrypted` (AES-256-GCM, envelope key from `MFA_ENCRYPTION_KEY`), `User.mfaVerifiedAt`, `User.mfaResetAt`. Backup codes live in their own table (`BackupCode`), one row per code, with `usedAt` so a single burnt code is forensically distinguishable.
- MFA is **required** for: `systemAdmin`, `admin`, `commandStaff`, `auditorReadOnly`. The list is enforced by `MFA_REQUIRED_ROLES` in `src/lib/auth/policy.ts` and gated in `src/app/(authed)/layout.tsx`.
- MFA is **available but optional** for `officer`, `reserveOfficer`, `dispatcher`, `supervisor`. A future change can make it mandatory by adding the role key to `MFA_REQUIRED_ROLES`.
- Setup flow: user lands on `/setup/mfa`, scans an `otpauth://` QR or enters the base32 secret manually, verifies with a 6-digit TOTP. On verify, the secret is re-encrypted (the in-memory plaintext is dropped), `mfaEnabled` flips, and ten backup codes are generated, hashed (Argon2id), and shown to the user **once**.
- Login: a single form takes email + password + (TOTP or backup code). The Credentials provider verifies password, then — if MFA is enabled — verifies the TOTP or consumes a backup code. Backup codes are recognised by their `AAAA-BBBB-CCCC` shape.
- Reset: a SystemAdmin (`admin.mfa.reset` permission) can reset another user's MFA. The action requires typing the target user's email as a confirmation (re-authentication is a future commit), invalidates the secret + all backup codes, revokes the user's sessions, and emits `auth.mfa.reset_by_admin`.

### 3.4 Sessions

- Sessions are server-stored (database-backed via the auth adapter), not JWT-only, so they can be revoked.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, signed with a server secret.
- Idle timeout: 30 minutes default (configurable per environment).
- Absolute lifetime: 12 hours.
- Concurrent sessions: allowed; admin can list and revoke sessions for any user (admin action is logged).
- Logout invalidates the session server-side; client cookie cleared.

### 3.5 Account lockout / throttling

- Failed login increments `User.failedLoginCount`.
- After 5 consecutive failures, set `User.lockedUntil` to `now + 15 minutes`.
- Lockout is per-account, not per-IP, to prevent IP-based bypass and denial-of-service against legitimate users.
- IP-based rate limiting (separate, on the login route) prevents enumeration: 10 requests / minute / IP for `/api/auth/*`.
- Successful login resets `failedLoginCount`.
- All four events — login success, login failure, lockout triggered, lockout expired — are audit-logged.

---

## 4. Authorization

### 4.1 Principles

1. **Server-side or it doesn't exist.** UI hiding is a usability choice, never a security boundary.
2. **Permission-based, not role-based, at enforcement time.** Roles are bundles of permissions. The decision a route makes is "does this user have permission `schedule.publish`", not "is this user a Supervisor".
3. **Deny by default.** Every server action and API route must call `requirePermission(...)` or its equivalent. Routes without a check are bugs.
4. **Denied access is logged.** A `permission.denied` audit event is emitted whenever `requirePermission` throws.

### 4.2 Roles (initial set)

| Role | Intent |
| --- | --- |
| `Officer` | Full-time sworn personnel. View schedule, manage own availability, submit requests. |
| `ReserveOfficer` | Reserve unit. Manage own availability, apply for open shifts, view reserve-relevant content. |
| `Dispatcher` | Civilian dispatch. View dispatch schedule, submit own requests, see relevant announcements. |
| `Supervisor` | Sergeants. Approve shift pickups, swaps, and supervisor-level requests. Publish briefings. |
| `CommandStaff` | Lieutenants and above. Approve command-level requests, publish department-wide announcements, manage policies. |
| `Admin` | Department admin. Manage users, run reports, manage settings. Cannot grant SystemAdmin. |
| `SystemAdmin` | IT/system administrator. Manage roles, integrations, secrets, MFA resets. |
| `AuditorReadOnly` | Internal auditor or oversight role. Read-only access to audit logs, settings history, role changes. Cannot read operational personnel content. |

A user can hold multiple roles. Permissions are the union.

### 4.3 Permissions catalog

The authoritative list lives in `src/lib/permissions/catalog.ts`. Categories:

- `schedule.*` — read, create, update, publish, approve pickup, request pickup, swap request, swap approve
- `availability.*` — read.own, manage.own, read.all
- `requests.*` — create, read.own, read.all, approve.supervisor, approve.command
- `announcements.*` — read, create, publish
- `policies.*` — read, manage, acknowledge
- `training.*` — read.own, read.all, manage
- `equipment.*` — request, manage
- `vehicles.*` — reportIssue, manage
- `events.*` — read, manage
- `directory.*` — read
- `admin.*` — users.manage, roles.manage
- `audit.*` — read, export

Adding a permission is a schema-and-catalog change; it does not require code changes in policy enforcement (which is data-driven).

### 4.4 Enforcement helpers

- `requirePermission(perm)` — server-only, throws `ForbiddenError` and emits `permission.denied`. Use at the top of every server action / API route.
- `can(user, perm)` — pure check, returns boolean. Use in components to hide UI elements that the user cannot use. **Never** the only gate.
- `assertOwnership(user, resource)` — for `*.own` permissions, confirms the resource's `createdById` (or equivalent) matches.

---

## 5. Audit logging

See [`AUDIT_LOGGING.md`](AUDIT_LOGGING.md) for the full event taxonomy.

Summary:

- Every audit event is written through the `auditLog()` helper and persisted to `AuditLog`.
- Events are append-only at the application layer (no UPDATE or DELETE statements against `AuditLog` from app code; database-level triggers can additionally enforce this).
- Events are written **synchronously** for security-relevant actions (login, permission denied, role change) so a failure to log is a failure of the action.
- Reads of audit data emit `audit.viewed` events. Exports emit `audit.exported`.
- A `requestId` propagates from the inbound request through the audit record so a single request's effects are reconstructable.

---

## 6. Encryption

### 6.1 In transit

- HTTPS only. The reverse proxy (Caddy or Nginx) terminates TLS using a certificate from Let's Encrypt or an organizational CA.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- TLS 1.2 minimum; TLS 1.3 preferred.
- Internal Docker network is not exposed externally — Postgres has no published port.

### 6.2 At rest

- The VPS volume hosting the Docker data directory must use full-disk encryption (LUKS) or be a provider-managed encrypted block device.
- Encrypted database backups are written to off-host storage with an offline-decryptable key escrow.
- Application-level encryption of select fields:
  - `User.mfaSecret` — encrypted with an app-level key (envelope-style; key in `MFA_ENCRYPTION_KEY`, never committed).
  - `User.mfaBackupCodes` — hashed (Argon2id) for verification, not encrypted.
  - File attachments — encrypted at rest by the storage backend; the application stores only metadata + checksum.

### 6.3 Field-level discipline

- Passwords, MFA secrets, and any future API tokens are scrubbed from logs by a redaction layer before any log line is written.
- Errors returned to the client carry a request ID and a generic message; full error and stack are logged server-side only.

---

## 7. Secrets management

- No secrets in source. `.env.example` is committed; `.env*` is `.gitignore`-d (except `.env.example`).
- Environment variables are managed by:
  - **Development:** local `.env.local`, never shared in chat or shared filesystems.
  - **Production:** a non-checked-in `.env.production` rendered by the deployment process, owned by root, mode `0600`, and read by Docker Compose at startup. Long-term: a secrets manager (Doppler, 1Password Secrets Automation, AWS SSM, Azure Key Vault).
- Secrets that must rotate:
  - `NEXTAUTH_SECRET` (session signing)
  - `MFA_ENCRYPTION_KEY` (envelope encryption)
  - Database password
  - Backup encryption key
- Rotation is documented in `DEPLOYMENT_HARDENING.md`.

---

## 8. Backups & restore

- Automated nightly `pg_dump` (or logical replication slot for PITR if budget allows) encrypted with `age` or `gpg` and shipped off-host.
- Backup retention: 30 days daily, 12 months monthly. Adjust per departmental record-retention policy.
- Restore is **drilled** quarterly. An untested backup is not a backup.
- Restore drills are audit-logged (`backup.restore.tested` event).

---

## 9. Incident response (initial posture)

- All authentication failures, permission denials, and admin actions are logged. The audit log is the first place to look during an incident.
- A SystemAdmin can:
  - Disable a user account immediately (`User.disabledAt`)
  - Force a password reset (`User.forcePasswordReset`)
  - Revoke all sessions for a user
  - Reset MFA for a user
- A documented "compromise checklist" lives in `DEPLOYMENT_HARDENING.md` (rotate session secret, force password reset for affected accounts, review audit log, snapshot database).
- Actual incident handling — notification, legal, etc. — follows departmental policy, not this document.

---

## 10. Account lifecycle

- Users are **invited**, not self-registered. An admin with `admin.users.manage` creates the account at `/admin/users/new`. The system mints a one-time activation token (32 random bytes, base64url, SHA-256-hashed at rest) and renders the activation URL once for the admin to copy. **SMTP is not yet wired** — admins distribute the URL via department email or in person until email is configured.
- Activation requires setting a password (Argon2id, validated against the policy in §3.2) and acknowledging the boundary statement. Tokens are single-use and expire in 7 days. Expired or used tokens render an error and emit `user.activation.failed`.
- Force-reset: when `User.forcePasswordReset = true`, the `(authed)` layout redirects to `/setup/password` until the user supplies their current password and a fresh password that passes policy. Sessions are revoked when an admin sets the flag, so the user must re-login first.
- MFA enrollment is enforced after activation (or on subsequent login) for MFA-required roles via the same `(authed)` layout gate.
- Termination: an admin sets `disabledAt`. The user can no longer log in (audit-logged as `auth.login.failure` with `reason: disabled`); existing sessions are revoked. Historical actions remain in audit logs. Records they own (requests, schedules) are retained; their DirectoryProfile is hidden from non-admin views.
- Hard delete of a user is **not supported** through the app UI. Removal of personal data on legitimate request is handled out-of-band by SystemAdmin per the department's record-retention policy.

---

## 11. Deployment hardening

See [`DEPLOYMENT_HARDENING.md`](DEPLOYMENT_HARDENING.md). Summary:

- Hardened Linux VPS (Debian/Ubuntu LTS), unattended security upgrades, fail2ban, UFW.
- Docker Compose; Postgres has no published port; only Caddy publishes 80/443.
- HTTPS-only with HSTS preload.
- Security headers: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`.
- Application rate limiting on auth and write endpoints.
- Health checks and structured JSON logging.
- Periodic restore drills.

---

## 12. What this document does not do

- It does not certify the system for CJIS. It is not.
- It does not replace the department's written information-security policy. It complements it.
- It does not anticipate every threat. It establishes the baseline and the discipline for layering on top.

When in doubt, write less data, log more events, and ask before adding a feature that approaches the boundary in §1.
