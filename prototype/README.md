# Prototype — UI/UX reference only

This directory contains the original single-file demo (`index.html`) used to validate workflow ideas with department leadership. It is **not** the production application and **must not** be treated as a security boundary.

## What this is

- A static HTML/JSX-via-Babel single-page artifact
- All data is mock and hard-coded (fictional names, badges, schedules)
- Role switching is a client-side dropdown — there is no real identity
- The "PIN gate" (`RPD51`) is a presentation curtain only; the value is in client source and grants nothing
- No server, no database, no audit trail

## Why we keep it

- It captures the visual language (navy/slate/white municipal palette, sidebar nav, KPI cards, schedule grid, TV-display mode) we want the production build to match
- It documents intended workflows for: dashboard, schedule, open shifts, requests, training, announcements, policies, equipment, vehicles, special events, directory, admin, audit
- It is faster to look at than to re-explain in prose

## What it must never become

- The deployed system
- A staging environment
- A way to "log in" without the real identity provider
- A place to store any real data — names, schedules, BOLOs, addresses, anything

The production application — built under the repo root in `src/`, `prisma/`, `docs/`, etc. — replaces this prototype entirely. The prototype lives here for reference only and will be removed once feature parity is reached in production.

## Important

If anything in this prototype shows up in a screenshot used outside the development team (e.g. shown to a vendor, uploaded to a ticket, posted to a public chat), confirm first that no real-looking data has been substituted into the mock fields.

See [`/docs/DATA_BOUNDARIES.md`](../docs/DATA_BOUNDARIES.md) for what may and may not enter the production system, and [`/docs/SECURITY_MODEL.md`](../docs/SECURITY_MODEL.md) for the production security posture.
