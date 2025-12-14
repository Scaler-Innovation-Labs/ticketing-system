/**
 * Tickets API - Create Ticket
 * 
 * POST /api/tickets - Creates a new ticket
 * GET /api/tickets - Lists tickets with filters
 */

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireDbUser, ApiResponse, getPaginationParams } from '@/lib/auth/helpers';
import { handleApiError } from '@/lib/errors';
import { createTicketCoreSchema, ticketFiltersSchema } from '@/schemas/ticket';
import { createTicket } from '@/lib/ticket/ticket-service';
import { listTickets } from '@/lib/ticket/ticket-list-service';
import { logger } from '@/lib/logger';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets
 * List tickets with filters and pagination
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    // 2. Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const { page, limit, offset } = getPaginationParams(searchParams);

    // 3. Parse and validate filters
    const filters = ticketFiltersSchema.parse({
      status: searchParams.get('status') || undefined,
      category_id: searchParams.get('category_id') || undefined,
      subcategory_id: searchParams.get('subcategory_id') || undefined,
      priority: searchParams.get('priority') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      created_by: searchParams.get('created_by') || undefined,
      search: searchParams.get('search') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
    });

    // 4. Students can only see their own tickets
    if (role === USER_ROLES.STUDENT) {
      filters.created_by = dbUser.id;
    }

    // 5. Get tickets
    const result = await listTickets(filters, { page, limit, offset });

    // 6. Return results
    return ApiResponse.success({
      tickets: result.tickets,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list tickets');
    return handleApiError(error);
  }
}

/**
 * POST /api/tickets
 * Create a new ticket
 */
export async function POST(req: NextRequest) {
  try {
    // OPTIMIZATION: Parallelize authentication and request body parsing
    const [{ dbUser }, body] = await Promise.all([
      requireDbUser(),
      req.json(),
    ]);
    
    // Merge details and profile into metadata if they exist separately
    // This handles the case where frontend sends details and profile separately
    if ((body.details || body.profile) && !body.metadata) {
      body.metadata = {
        ...(body.details || {}),
        ...(body.profile || {}),
      };
    } else if (body.metadata && (body.details || body.profile)) {
      // If metadata exists, merge details and profile into it
      body.metadata = {
        ...body.metadata,
        ...(body.details || {}),
        ...(body.profile || {}),
      };
    }
    
    // PERFORMANCE: Use fast core validation schema
    // Metadata validation happens async after ticket creation
    const validatedData = createTicketCoreSchema.parse(body);

    logger.info(
      {
        userId: dbUser.id,
        categoryId: validatedData.category_id,
        priority: validatedData.priority,
      },
      'Creating ticket'
    );

    // 3. Create ticket
    const ticket = await createTicket(dbUser.id, validatedData);

    // 4. Revalidate cache tags to immediately update dashboards
    // This ensures the new ticket appears instantly without waiting for cache expiration
    // Note: revalidateTag requires a profile argument in Next.js 16
    try {
      // Revalidate user-specific caches
      revalidateTag(`student-tickets:${dbUser.id}`, 'default');
      revalidateTag(`student-stats:${dbUser.id}`, 'default');
      revalidateTag(`user-${dbUser.id}`, 'default');
      
      // Revalidate ticket-specific cache
      revalidateTag(`ticket-${ticket.id}`, 'default');
      
      // Revalidate global tickets cache (affects all users)
      revalidateTag('tickets', 'default');
      
      logger.debug(
        {
          ticketId: ticket.id,
          userId: dbUser.id,
        },
        'Cache tags revalidated after ticket creation'
      );
    } catch (cacheError) {
      // Don't fail ticket creation if cache revalidation fails
      logger.warn(
        {
          error: cacheError,
          ticketId: ticket.id,
          userId: dbUser.id,
        },
        'Failed to revalidate cache tags (non-critical)'
      );
    }

    // 5. Return created ticket (status is always 'open' for new tickets)
    return ApiResponse.created({
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        description: ticket.description,
        status: 'open', // New tickets are always 'open'
        priority: ticket.priority,
        category_id: ticket.category_id,
        subcategory_id: ticket.subcategory_id,
        created_at: ticket.created_at,
        acknowledgement_due_at: ticket.acknowledgement_due_at,
        resolution_due_at: ticket.resolution_due_at,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create ticket');
    return handleApiError(error);
  }
}
