import { db, tickets, categories, users, roles, students, hostels, ticket_statuses, domains, ticket_attachments, ticket_activity, admin_profiles, subcategories } from '@/db';
import { eq, desc, asc, aliasedTable, or, and } from 'drizzle-orm';
import type { TicketMetadata } from '@/db/inferred-types';
import { getCachedAdminUser, getCachedAdminAssignment, getCachedUserRole } from '@/lib/cache/cached-queries';
import { buildTimeline } from '@/lib/ticket/formatting/buildTimeline';
import { normalizeStatusForComparison } from '@/lib/utils';
import { getCachedTicketStatuses } from '@/lib/cache/cached-queries';
import { buildProgressMap } from '@/lib/status/getTicketStatuses';
import { getCategoryProfileFields, getCategorySchema } from '@/lib/category/categories';
import { resolveProfileFields } from '@/lib/ticket/validation/profileFieldResolver';
import { extractDynamicFields } from '@/lib/ticket/formatting/formatDynamicFields';
import { format } from 'date-fns';
import { addBusinessHours } from '@/lib/ticket/utils/tat-calculator';
import { ticketMatchesAdminAssignment, getAdminAssignedCategoryDomains } from '@/lib/assignment/admin-assignment';
import { enrichTimelineWithTAT } from '@/lib/ticket/formatting/enrichTimeline';
import { parseTicketMetadata, extractImagesFromMetadata } from '@/lib/ticket/validation/parseTicketMetadata';
import { calculateTATInfo } from '@/lib/ticket/utils/calculateTAT';

export type AdminType = 'admin' | 'snr-admin' | 'superadmin' | 'committee';

export interface AdminTicketData {
  ticket: any;
  metadata: TicketMetadata;
  timelineEntries: any[];
  resolvedProfileFields: any[];
  dynamicFields: any[];
  images: string[];
  comments: any[];
  tatInfo: any;
  normalizedStatus: string;
  ticketProgress: number;
  statusDisplay: string | { value: string; label: string; badge_color?: string | null };
  category: string;
  subcategory: string;
  assignedStaff: string;
  hasTAT: boolean;
  isSuperAdmin?: boolean;
  currentAssignedTo?: string | null;
  forwardTargets?: any[];
  tatExtensionCount?: number;
  escalationLevel?: number;
}

/**
 * Get ticket data for admin/snr-admin/superadmin pages
 */
