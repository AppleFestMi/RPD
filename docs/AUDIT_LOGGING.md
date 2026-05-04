# Audit Logging

**Status:** Authoritative for what gets logged and how.
**Last updated:** 2026-05-04
**Audience:** Engineers (event taxonomy, helper API), administrators (retention, export).

---

## 1. Goals

The audit log answers four questions:

1. **Who** did **what**?
2. **When** and **from where**?
3. Did it **succeed** or get **denied**?
4. What was the **state** at decision time (role snapshot, request ID)?

It is the system's primary forensic surface and the trust anchor for any downstream review. It is intentionally separate from application logs (which can be noisy and are not append-only).

---

## 2. Storage model

- Single table: `AuditLog` (Prisma model).
- Append-only **at the application layer**. Application code uses `auditLog()` only; it never updates or deletes audit rows.
- Optional: a database-level trigger that revokes UPDATE/DELETE on `AuditLog` from the application role and re-grants only to a `migrations` role. Defer until baseline ships.
- Synchronous writes for security-relevant events (login, permission denied, role change). The action does not return success unless the audit row is committed.
- Asynchronous writes are **not** used for audit. We accept the latency cost.

---

## 3. Required fields

Every `AuditLog` row contains:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (cuid) | Primary key |
| `createdAt` | timestamptz | Server time, UTC |
| `actorUserId` | string nullable | The acting user; null only for system/anonymous events (e.g. failed login by an unknown email — see §6) |
| `actorRoleSnapshot` | string[] | Roles at the moment of the action |
| `actorIp` | string nullable | Client IP from the trusted reverse proxy header |
| `actorUserAgent` | string nullable | Truncated to 512 chars |
| `eventType` | string | From the catalog (§4). Stable identifier. |
| `entityType` | string nullable | e.g. `ScheduleShift`, `User`, `Request` |
| `entityId` | string nullable | The affected entity's primary key |
| `action` | string | The verb, redundant with `eventType` for ergonomics: `create`, `update`, `delete`, `publish`, `approve`, `deny`, `acknowledge`, `view`, `export`, `login`, `logout` |
| `result` | enum | `success` \| `failure` \| `denied` |
| `requestId` | string | UUID propagated through the request lifecycle |
| `metadata` | jsonb | Arbitrary structured context, redacted (§7) |

Indexes:

- `(actorUserId, createdAt DESC)` — "what did this user do?"
- `(entityType, entityId, createdAt DESC)` — "what happened to this record?"
- `(eventType, createdAt DESC)` — "show me all permission denials this week"
- `(createdAt DESC)` — global recent feed

---

## 4. Event catalog

This is the initial set. Adding an event is a code change in `src/lib/audit/events.ts` and a one-line append here.

### 4.1 Authentication

| Event | When |
| --- | --- |
| `auth.login.success` | A user completes login (post-MFA if required) |
| `auth.login.failure` | Wrong password, missing user, MFA failed |
| `auth.logout` | User logs out, or session is revoked |
| `auth.lockout.triggered` | Account locked after too many failures |
| `auth.lockout.expired` | Lockout window passed |
| `auth.mfa.enrolled` | User enrolled MFA |
| `auth.mfa.reset` | SystemAdmin reset MFA for a user |
| `auth.password.changed` | User changed their own password |
| `auth.password.resetForced` | Admin set `forcePasswordReset` |
| `auth.session.revoked` | Admin revoked a user's session(s) |

### 4.2 Authorization

| Event | When |
| --- | --- |
| `permission.denied` | `requirePermission()` rejected the actor. **Always logged.** |

### 4.3 User and role administration

| Event | When |
| --- | --- |
| `user.invited` | Admin invited a new user |
| `user.activated` | Invited user completed setup |
| `user.disabled` | `disabledAt` set |
| `user.enabled` | `disabledAt` cleared |
| `user.role.granted` | Role added to user |
| `user.role.revoked` | Role removed from user |
| `role.created` | New role defined |
| `role.permission.granted` | Permission added to role |
| `role.permission.revoked` | Permission removed from role |

### 4.4 Schedule

| Event |
| --- |
| `schedule.shift.created` |
| `schedule.shift.updated` |
| `schedule.shift.deleted` |
| `schedule.assignment.created` |
| `schedule.assignment.updated` |
| `schedule.assignment.removed` |
| `schedule.published` |
| `schedule.openShift.created` |
| `schedule.openShift.application.submitted` |
| `schedule.openShift.application.approved` |
| `schedule.openShift.application.denied` |
| `schedule.swap.requested` |
| `schedule.swap.approved` |
| `schedule.swap.denied` |
| `availability.block.created` |
| `availability.block.updated` |
| `availability.block.deleted` |

### 4.5 Requests

| Event |
| --- |
| `request.created` (with `metadata.requestKind`) |
| `request.updated` |
| `request.commented` |
| `request.approved` (`metadata.level: 'supervisor' | 'command'`) |
| `request.denied` |
| `request.cancelled` |

### 4.6 Announcements / Policies / Training

