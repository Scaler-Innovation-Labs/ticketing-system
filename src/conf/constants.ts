/**
 * Application Constants
 * 
 * Centralized configuration for business rules, limits, and magic strings.
 * Prefer constants over hardcoded values for maintainability.
 */

// ============================================
// User Roles
// ============================================

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SNR_ADMIN: 'snr_admin',
  ADMIN: 'admin',
  COMMITTEE: 'committee',
  STUDENT: 'student',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// ============================================
// Ticket Statuses
// ============================================

export const TICKET_STATUS = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  CANCELLED: 'cancelled',
} as const;

export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS];
export type TicketStatusValue = TicketStatus;

// ============================================
// Business Rules
// ============================================

export const LIMITS = {
  // Ticket creation
  WEEKLY_TICKET_LIMIT: 3, // Students can create 3 tickets per week
  MAX_DESCRIPTION_LENGTH: 20000,
  MAX_LOCATION_LENGTH: 500,
  MAX_ATTACHMENTS: 5,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Rate limiting
  API_REQUESTS_PER_MINUTE: 10,
  TICKET_CREATIONS_PER_MINUTE: 5,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // TAT (Turn Around Time)
  DEFAULT_TAT_HOURS: 48,
  MAX_TAT_EXTENSIONS: 3,

  // Escalation
  MAX_ESCALATION_LEVELS: 3,
  MAX_FORWARD_COUNT: 3,
  MAX_REOPEN_COUNT: 3,
} as const;

// ============================================
// SLA (Service Level Agreement)
// ============================================

export const SLA = {
  ACKNOWLEDGEMENT_HOURS: 2,  // Admin must acknowledge within 2 hours
  RESOLUTION_HOURS: 48,      // Default resolution time
  ESCALATION_HOURS: 72,      // Auto-escalate after 72 hours
} as const;

// ============================================
// Notification Priorities
// ============================================

export const NOTIFICATION_PRIORITY = {
  LOW: 5,
  NORMAL: 3,
  HIGH: 1,
  URGENT: 0,
} as const;

// ============================================
// File Upload
// ============================================

export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/pdf',
] as const;

export const ALLOWED_FILE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
] as const;

// ============================================
// Cache TTLs (in milliseconds)
// ============================================

export const CACHE_TTL = {
  USER_ROLE: 5 * 60 * 1000,           // 5 minutes
  CATEGORY_LIST: 60 * 60 * 1000,      // 1 hour
  TICKET_STATUS: 60 * 60 * 1000,      // 1 hour
  SUPER_ADMIN: 5 * 60 * 1000,         // 5 minutes
} as const;

// ============================================
// Database
// ============================================

export const DB_CONFIG = {
  MAX_CONNECTIONS: 20,
  IDLE_TIMEOUT: 20, // seconds
  CONNECT_TIMEOUT: 10, // seconds
  MAX_LIFETIME: 30 * 60, // 30 minutes
} as const;

// ============================================
// Outbox Pattern
// ============================================

export const OUTBOX = {
  DEFAULT_MAX_ATTEMPTS: 3,
  DEFAULT_PRIORITY: 5,
  BATCH_SIZE: 10,
  PROCESSING_TIMEOUT: 50000, // 50 seconds (leave 10s buffer for 60s function timeout)
  RETRY_DELAY_BASE: 2000, // 2 seconds, exponential backoff
} as const;

// ============================================
// Idempotency
// ============================================

export const IDEMPOTENCY = {
  TTL_HOURS: 24,
  KEY_LENGTH: 64,
} as const;

// ============================================
// Validation Patterns
// ============================================

export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  ROLL_NO: /^[A-Z0-9]{4,20}$/i,
} as const;

// ============================================
// Event Types
// ============================================

export const EVENT_TYPES = {
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  TICKET_ESCALATED: 'ticket.escalated',
  TICKET_COMMENT_ADDED: 'ticket.comment_added',
  TICKET_REOPENED: 'ticket.reopened',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  NOTIFICATION_SEND: 'notification.send',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// ============================================
// Ratings & Feedback
// ============================================

export const RATING = {
  BAD: 1,
  POOR: 2,
  AVERAGE: 3,
  GOOD: 4,
  EXCELLENT: 5,
} as const;

export const FEEDBACK_TYPE = {
  BUG: 'bug',
  FEATURE: 'feature',
  IMPROVEMENT: 'improvement',
  OTHER: 'other',
} as const;
