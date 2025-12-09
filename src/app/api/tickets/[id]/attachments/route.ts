/**
 * Ticket Attachments API
 * 
 * POST /api/tickets/[id]/attachments
 * Upload attachments for a ticket
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { db, ticket_attachments, tickets } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

/**
 * Schema for attachment metadata
 */
const AttachmentSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_url: z.string().url(),
  file_size: z.number().int().positive().max(MAX_FILE_SIZE),
  mime_type: z.string().refine((type) => ALLOWED_MIME_TYPES.includes(type), {
    message: 'File type not allowed',
  }),
});

const AttachmentsRequestSchema = z.object({
  attachments: z
    .array(AttachmentSchema)
    .min(1)
    .max(MAX_FILES, `Maximum ${MAX_FILES} files allowed`),
});

/**
 * POST /api/tickets/[id]/attachments
 * Add attachments to ticket
 * 
 * Note: Actual file upload should be handled by a separate service (e.g., S3, Cloudinary)
 * This endpoint only stores the attachment metadata after upload is complete
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = AttachmentsRequestSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid attachment data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { attachments } = validation.data;

    // Verify ticket exists and check ownership for students
    const role = await getUserRole(dbUser.id);
    const [ticket] = await db
      .select({ created_by: tickets.created_by })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Students can only add attachments to their own tickets
    if (role === USER_ROLES.STUDENT && ticket.created_by !== dbUser.id) {
      throw Errors.forbidden('You can only add attachments to your own tickets');
    }

    // Insert attachments
    const insertedAttachments = await db
      .insert(ticket_attachments)
      .values(
        attachments.map((att) => ({
          ticket_id: ticketId,
          uploaded_by: dbUser.id,
          file_name: att.file_name,
          file_url: att.file_url,
          file_size: att.file_size,
          mime_type: att.mime_type,
        }))
      )
      .returning();

    // Update ticket updated_at
    await db
      .update(tickets)
      .set({ updated_at: new Date() })
      .where(eq(tickets.id, ticketId));

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        count: attachments.length,
      },
      'Attachments added to ticket'
    );

    return ApiResponse.success(
      {
        attachments: insertedAttachments,
        message: `${attachments.length} attachment(s) uploaded successfully`,
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Failed to add attachments');
    return handleApiError(error);
  }
}