| Event |
| --- |
| `announcement.created` |
| `announcement.published` |
| `announcement.acknowledged` |
| `policy.uploaded` |
| `policy.published` |
| `policy.acknowledged` |
| `training.record.created` |
| `training.record.updated` |
| `training.request.created` |
| `training.request.approved` |
| `training.request.denied` |

### 4.7 Equipment / Vehicles / Events

| Event |
| --- |
| `equipment.request.created` |
| `equipment.request.approved` |
| `equipment.request.denied` |
| `equipment.assigned` |
| `equipment.returned` |
| `vehicle.issue.reported` |
| `vehicle.issue.statusChanged` |
| `vehicle.serviced` |
| `event.created` |
| `event.updated` |
| `event.staffing.assigned` |

### 4.8 File attachments

| Event |
| --- |
| `attachment.uploaded` (metadata: classification, mime, size, checksum) |
| `attachment.downloaded` |
| `attachment.deleted` |

### 4.9 Audit and settings

| Event |
| --- |
| `audit.viewed` (the audit log itself was queried) |
| `audit.exported` (a CSV/JSON export was generated) |
| `setting.updated` (department-wide setting changed) |
| `backup.restore.tested` (manual marker for restore drills) |

---

## 5. The `auditLog()` helper

Signature (see `src/lib/audit/audit.ts`):

```ts
auditLog({
  actor,            // session or { userId, roles, ip, userAgent } — required for user-facing events
  eventType,        // from EVENTS catalog
  entityType,       // optional, where applicable
  entityId,         // optional
  action,           // verb
  result,           // 'success' | 'failure' | 'denied'
  requestId,        // from getRequestId(headers)
  metadata,         // structured JSON — REDACTED before write
})
```

Rules:

1. **Must be called server-side.** There is no client API for audit.
2. **Must be awaited** for security-relevant events. Errors thrown by `auditLog()` propagate; the calling action fails.
3. **Metadata is redacted** through `redact()` (`src/lib/security/redact.ts`) before persisting — strips `password`, `token`, `secret`, `mfa*`, `apiKey`, etc.
4. **No user-typed text** beyond what's necessary to interpret the event. Don't dump the entire request body into `metadata`.
5. **Payload size cap**: `metadata` JSON serialized > 8 KB is truncated to a placeholder; engineers should narrow the metadata shape rather than rely on truncation.

Convenience: `withAudit(eventType, fn)` wraps a server action so success/failure are logged consistently.

---

## 6. Special cases

### Failed login by unknown email

- We **do not** record the typed email as `entityId` (it could be a typo, a phishing target, or a third-party email).
- We record `eventType: 'auth.login.failure'`, `actorUserId: null`, `metadata: { reason: 'no_such_user' }`, plus IP/UA.

### Bot probes and pre-auth requests

- Requests rejected by middleware before any user is identified are not logged in `AuditLog` (they would flood it). They are visible in Caddy/Nginx logs and may trip `fail2ban`.

### System/cron jobs

- Use `actorUserId: null`, `actorRoleSnapshot: ['system']`, and a stable `metadata.systemJob` identifier.

---

## 7. Retention and export

- **Retention:** 7 years for security and authorization events (`auth.*`, `permission.denied`, `user.role.*`, `auditExported`); 3 years for everything else. Both are configurable per departmental record-retention policy.
- A retention job (cron or `pg_cron`) deletes rows past their cutoff, **logging a single `audit.retention.purged` summary event** with counts. (This summary is not itself purged.)
- **Export:** requires `audit.export` permission. Generates a CSV or NDJSON for a filter range; emits `audit.exported` capturing the filter and row count.
- Exports go to the requesting admin only; they are **not** stored on the server beyond the immediate response.

---

## 8. Reading the audit log (admin UX)

The Audit Log admin screen supports:

- Filter by actor (typeahead user search)
- Filter by event type (multi-select)
- Filter by entity type + entity ID (deep-link from any record's history)
- Filter by date range
- Filter by `result` (`denied` only, `failure` only, etc.)
- Sort by `createdAt`
- Export current filter (subject to permission)

Reading the log itself emits `audit.viewed` with the filter as `metadata`.

---

## 9. What audit logging is not

- It is not a **performance-tracing** tool. Use real APM/log-aggregation for that.
- It is not a **substitute for backups**. It records actions, not full state.
- It is not a **legal record on its own**. It supports the department's record-keeping practices; the department, not this system, is the authority on what counts as an official record.

---

## 10. Engineer checklist when adding a feature

1. What events does this feature produce? Add them to the catalog.
2. Where is the action authorized? Confirm `requirePermission(...)` is called.
3. What metadata is necessary to reconstruct decisions later? Make it structured, not free-text.
4. Is the metadata free of secrets? Confirm `redact()` covers it.
5. Is the audit write `await`ed before returning success?
6. Add a test (when the feature has tests) that exercises the denial path and asserts the `permission.denied` event.

If a code reviewer cannot find the audit calls in a PR that ships a server action, the PR is not ready.
