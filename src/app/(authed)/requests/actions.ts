"use server";

/**
 * Server actions for the Requests module.
 *
 * Every action calls requirePermission() at the top — UI hiding is
 * usability, never the security boundary. Every meaningful mutation
 * emits an audit event with safe metadata (id, kind, old/new status,
 * affected user). Free-text fields run through the same boundary
 * validator the schedule module uses, since the prohibited content
 * list is identical.
 *
 * The five create actions live here so they share helpers (loggingCtx,
 * the boundary validator, and the type-bounded kind discriminator) and
 * can land or revert as one unit.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { validateNotes, notesErrorMessage } from "@/lib/schedule/notes";
import { canActorDecide, canCancelOwn } from "@/lib/requests/policy";
import type { RequestStatus } from "@/lib/requests/types";

async function loggingCtx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

// ── Create: time-off ────────────────────────────────────────────────

const TIME_OFF_TYPE = z.enum([
  "vacation",
  "sick",
  "bereavement",
  "jury",
  "military",
  "unpaid",
  "other",
]);

const TIME_OFF_SCHEMA = z.object({
  startDate: z.string().min(8).max(40),
  endDate: z.string().min(8).max(40),
  type: TIME_OFF_TYPE,
  reason: z.string().max(1000).optional().default(""),
  coverageNeeded: z.boolean().optional().default(false),
});

export async function createTimeOffRequest(input: z.infer<typeof TIME_OFF_SCHEMA>): Promise<
  { ok: true; requestId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/requests/time-off/new");
  await requirePermission(actor, "requests.create");
  const c = await loggingCtx();

  const parsed = TIME_OFF_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: "Invalid date." };
  }
  if (end < start) return { ok: false, error: "End must be after start." };

  const v = validateNotes(parsed.data.reason);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const description =
    `${parsed.data.type} · ${parsed.data.startDate} → ${parsed.data.endDate}` +
    (parsed.data.coverageNeeded ? " · coverage requested" : "");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tof = await tx.timeOffRequest.create({
      data: {
        userId: actor.userId,
        startDate: start,
        endDate: end,
        type: parsed.data.type,
        reason: parsed.data.reason || null,
        status: "pending",
      },
    });
    const req = await tx.adminRequest.create({
      data: {
        userId: actor.userId,
        kind: "timeOff",
        title: `Time off — ${parsed.data.type}`,
        description: `${description}${parsed.data.reason ? `\n\n${parsed.data.reason}` : ""}`,
        status: "submitted",
        timeOffRequestId: tof.id,
      },
    });
    return { req, tof };
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CREATED,
    entityType: "AdminRequest",
    entityId: result.req.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      kind: "timeOff",
      timeOffRequestId: result.tof.id,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      timeOffType: parsed.data.type,
      coverageNeeded: parsed.data.coverageNeeded,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.TIMEOFF_REQUESTED,
    entityType: "TimeOffRequest",
    entityId: result.tof.id,
    action: "request",
    result: "success",
    ...c,
  });

  revalidatePath("/requests");
  return { ok: true, requestId: result.req.id };
}

// ── Create: training ────────────────────────────────────────────────

const TRAINING_SCHEMA = z.object({
  courseName: z.string().min(1).max(200),
  provider: z.string().max(120).optional().default(""),
  location: z.string().max(120).optional().default(""),
  startDate: z.string().min(0).max(40).optional().default(""),
  endDate: z.string().min(0).max(40).optional().default(""),
  costEstimate: z.number().int().min(0).max(1_000_000).optional(),
  travelRequired: z.boolean().optional().default(false),
  lodgingRequired: z.boolean().optional().default(false),
  vehicleNeeded: z.boolean().optional().default(false),
  certificateExpected: z.boolean().optional().default(false),
  justification: z.string().max(2000).optional().default(""),
});

export async function createTrainingRequest(input: z.infer<typeof TRAINING_SCHEMA>): Promise<
  { ok: true; requestId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/requests/training/new");
  await requirePermission(actor, "requests.create");
  const c = await loggingCtx();

  const parsed = TRAINING_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.justification);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.startDate && isNaN((startDate as Date).getTime())) {
    return { ok: false, error: "Invalid start date." };
  }

  const description = [
    `Course: ${parsed.data.courseName}`,
    parsed.data.provider ? `Provider: ${parsed.data.provider}` : null,
    parsed.data.location ? `Location: ${parsed.data.location}` : null,
    parsed.data.startDate
      ? `Dates: ${parsed.data.startDate}${parsed.data.endDate ? ` → ${parsed.data.endDate}` : ""}`
      : null,
    parsed.data.costEstimate != null ? `Cost: $${(parsed.data.costEstimate / 100).toFixed(2)}` : null,
    parsed.data.travelRequired ? "Travel required" : null,
    parsed.data.lodgingRequired ? "Lodging required" : null,
    parsed.data.vehicleNeeded ? "Vehicle needed" : null,
    parsed.data.certificateExpected ? "Certificate expected" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tr = await tx.trainingRequest.create({
      data: {
        userId: actor.userId,
        courseName: parsed.data.courseName,
        courseDate: startDate,
        hostOrg: parsed.data.provider || null,
        cost: parsed.data.costEstimate ?? null,
        justification: parsed.data.justification || null,
      },
    });
    const req = await tx.adminRequest.create({
      data: {
        userId: actor.userId,
        kind: "training",
        title: `Training — ${parsed.data.courseName}`,
        description: parsed.data.justification
          ? `${description}\n\n${parsed.data.justification}`
          : description,
        status: "submitted",
        trainingRequestId: tr.id,
      },
    });
    return { req, tr };
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CREATED,
    entityType: "AdminRequest",
    entityId: result.req.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      kind: "training",
      trainingRequestId: result.tr.id,
      courseName: parsed.data.courseName,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.TRAINING_REQUEST_CREATED,
    entityType: "TrainingRequest",
    entityId: result.tr.id,
    action: "create",
    result: "success",
    ...c,
  });

  revalidatePath("/requests");
  return { ok: true, requestId: result.req.id };
}

// ── Create: vehicle issue ───────────────────────────────────────────

const VEH_PRIORITY = z.enum(["low", "medium", "high"]);

const VEH_SCHEMA = z.object({
  vehicleId: z.string().min(1).max(40),
  mileage: z.number().int().min(0).max(2_000_000).optional(),
  issueType: z.string().min(1).max(80),
  canRemainInService: z.boolean(),
  description: z.string().min(1).max(1500),
  priority: VEH_PRIORITY.optional().default("medium"),
});

export async function createVehicleIssueRequest(input: z.infer<typeof VEH_SCHEMA>): Promise<
  { ok: true; requestId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/requests/vehicle-issue/new");
  // vehicles.reportIssue is the natural permission; fall back to the generic
  // requests.create so an officer who can submit other requests can also
  // file a vehicle issue.
  if (!actor.permissionKeys.includes("vehicles.reportIssue")) {
    await requirePermission(actor, "requests.create");
  }
  const c = await loggingCtx();

  const parsed = VEH_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.description);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  const description = [
    `Unit: ${vehicle.unit} (${vehicle.model})`,
    parsed.data.mileage != null ? `Mileage: ${parsed.data.mileage}` : null,
    `Issue: ${parsed.data.issueType}`,
    `Can remain in service: ${parsed.data.canRemainInService ? "yes" : "no"}`,
    `Priority: ${parsed.data.priority}`,
    "",
    parsed.data.description,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const issue = await tx.vehicleIssue.create({
      data: {
        vehicleId: parsed.data.vehicleId,
        reportedById: actor.userId,
        description: parsed.data.description,
        priority: parsed.data.priority,
        status: "open",
      },
    });
    const req = await tx.adminRequest.create({
      data: {
        userId: actor.userId,
        kind: "vehicleIssue",
        title: `Vehicle issue — ${vehicle.unit}`,
        description,
        status: "submitted",
        vehicleIssueId: issue.id,
      },
    });
    return { req, issue };
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CREATED,
    entityType: "AdminRequest",
    entityId: result.req.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      kind: "vehicleIssue",
      vehicleIssueId: result.issue.id,
      vehicleUnit: vehicle.unit,
      priority: parsed.data.priority,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.VEHICLE_ISSUE_REPORTED,
    entityType: "VehicleIssue",
    entityId: result.issue.id,
    action: "report",
    result: "success",
    ...c,
  });

  revalidatePath("/requests");
  return { ok: true, requestId: result.req.id };
}

// ── Create: equipment ───────────────────────────────────────────────

const EQ_TYPE = z.enum(["new", "replacement", "damaged", "lost", "other"]);
const EQ_PRIORITY = z.enum(["low", "medium", "high"]);

const EQ_SCHEMA = z.object({
  item: z.string().min(1).max(120),
  category: z.string().max(80).optional().default(""),
  requestType: EQ_TYPE,
  priority: EQ_PRIORITY.optional().default("medium"),
  justification: z.string().max(2000).optional().default(""),
});

export async function createEquipmentRequest(input: z.infer<typeof EQ_SCHEMA>): Promise<
  { ok: true; requestId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/requests/equipment/new");
  if (!actor.permissionKeys.includes("equipment.request")) {
    await requirePermission(actor, "requests.create");
  }
  const c = await loggingCtx();

  const parsed = EQ_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.justification);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const description = [
    `Item: ${parsed.data.item}`,
    parsed.data.category ? `Category: ${parsed.data.category}` : null,
    `Type: ${parsed.data.requestType}`,
    `Priority: ${parsed.data.priority}`,
    parsed.data.justification ? `\n${parsed.data.justification}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const eq = await tx.equipmentRequest.create({
      data: {
        userId: actor.userId,
        item: parsed.data.item,
        reason: `${parsed.data.requestType}${parsed.data.justification ? ` — ${parsed.data.justification}` : ""}`,
      },
    });
    const req = await tx.adminRequest.create({
      data: {
        userId: actor.userId,
        kind: "equipment",
        title: `Equipment — ${parsed.data.item}`,
        description,
        status: "submitted",
        equipmentRequestId: eq.id,
      },
    });
    return { req, eq };
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CREATED,
    entityType: "AdminRequest",
    entityId: result.req.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      kind: "equipment",
      equipmentRequestId: result.eq.id,
      requestType: parsed.data.requestType,
      priority: parsed.data.priority,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.EQUIPMENT_REQUEST_CREATED,
    entityType: "EquipmentRequest",
    entityId: result.eq.id,
    action: "create",
    result: "success",
    ...c,
  });

  revalidatePath("/requests");
  return { ok: true, requestId: result.req.id };
}

// ── Create: IT / Facilities ─────────────────────────────────────────

const HELP_CATEGORY = z.enum([
  "it",
  "radio",
  "facilities",
  "softwareAccess",
  "supplies",
  "other",
]);
const HELP_PRIORITY = z.enum(["low", "medium", "high"]);

const HELP_SCHEMA = z.object({
  category: HELP_CATEGORY,
  priority: HELP_PRIORITY.optional().default("medium"),
  description: z.string().min(1).max(2000),
  location: z.string().max(120).optional().default(""),
});

export async function createHelpRequest(input: z.infer<typeof HELP_SCHEMA>): Promise<
  { ok: true; requestId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/requests/help/new");
  await requirePermission(actor, "requests.create");
  const c = await loggingCtx();

  const parsed = HELP_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.description);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const description = [
    `Category: ${parsed.data.category}`,
    `Priority: ${parsed.data.priority}`,
    parsed.data.location ? `Location: ${parsed.data.location}` : null,
    "",
    parsed.data.description,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const req = await prisma.adminRequest.create({
    data: {
      userId: actor.userId,
      kind: "itFacilities",
      title: `IT / Facilities — ${categoryLabel(parsed.data.category)}`,
      description,
      status: "submitted",
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CREATED,
    entityType: "AdminRequest",
    entityId: req.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      kind: "itFacilities",
      category: parsed.data.category,
      priority: parsed.data.priority,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.HELP_REQUESTED,
    entityType: "AdminRequest",
    entityId: req.id,
    action: "request",
    result: "success",
    ...c,
  });

  revalidatePath("/requests");
  return { ok: true, requestId: req.id };
}

function categoryLabel(c: z.infer<typeof HELP_CATEGORY>): string {
  switch (c) {
    case "it":
      return "IT";
    case "radio":
      return "Radio / MDC";
    case "facilities":
      return "Facilities";
    case "softwareAccess":
      return "Software access";
    case "supplies":
      return "Supplies";
    case "other":
      return "Other";
  }
}

// ── Comment ─────────────────────────────────────────────────────────

const COMMENT_SCHEMA = z.object({
  requestId: z.string().min(1).max(40),
  body: z.string().min(1).max(2000),
});

export async function addRequestComment(input: z.infer<typeof COMMENT_SCHEMA>) {
  const actor = await requireActor();
  const c = await loggingCtx();
  const parsed = COMMENT_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Invalid input." };

  const req = await prisma.adminRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!req) return { ok: false as const, error: "Request not found." };

  // Comment authors must either own the request or have read.all access.
  if (
    req.userId !== actor.userId &&
    !actor.permissionKeys.includes("requests.read.all")
  ) {
    return { ok: false as const, error: "Not authorized to comment on this request." };
  }

  const v = validateNotes(parsed.data.body);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const comment = await prisma.requestComment.create({
    data: { requestId: req.id, authorId: actor.userId, body: parsed.data.body },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_COMMENTED,
    entityType: "AdminRequest",
    entityId: req.id,
    action: "comment",
    result: "success",
    ...c,
    metadata: { commentId: comment.id, kind: req.kind, length: parsed.data.body.length },
  });

  revalidatePath(`/requests/${req.id}`);
  return { ok: true as const };
}

// ── Decisions: approve / deny / needsInfo / cancel / complete ───────

const DECIDE_SCHEMA = z.object({
  requestId: z.string().min(1).max(40),
  decisionNotes: z.string().max(1500).optional().default(""),
  level: z.enum(["supervisor", "command"]).optional(),
});

async function decideRequest(
  decision: "approve" | "deny" | "needsInfo" | "complete",
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireActor();
  // Approval permission is checked here BEFORE we look at the request
  // body so an unauthorized caller's permission.denied event is logged.
  if (decision === "approve" || decision === "deny" || decision === "needsInfo" || decision === "complete") {
    // Either supervisor or command level; canActorDecide narrows further.
    if (
      !actor.permissionKeys.includes("requests.approve.supervisor") &&
      !actor.permissionKeys.includes("requests.approve.command")
    ) {
      await requirePermission(actor, "requests.approve.supervisor");
    }
  }
  const c = await loggingCtx();
  const parsed = DECIDE_SCHEMA.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.decisionNotes);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const req = await prisma.adminRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { timeOffRequest: true, trainingRequest: true, equipmentRequest: true, vehicleIssue: true },
  });
  if (!req) return { ok: false, error: "Request not found." };

  const gate = canActorDecide({
    actorId: actor.userId,
    ownerUserId: req.userId,
    permissionKeys: actor.permissionKeys,
    decision,
    currentStatus: req.status as RequestStatus,
  });
  if (!gate.ok) return { ok: false, error: gate.error };

  const next: RequestStatus = gate.next;
  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.adminRequest.update({
      where: { id: req.id },
      data: {
        status: next,
        decidedById: actor.userId,
        decidedAt: now,
      },
    });

    if (parsed.data.decisionNotes) {
      await tx.requestComment.create({
        data: {
          requestId: req.id,
          authorId: actor.userId,
          body: `[${decisionLabel(decision)}] ${parsed.data.decisionNotes}`,
        },
      });
    }

    // Cascade child-record state where it matters operationally.
    if (req.kind === "timeOff" && req.timeOffRequestId) {
      const cascadeStatus =
        decision === "approve"
          ? "approved"
          : decision === "deny"
            ? "denied"
            : decision === "needsInfo"
              ? "pending"
              : "approved";
      await tx.timeOffRequest.update({
        where: { id: req.timeOffRequestId },
        data: {
          status: cascadeStatus,
          decidedById: actor.userId,
          decidedAt: now,
        },
      });
    }
    if (req.kind === "training" && req.trainingRequestId) {
      const cascade =
        decision === "approve" ? "approved" : decision === "deny" ? "denied" : "pending";
      await tx.trainingRequest.update({
        where: { id: req.trainingRequestId },
        data: { decision: cascade },
      });
    }
    if (req.kind === "equipment" && req.equipmentRequestId) {
      const cascade =
        decision === "approve" ? "approved" : decision === "deny" ? "denied" : "pending";
      await tx.equipmentRequest.update({
        where: { id: req.equipmentRequestId },
        data: { decision: cascade },
      });
    }
    if (req.kind === "vehicleIssue" && req.vehicleIssueId) {
      // Vehicle issues don't have approve/deny semantics; a "complete"
      // decision marks them resolved, otherwise leave the existing
      // VehicleIssue.status alone.
      if (decision === "complete") {
        await tx.vehicleIssue.update({
          where: { id: req.vehicleIssueId },
          data: { status: "resolved", resolvedAt: now, resolvedNotes: parsed.data.decisionNotes || null },
        });
      }
    }
  });

  const eventType =
    decision === "approve"
      ? EVENTS.REQUEST_APPROVED
      : decision === "deny"
        ? EVENTS.REQUEST_DENIED
        : decision === "needsInfo"
          ? EVENTS.REQUEST_NEEDS_INFO
          : EVENTS.REQUEST_COMPLETED;

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType,
    entityType: "AdminRequest",
    entityId: req.id,
    action: decision,
    result: "success",
    ...c,
    metadata: {
      kind: req.kind,
      affectedUserId: req.userId,
      oldStatus: req.status,
      newStatus: next,
      level: parsed.data.level ?? null,
    },
  });

  // Time-off-specific specialized event for downstream filtering.
  if (req.kind === "timeOff" && req.timeOffRequestId) {
    if (decision === "approve") {
      await auditLog({
        actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
        eventType: EVENTS.TIMEOFF_APPROVED,
        entityType: "TimeOffRequest",
        entityId: req.timeOffRequestId,
        action: "approve",
        result: "success",
        ...c,
        metadata: { affectedUserId: req.userId },
      });
    } else if (decision === "deny") {
      await auditLog({
        actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
        eventType: EVENTS.TIMEOFF_DENIED,
        entityType: "TimeOffRequest",
        entityId: req.timeOffRequestId,
        action: "deny",
        result: "success",
        ...c,
        metadata: { affectedUserId: req.userId },
      });
    }
  }

  revalidatePath(`/requests/${req.id}`);
  revalidatePath("/requests");
  revalidatePath("/requests/approvals");
  return { ok: true };
}

function decisionLabel(d: "approve" | "deny" | "needsInfo" | "complete"): string {
  switch (d) {
    case "approve":
      return "Approved";
    case "deny":
      return "Denied";
    case "needsInfo":
      return "Needs more info";
    case "complete":
      return "Completed";
  }
}

export async function approveRequest(input: z.infer<typeof DECIDE_SCHEMA>) {
  return decideRequest("approve", input);
}
export async function denyRequest(input: z.infer<typeof DECIDE_SCHEMA>) {
  return decideRequest("deny", input);
}
export async function needsMoreInfoRequest(input: z.infer<typeof DECIDE_SCHEMA>) {
  return decideRequest("needsInfo", input);
}
export async function completeRequest(input: z.infer<typeof DECIDE_SCHEMA>) {
  return decideRequest("complete", input);
}

// ── Cancel (owner-initiated) ────────────────────────────────────────

const CANCEL_SCHEMA = z.object({
  requestId: z.string().min(1).max(40),
  reason: z.string().max(500).optional().default(""),
});

export async function cancelOwnRequest(input: z.infer<typeof CANCEL_SCHEMA>) {
  const actor = await requireActor();
  const c = await loggingCtx();
  const parsed = CANCEL_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.reason);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const req = await prisma.adminRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { timeOffRequest: true, trainingRequest: true, equipmentRequest: true },
  });
  if (!req) return { ok: false as const, error: "Request not found." };
  if (
    !canCancelOwn({
      actorId: actor.userId,
      ownerUserId: req.userId,
      currentStatus: req.status as RequestStatus,
    })
  ) {
    return { ok: false as const, error: "You cannot cancel this request." };
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.adminRequest.update({
      where: { id: req.id },
      data: { status: "cancelled" },
    });
    if (parsed.data.reason) {
      await tx.requestComment.create({
        data: {
          requestId: req.id,
          authorId: actor.userId,
          body: `[Cancelled] ${parsed.data.reason}`,
        },
      });
    }
    if (req.kind === "timeOff" && req.timeOffRequestId) {
      await tx.timeOffRequest.update({
        where: { id: req.timeOffRequestId },
        data: { status: "withdrawn" },
      });
    }
    if (req.kind === "training" && req.trainingRequestId) {
      await tx.trainingRequest.update({
        where: { id: req.trainingRequestId },
        data: { decision: "withdrawn" },
      });
    }
    if (req.kind === "equipment" && req.equipmentRequestId) {
      await tx.equipmentRequest.update({
        where: { id: req.equipmentRequestId },
        data: { decision: "withdrawn" },
      });
    }
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.REQUEST_CANCELLED,
    entityType: "AdminRequest",
    entityId: req.id,
    action: "cancel",
    result: "success",
    ...c,
    metadata: { kind: req.kind, oldStatus: req.status },
  });

  revalidatePath(`/requests/${req.id}`);
  revalidatePath("/requests");
  return { ok: true as const };
}
