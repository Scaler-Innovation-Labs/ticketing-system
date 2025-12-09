/**
 * Tickets API - Create Ticket
 * 
 * POST /api/tickets - Creates a new ticket
 * GET /api/tickets - Lists tickets with filters
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse, getPaginationParams } from '@/lib/auth/helpers';
import { handleApiError } from '@/lib/errors';
import { createTicketSchema, ticketFiltersSchema } from '@/schemas/ticket';
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
    // 1. Authenticate user
    const { dbUser } = await requireDbUser();

    // 2. Parse and validate request body
    const body = await req.json();
    const validatedData = createTicketSchema.parse(body);

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

    // 4. Return created ticket (status is always 'open' for new tickets)
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
