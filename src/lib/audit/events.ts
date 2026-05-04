/**
 * Audit event-type catalog.
 * See /docs/AUDIT_LOGGING.md for the authoritative description of each event.
 *
 * Use the EVENTS const so a typo becomes a TypeScript error, not a silent
 * drift in the log.
 */

export const EVENTS = {
  // Authentication
  AUTH_LOGIN_SUCCESS:        "auth.login.success",
  AUTH_LOGIN_FAILURE:        "auth.login.failure",
  AUTH_LOGOUT:               "auth.logout",
  AUTH_LOCKOUT_TRIGGERED:    "auth.lockout.triggered",
  AUTH_LOCKOUT_EXPIRED:      "auth.lockout.expired",
  AUTH_MFA_ENROLLED:         "auth.mfa.enrolled",
  AUTH_MFA_RESET:            "auth.mfa.reset",
  AUTH_PASSWORD_CHANGED:     "auth.password.changed",
  AUTH_PASSWORD_RESET_FORCED:"auth.password.resetForced",
  AUTH_SESSION_REVOKED:      "auth.session.revoked",

  // Authorization
  PERMISSION_DENIED:         "permission.denied",

  // User / role
  USER_INVITED:              "user.invited",
  USER_ACTIVATED:            "user.activated",
  USER_DISABLED:             "user.disabled",
  USER_ENABLED:              "user.enabled",
  USER_ROLE_GRANTED:         "user.role.granted",
  USER_ROLE_REVOKED:         "user.role.revoked",
  ROLE_CREATED:              "role.created",
  ROLE_PERM_GRANTED:         "role.permission.granted",
  ROLE_PERM_REVOKED:         "role.permission.revoked",

  // Schedule
  SCHEDULE_SHIFT_CREATED:        "schedule.shift.created",
  SCHEDULE_SHIFT_UPDATED:        "schedule.shift.updated",
  SCHEDULE_SHIFT_DELETED:        "schedule.shift.deleted",
  SCHEDULE_ASSIGN_CREATED:       "schedule.assignment.created",
  SCHEDULE_ASSIGN_UPDATED:       "schedule.assignment.updated",
  SCHEDULE_ASSIGN_REMOVED:       "schedule.assignment.removed",
  SCHEDULE_PUBLISHED:            "schedule.published",
  OPEN_SHIFT_CREATED:            "schedule.openShift.created",
  OPEN_SHIFT_APP_SUBMITTED:      "schedule.openShift.application.submitted",
  OPEN_SHIFT_APP_APPROVED:       "schedule.openShift.application.approved",
  OPEN_SHIFT_APP_DENIED:         "schedule.openShift.application.denied",
  SWAP_REQUESTED:                "schedule.swap.requested",
  SWAP_APPROVED:                 "schedule.swap.approved",
  SWAP_DENIED:                   "schedule.swap.denied",

  AVAILABILITY_CREATED:          "availability.block.created",
  AVAILABILITY_UPDATED:          "availability.block.updated",
  AVAILABILITY_DELETED:          "availability.block.deleted",

  // Requests
  REQUEST_CREATED:               "request.created",
  REQUEST_UPDATED:               "request.updated",
  REQUEST_COMMENTED:             "request.commented",
  REQUEST_APPROVED:              "request.approved",
  REQUEST_DENIED:                "request.denied",
  REQUEST_CANCELLED:             "request.cancelled",

  // Announcements
  ANNOUNCEMENT_CREATED:          "announcement.created",
  ANNOUNCEMENT_PUBLISHED:        "announcement.published",
  ANNOUNCEMENT_ACK:              "announcement.acknowledged",

  // Policies
  POLICY_UPLOADED:               "policy.uploaded",
  POLICY_PUBLISHED:              "policy.published",
  POLICY_ACK:                    "policy.acknowledged",

  // Training
  TRAINING_RECORD_CREATED:       "training.record.created",
  TRAINING_RECORD_UPDATED:       "training.record.updated",
  TRAINING_REQUEST_CREATED:      "training.request.created",
  TRAINING_REQUEST_APPROVED:     "training.request.approved",
  TRAINING_REQUEST_DENIED:       "training.request.denied",

  // Equipment
  EQUIPMENT_REQUEST_CREATED:     "equipment.request.created",
  EQUIPMENT_REQUEST_APPROVED:    "equipment.request.approved",
  EQUIPMENT_REQUEST_DENIED:      "equipment.request.denied",
  EQUIPMENT_ASSIGNED:            "equipment.assigned",
  EQUIPMENT_RETURNED:            "equipment.returned",

  // Vehicles
  VEHICLE_ISSUE_REPORTED:        "vehicle.issue.reported",
  VEHICLE_ISSUE_STATUS:          "vehicle.issue.statusChanged",
  VEHICLE_SERVICED:              "vehicle.serviced",

  // Events
  EVENT_CREATED:                 "event.created",
  EVENT_UPDATED:                 "event.updated",
  EVENT_STAFFING_ASSIGNED:       "event.staffing.assigned",

  // Attachments
  ATTACHMENT_UPLOADED:           "attachment.uploaded",
  ATTACHMENT_DOWNLOADED:         "attachment.downloaded",
  ATTACHMENT_DELETED:            "attachment.deleted",

  // Audit / settings
  AUDIT_VIEWED:                  "audit.viewed",
  AUDIT_EXPORTED:                "audit.exported",
  AUDIT_RETENTION_PURGED:        "audit.retention.purged",
  SETTING_UPDATED:               "setting.updated",
  BACKUP_RESTORE_TESTED:         "backup.restore.tested",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];
