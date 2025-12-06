import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, categories, subcategories, scopes, ticket_statuses } from '@/db/schema-tickets';
import { users } from '@/db';
import { eq, inArray, aliasedTable } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const ExportSchema = z.object({
  ticket_ids: z.array(z.number().int().positive()).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * POST /api/tickets/bulk-export
 * Export tickets in bulk (JSON or CSV)
 */
export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'super_admin']);
    
    const body = await request.json();
    const { ticket_ids, format } = ExportSchema.parse(body);
    
    const assignedUser = aliasedTable(users, 'assigned_user');
    const creatorUser = aliasedTable(users, 'creator_user');
    
    // Build query
    let query = db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        description: tickets.description,
        status: ticket_statuses.label,
        category: categories.name,
        subcategory: subcategories.name,
        scope: scopes.name,
        priority: tickets.priority,
        assigned_to: assignedUser.full_name,
        created_by: creatorUser.full_name,
        escalation_level: tickets.escalation_level,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
        resolution_due_at: tickets.resolution_due_at,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
      .leftJoin(scopes, eq(tickets.scope_id, scopes.id))
      .leftJoin(assignedUser, eq(tickets.assigned_to, assignedUser.id))
      .leftJoin(creatorUser, eq(tickets.created_by, creatorUser.id));
    
    // Apply filter if ticket_ids provided
    const ticketData = ticket_ids
      ? await query.where(inArray(tickets.id, ticket_ids))
      : await query.limit(1000); // Safety limit
    
    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(ticketData[0] || {});
      const csvRows = [
        headers.join(','),
        ...ticketData.map(row =>
          headers
            .map(header => {
              const val = (row as any)[header];
              return val !== null && val !== undefined
                ? `"${String(val).replace(/"/g, '""')}"`
                : '';
            })
            .join(',')
        ),
      ];
      
      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="tickets-export-${Date.now()}.csv"`,
        },
      });
    }
    
    // JSON format
    return NextResponse.json({
      tickets: ticketData,
      count: ticketData.length,
      exported_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation Error', details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ error }, 'Bulk export failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
