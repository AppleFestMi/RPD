# Data Boundaries

**Status:** Authoritative. This document defines what may and may not enter the system.
**Last updated:** 2026-05-04
**Audience:** All users, with sections for engineers and administrators.

---

## 1. The one-line rule

> RPD Internal Ops is for **administrative coordination only**. If the data would belong in CAD, RMS, evidence, body camera, HR/payroll, LEIN/NCIC, or any CJIS-regulated system, it does not go here.

---

## 2. Allowed data

These are the kinds of records this system is designed to hold. All names below are illustrative.

### 2.1 People (administrative profiles)

- Display name, rank, badge number, assignment label
- Department-issued email, department-issued phone extension
- Role assignments and permissions in this system
- Specialty tags for **administrative** scheduling: FTO, Firearms instructor, Bike, ATV, K-9 — i.e. labels that drive who can be scheduled to what
- Active/disabled flag
- Created/updated metadata

### 2.2 Schedule and availability

- Shift definitions (day, time, post)
- Assignments (who is on which shift)
- Open shifts, applications, approvals
- Reserve availability blocks
- Shift swap requests and approvals
- Time-off requests and status
- On-call rotation

### 2.3 Internal requests

- Time-off, training, shift swap, equipment, vehicle issue, IT/facilities
- Status, comments, decision, approver
- Request audit trail

### 2.4 Announcements

- Department-wide briefings, policy announcements, training reminders
- Author, timestamp, audience scope, acknowledgment status

### 2.5 Policies and SOPs

- Document title, version, effective date, category
- Acknowledgment records (who, when)
- Attached PDF (administrative content only — not investigative, not CJI)

### 2.6 Training

- Course catalog (administrative metadata)
- Personal training records: course, completion date, certificate file
- Training requests routed to command

### 2.7 Equipment and vehicles

- Equipment inventory, assignments, requests
- Vehicle list, mileage thresholds, reported issues, service status
- These are **administrative** records of department property — not evidence, not crime-scene photos.

### 2.8 Special events (operational, not investigative)

- Event name, date, location, expected attendance
- Staffing posts, assignments, mutual-aid agencies
- Site map / parade route attachments
- Briefings written for **department-internal coordination** of staffing — not subject-of-investigation material

### 2.9 Audit and security records

- Audit log of actions taken inside this system (see [`AUDIT_LOGGING.md`](AUDIT_LOGGING.md))
- Access logs, role-change history, settings history

---

## 3. Prohibited data

The following must never be entered into this system. This list is not exhaustive — when in doubt, ask, and default to "no."

### 3.1 CJI (Criminal Justice Information)

- Anything from LEIN, NCIC, or any CJIS-bound query
- Driver's license run results, plate run results, criminal history
- Wants, warrants, hot-file responses
- Anything you would not be allowed to email to your personal address

### 3.2 CAD / RMS / Case material

- Call-for-service narratives, dispatch transcripts
- Incident reports, supplements, narrative text from reports
- Witness statements, victim contact information, suspect descriptions
- Active investigative leads, case status, charging recommendations
- Field interview narratives in any identifying detail

### 3.3 Evidence and chain-of-custody

- Evidence item descriptions tied to a case
- Custody transfers, disposition decisions
- Lab results, forensic findings
- Body-camera footage or its metadata in a way that could reconstruct an incident

### 3.4 HR / payroll / discipline

- Disciplinary findings, internal-affairs status, hire/fire records
- Salary, benefits, FMLA, medical leave reasons
- Background investigation files
- Counseling memos with personnel-action language

### 3.5 Juvenile, victim, witness, intelligence

- Anything identifying a juvenile in a case context
- Victim/witness identities or statements
- Intelligence reports, gang/affiliation tracking
- Confidential-informant identities

### 3.6 Personal data unrelated to scheduling

- Officers' home addresses, personal phone numbers, family contacts
- Officers' medical conditions
- Off-duty employment specifics beyond a yes/no for conflict-of-interest tracking

---

## 4. Edge cases (and the right answer)

| Tempting to put here | Why not | Where instead |
| --- | --- | --- |
| "Watch for blue F-150, partial plate ABC" in a Pass-Down note | That's a BOLO. BOLOs are operational and may relate to active investigations. | CAD / RMS BOLO board |
| "Off. Smith disciplined for X" in an announcement | HR/discipline. | HR system |
| Officer's home address in directory | Personal-sensitive, no operational need. | Don't store anywhere; emergency contacts are HR's job |
| Suspect description in a special-event briefing | Investigative material. | Briefings here describe **our** staffing; investigative threats are CAD/RMS |
| Citizen complaint narrative | If it's an open IA matter, it's HR. If it's resolved and tracked at the admin/aggregate level, only counts and statuses are appropriate. | Internal Affairs system |
| LEIN/NCIC printout attached to a request | Never. | Stays in the system that produced it |
| Body cam still as evidence in a vehicle issue report | Not evidence appropriate. | Photo of the vehicle damage is fine; anything tied to a person/incident is not |

---

## 5. Form-level warnings

Every screen that accepts free text or attachments displays the boundary statement. Recommended copy (used verbatim by the `<BoundaryNotice />` component):

> **Administrative coordination only.** Do not enter CAD, RMS, evidence, body camera, HR/payroll, LEIN, NCIC, CJIS-regulated criminal justice information, criminal history, case reports, victim/witness data, juvenile data, intelligence records, or active investigative material.

The notice appears:

- Persistently in the application footer
- At the top of every request form
- In the file picker before any attachment upload
- On the special-event briefing editor
- On the announcement editor
- On the policy-upload screen
- In the admin "create user" and "manage roles" surfaces (different reason — to remind admins about role minimization)

---

## 6. Database notes for engineers

When designing or extending the schema:

1. **No free-form "incident" or "case" fields.** A request has a `description`, but that is for "I need a new holster" not "responded to 911 hangup at..."
2. **No fields named `caseNumber`, `incidentId`, `evidenceTag`, `subjectName`, `victim*`, `witness*`, `juvenile*`, `cjis*`, `lein*`, `ncic*`.** If a draft schema introduces one, it is a code-review blocker.
3. **File attachments** are restricted to specific MIME types (PDF, common image formats, plain text). Attachments are stored privately and served only to authenticated users with permission to read the parent record. The schema for `FileAttachment` includes `classification` so any attachment that drifts toward Personnel-Sensitive classification can be discovered.
4. **Searchable text fields** that could be misused (e.g. announcement bodies, briefing text) are subject to administrator review on creation, and are scannable for prohibited keywords (LEIN, NCIC, "case #", etc.) by an optional periodic job — not as a security control, but as a discoverability aid.
5. **Soft delete only** for operational records. Hard delete is administrator-only and audit-logged.

---

## 7. If a violation occurs

1. The user who entered the data should redact the record themselves if their role permits.
2. If they cannot, an Admin or SystemAdmin redacts via the admin tools (which audit-log the redaction).
3. Determine how the data got there. If it was a UI affordance that invited the misuse, file a UX/spec bug.
4. If the violation involved CJI, follow departmental CJIS-incident procedure — this system's audit log is one input, not the authority on how to handle the breach.

The goal is to make this system **boring**: nothing interesting to attackers, nothing operationally indispensable, nothing that ever needs to be subpoenaed because the data of record was always somewhere else.