export async function getAdminTicketData(
  ticketId: number,
  adminType: AdminType,
  userId: string
): Promise<AdminTicketData> {
  const dbUser = await getCachedAdminUser(userId);
  if (!dbUser) throw new Error('User not found');

  // Fetch ticket with all necessary relations in parallel
  const [ticketResult, activitiesResult, attachmentsResult, commentActivities] = await Promise.all([
    // Get ticket with relations
    db
      .select({
        ticket: tickets,
        status: ticket_statuses,
        category: categories,
        subcategory: subcategories,
        assignedTo: users,
        assignedToProfile: admin_profiles,
        creator: aliasedTable(users, 'creator'),
        domain: domains,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
      .leftJoin(users, eq(tickets.assigned_to, users.id))
      .leftJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
      .leftJoin(aliasedTable(users, 'creator'), eq(tickets.created_by, aliasedTable(users, 'creator').id))
      .leftJoin(domains, eq(categories.domain_id, domains.id))
      .where(eq(tickets.id, ticketId))
      .limit(1),

    // Fetch activities for timeline
    db
      .select({
        id: ticket_activity.id,
        action: ticket_activity.action,
        details: ticket_activity.details,
        visibility: ticket_activity.visibility,
        created_at: ticket_activity.created_at,
        user_id: ticket_activity.user_id,
        user_name: aliasedTable(users, 'activity_user').full_name,
      })
      .from(ticket_activity)
      .leftJoin(aliasedTable(users, 'activity_user'), eq(ticket_activity.user_id, aliasedTable(users, 'activity_user').id))
      .where(eq(ticket_activity.ticket_id, ticketId))
      .orderBy(asc(ticket_activity.created_at)),

    // Fetch attachments
    db
      .select()
      .from(ticket_attachments)
      .where(eq(ticket_attachments.ticket_id, ticketId)),

    // Fetch comments (activities with comment or internal_note action)
    // Fetch in ascending order (oldest first) so we can display oldest at top, newest at bottom
    db
      .select({
        id: ticket_activity.id,
        action: ticket_activity.action,
        details: ticket_activity.details,
        visibility: ticket_activity.visibility,
        created_at: ticket_activity.created_at,
        user_id: ticket_activity.user_id,
        user_name: aliasedTable(users, 'comment_user').full_name,
      })
      .from(ticket_activity)
      .leftJoin(aliasedTable(users, 'comment_user'), eq(ticket_activity.user_id, aliasedTable(users, 'comment_user').id))
      .where(
        and(
          eq(ticket_activity.ticket_id, ticketId),
          or(
            eq(ticket_activity.action, 'comment'),
            eq(ticket_activity.action, 'internal_note')
          )
        )
      )
      .orderBy(asc(ticket_activity.created_at)),
  ]);

  if (!ticketResult[0]) {
    throw new Error('Ticket not found');
  }

  const { ticket, status, category, subcategory, assignedTo, assignedToProfile, creator, domain } = ticketResult[0];

  // Access control based on admin type
  if (adminType === 'admin') {
    const isAssigned = ticket.assigned_to === dbUser.id;
    
    if (!isAssigned) {
      const adminAssignment = await getCachedAdminAssignment(userId);
      const assignedCategoryDomains = await getAdminAssignedCategoryDomains(dbUser.id);
      const ticketDomain = domain?.name || null;

      if (ticketDomain && assignedCategoryDomains.includes(ticketDomain)) {
        // Admin is assigned to this category's domain - allow access
      } else {
        const assignmentDomain = (adminAssignment?.domain || '').toLowerCase();
        if (assignmentDomain !== 'global' && adminAssignment?.domain) {
          const hasAccess = ticketMatchesAdminAssignment(
            { category: domain?.name || null, location: ticket.location || null },
            adminAssignment
          );
          if (!hasAccess) {
            throw new Error('Access denied');
          }
        }
      }
    }
  }

  // Parse metadata
  const metadata = parseTicketMetadata(ticket.metadata);
  const images = extractImagesFromMetadata(metadata);

  // Build timeline with activities
  const timelineEntries = buildTimeline(
    {
      ticket,
      activities: activitiesResult,
      statuses: [],
      attachments: attachmentsResult,
    },
    status?.value
  );

  // Enrich timeline with TAT information
  const enrichedTimeline = enrichTimelineWithTAT(timelineEntries, metadata);

  // Get profile fields configuration, category schema, and student data in parallel
  const [profileFieldsConfig, categorySchema, studentDataResult] = await Promise.all([
    ticket.category_id ? getCategoryProfileFields(ticket.category_id) : Promise.resolve([]),
    ticket.category_id ? getCategorySchema(ticket.category_id) : Promise.resolve(null),
    ticket.created_by ? db
      .select({
        student_id: students.id,
        hostel_id: students.hostel_id,
        room_no: students.room_no,
        hostel_name: hostels.name,
      })
      .from(students)
      .leftJoin(hostels, eq(students.hostel_id, hostels.id))
      .where(eq(students.user_id, ticket.created_by))
      .limit(1) : Promise.resolve([]),
  ]);

  const [studentRecord] = studentDataResult || [null];
  const userRecord = {
    name: creator?.full_name || null,
    email: creator?.email || null,
  };

  const resolvedProfileFields = resolveProfileFields(
    profileFieldsConfig,
    metadata as Record<string, unknown>,
    studentRecord,
    userRecord
  );

  // Extract dynamic fields with proper schema
  const dynamicFields = extractDynamicFields(metadata, categorySchema || {});

  // Calculate TAT info
  const tatInfo = calculateTATInfo(ticket, metadata);

  // Status and progress
  const normalizedStatus = normalizeStatusForComparison(status?.value);
  const ticketStatuses = await getCachedTicketStatuses();
  const progressMap = buildProgressMap(ticketStatuses);
  const ticketProgress = progressMap[normalizedStatus] || 0;
  const statusDisplay = status ? {
    value: status.value,
    label: status.label || status.value,
    badge_color: status.color || null,
  } : { value: 'unknown', label: 'Unknown', badge_color: null };

  // Transform comments for display (already sorted newest first from desc order)
  // We'll reverse in the component to show oldest first (newest at bottom)
  const comments = commentActivities.map(a => {
    const details = a.details as { comment?: string; attachments?: any[] } | null;
    const isInternal = a.action === 'internal_note' || a.visibility === 'admin_only';
    const isFromStudent = a.user_id === ticket.created_by;
    return {
      id: a.id,
      text: details?.comment || '',
      message: details?.comment || '',
      source: isFromStudent ? 'website' : 'admin',
      isInternal,
      type: isInternal ? 'internal_note' : 'comment',
      author: a.user_name || 'Unknown',
      created_by: a.user_name || 'Unknown',
      createdAt: a.created_at,
      created_at: a.created_at,
    };
  });

  // Assignment info - return object for TicketQuickInfo component
  const assignedStaffString = assignedTo ? `${assignedTo.full_name}${assignedToProfile?.designation ? ` (${assignedToProfile.designation})` : ''}` : 'Unassigned';
  const assignedStaff = assignedTo ? {
    name: assignedTo.full_name,
    email: assignedTo.email,
    role: assignedToProfile?.designation || undefined,
    avatar_url: assignedTo.avatar_url || null,
  } : null;

  // TAT info
  const hasTAT = !!(ticket.resolution_due_at || metadata?.tatDate);

  // Admin-specific data
  const isSuperAdmin = adminType === 'superadmin';
  const currentAssignedTo = ticket.assigned_to;

  // Fetch forward targets (admin users)
  const forwardTargets = await db
    .select({
      id: users.id,
      name: users.full_name,
      email: users.email,
    })
    .from(users)
    .leftJoin(roles, eq(users.role_id, roles.id))
    .where(
      or(
        eq(roles.name, "super_admin"),
        eq(roles.name, "snr_admin"),
        eq(roles.name, "admin")
      )
    );

  // Build ticket object with all necessary fields
  const ticketObj = {
    ...ticket,
    ticket_number: ticket.ticket_number,
    title: ticket.title,
    description: ticket.description,
    location: ticket.location,
    priority: ticket.priority,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    resolved_at: ticket.resolved_at,
    closed_at: ticket.closed_at,
    rating: ticket.rating,
    escalation_level: ticket.escalation_level,
    due_at: ticket.resolution_due_at,
    creator_name: creator?.full_name || null,
    creator_email: creator?.email || null,
  };

  return {
    ticket: ticketObj,
    metadata,
    timelineEntries: enrichedTimeline,
    resolvedProfileFields,
    dynamicFields,
    images,
    comments,
    tatInfo,
    normalizedStatus,
    ticketProgress,
    statusDisplay,
    category: category?.name || 'Uncategorized',
    subcategory: subcategory?.name || '',
    assignedStaff: assignedStaffString,
    hasTAT,
    isSuperAdmin,
    currentAssignedTo,
    forwardTargets,
    tatExtensionCount: metadata?.tatExtensions?.length || 0,
    escalationLevel: ticket.escalation_level || 0,
  };
}

/**
 * Get ticket data for committee pages
 */
export async function getCommitteeTicketData(
  ticketId: number,
  userId: string
): Promise<AdminTicketData> {
  const { getCommitteeTicketData: getCommitteeData } = await import('@/lib/ticket/data/getCommitteeTicketData');
  const { canCommitteeAccessTicket } = await import('@/lib/ticket/utils/committeeAccess');
  const { getCachedUser } = await import('@/lib/cache/cached-queries');
  
  const dbUser = await getCachedUser(userId);
  if (!dbUser) throw new Error('User not found');

  // Check access
  const canAccess = await canCommitteeAccessTicket(ticketId, dbUser.id);
  if (!canAccess) {
    throw new Error('Access denied');
  }

  // Fetch committee data
  const committeeData = await getCommitteeData(ticketId);
  if (!committeeData) {
    throw new Error('Ticket not found');
  }

  const { ticket, category, creator, student, profileFields, dynamicFields, comments: committeeComments } = committeeData;

  // Transform comments to match expected format
  const comments = (committeeComments || []).map((c: any) => ({
    id: c.id || Math.random(),
    text: c.text || '',
    message: c.text || '',
    source: c.source || 'admin',
    isInternal: c.isInternal || c.type === 'internal_note',
    type: c.type || 'comment',
    author: c.author || 'Unknown',
    created_by: c.author || 'Unknown',
    createdAt: c.created_at || c.createdAt,
    created_at: c.created_at || c.createdAt,
  }));

  // Parse metadata
  const metadata = parseTicketMetadata(ticket.metadata);
  const images = extractImagesFromMetadata(metadata);

  // Build timeline
  const ticketForTimeline = {
    ...ticket,
    status: ticket.status?.value || null,
    acknowledged_at: metadata.acknowledged_at ? (typeof metadata.acknowledged_at === 'string' ? new Date(metadata.acknowledged_at) : metadata.acknowledged_at instanceof Date ? metadata.acknowledged_at : null) : null,
    resolved_at: metadata.resolved_at ? (typeof metadata.resolved_at === 'string' ? new Date(metadata.resolved_at) : metadata.resolved_at instanceof Date ? metadata.resolved_at : null) : null,
    reopened_at: metadata.reopened_at ? (typeof metadata.reopened_at === 'string' ? new Date(metadata.reopened_at) : metadata.reopened_at instanceof Date ? metadata.reopened_at : null) : null,
  };

  const normalizedStatus = normalizeStatusForComparison(ticket.status?.value || 'open');
  const baseTimeline = buildTimeline(ticketForTimeline, normalizedStatus);
  const timelineEntries = enrichTimelineWithTAT(baseTimeline, ticket, { normalizedStatus, ticketProgress: 0 });

  // Resolve profile fields
  const resolvedProfileFields = resolveProfileFields(
    profileFields,
    metadata,
    student ? { hostel_id: student.hostel_id, hostel_name: student.hostel_name, room_no: student.room_no } : undefined,
    creator ? { name: creator.full_name || 'Unknown', email: creator.email } : undefined
  );

  // Get category schema for dynamic fields
  const categorySchema = ticket.category_id ? await getCategorySchema(ticket.category_id) : null;

  // Extract dynamic fields with proper schema
  const normalizedDynamicFields = extractDynamicFields(metadata, categorySchema || {});

  // Calculate TAT info
  const ticketStatuses = await getCachedTicketStatuses();
  const progressMap = buildProgressMap(ticketStatuses);
  const ticketProgress = progressMap[normalizedStatus] || 0;
  const tatInfo = calculateTATInfo(ticket, { normalizedStatus, ticketProgress });

  // Fetch full ticket to get ticket_number
  const [fullTicket] = await db
    .select({
      ticket_number: tickets.ticket_number,
      priority: tickets.priority,
      rating: tickets.rating,
      closed_at: tickets.closed_at,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  // Build ticket object
  const ticketObj = {
    ...ticket,
    ticket_number: fullTicket?.ticket_number || `TKT-${ticket.id}`,
    title: ticket.title,
    description: ticket.description,
    location: ticket.location,
    priority: fullTicket?.priority || ticket.priority || 'medium',
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    resolved_at: ticket.resolution_due_at || null,
    closed_at: fullTicket?.closed_at || null,
    rating: fullTicket?.rating || ticket.rating || null,
    escalation_level: ticket.escalation_level || 0,
    due_at: ticket.resolution_due_at,
    creator_name: creator?.full_name || null,
    creator_email: creator?.email || null,
  };

  return {
    ticket: ticketObj,
    metadata,
    timelineEntries,
    resolvedProfileFields,
    dynamicFields: normalizedDynamicFields || [],
    images,
    comments,
    tatInfo,
    normalizedStatus,
    ticketProgress,
    statusDisplay: ticket.status ? {
      value: ticket.status.value,
      label: ticket.status.label || ticket.status.value,
      badge_color: ticket.status.color || null,
    } : { value: 'unknown', label: 'Unknown', badge_color: null },
    category: category?.name || 'Uncategorized',
    subcategory: metadata.subcategory ? String(metadata.subcategory) : '',
    assignedStaff: 'Unassigned',
    hasTAT: !!(ticket.resolution_due_at || metadata?.tatDate),
    isSuperAdmin: false,
    currentAssignedTo: null,
    forwardTargets: [],
    tatExtensionCount: metadata?.tatExtensions?.length || 0,
    escalationLevel: ticket.escalation_level || 0,
  };
}
