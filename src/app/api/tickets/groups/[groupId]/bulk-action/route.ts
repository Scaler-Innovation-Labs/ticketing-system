/**
 * Ticket Group Bulk Actions API
 * 
 * POST /api/tickets/groups/[groupId]/bulk-action
 * Perform bulk actions on all tickets in a group (comment or close)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getGroupTickets, updateTicketGroup } from '@/lib/ticket/ticket-groups-service';
import { addTicketComment } from '@/lib/ticket/ticket-comment-service';
import { updateTicketStatus, getStatusValue } from '@/lib/ticket/ticket-status-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { TICKET_STATUS } from '@/conf/constants';
import { db, tickets, ticket_groups } from '@/db';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

const BulkActionSchema = z.object({
  action: z.enum(['comment', 'close']),
  comment: z.string().optional().nullable(),
  status: z.string().optional(),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { groupId } = await context.params;
    const id = parseInt(groupId, 10);

    if (isNaN(id)) {
      throw Errors.validation('Invalid group ID');
    }

    const body = await req.json();
    const validation = BulkActionSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid bulk action data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { action, comment, status } = validation.data;

    // Get all tickets in the group
    const tickets = await getGroupTickets(id);

    if (tickets.length === 0) {
      return ApiResponse.success({
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
        },
        message: 'No tickets in group',
      });
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ ticketId: number; error: string }>,
    };

    // Process each ticket
    for (const ticket of tickets) {
      try {
        // Validate ticket object
        if (!ticket || typeof ticket !== 'object') {
          results.failed++;
          results.errors.push({
            ticketId: 0,
            error: 'Invalid ticket object',
          });
          continue;
        }

        if (action === 'comment') {
          if (!comment || !comment.trim()) {
            results.failed++;
            results.errors.push({
              ticketId: ticket.id,
              error: 'Comment is required for comment action',
            });
            continue;
          }

          // Add comment to ticket
          await addTicketComment(ticket.id, dbUser.id, {
            comment: comment.trim(),
            is_internal: false,
            is_from_student: false,
            attachments: [],
          });

          results.successful++;
        } else if (action === 'close') {
          // Validate ticket has an ID
          if (!ticket.id || typeof ticket.id !== 'number') {
            results.failed++;
            results.errors.push({
              ticketId: ticket.id || 0,
              error: 'Invalid ticket ID',
            });
            continue;
          }

          // Use provided status or default to CLOSED
          const targetStatus = status || TICKET_STATUS.CLOSED;

          // Prepare comment parameter (only pass if it has a value)
          const commentParam = comment && typeof comment === 'string' && comment.trim() ? comment.trim() : undefined;

          // Validate all parameters before calling updateTicketStatus
          if (!ticket.id || typeof ticket.id !== 'number') {
            throw new Error(`Invalid ticket ID: ${ticket.id}`);
          }
          if (!dbUser.id || typeof dbUser.id !== 'string') {
            throw new Error(`Invalid user ID: ${dbUser.id}`);
          }
          if (!targetStatus || typeof targetStatus !== 'string') {
            throw new Error(`Invalid target status: ${targetStatus}`);
          }

          // Let updateTicketStatus handle all the status checking and transitions
          // It will throw an error if the ticket is already in the target state or if transition is invalid
          // We'll catch that and handle it appropriately
          try {
            await updateTicketStatus(
              ticket.id,
              targetStatus,
              dbUser.id,
              commentParam
            );
            results.successful++;
          } catch (updateError: any) {
            // Check if error is due to invalid transition (e.g., already closed)
            const errorMessage = updateError?.message || String(updateError);
            
            // If ticket is already in target state, count as successful
            if (
              errorMessage.includes('already') || 
              errorMessage.includes('Invalid status transition') ||
              errorMessage.includes('same status')
            ) {
              results.successful++;
              continue;
            }

            // If target is CLOSED and we got an invalid transition, try two-step: RESOLVED -> CLOSED
            if (targetStatus === TICKET_STATUS.CLOSED) {
              try {
                // First try to transition to RESOLVED
                await updateTicketStatus(
                  ticket.id,
                  TICKET_STATUS.RESOLVED,
                  dbUser.id,
                  commentParam
                );
                // Then transition to CLOSED
                await updateTicketStatus(
                  ticket.id,
                  TICKET_STATUS.CLOSED,
                  dbUser.id
                );
                results.successful++;
                continue;
              } catch (twoStepError: any) {
                // Two-step also failed, count as failed
                throw updateError; // Re-throw original error
              }
            }

            // Re-throw if we can't handle it
            throw updateError;
          }
        }
      } catch (error: any) {
        results.failed++;
        // Extract error message from various error types
        let errorMessage = 'Unknown error';
        
        try {
          // Handle AppError (from @/lib/errors)
          if (error && typeof error === 'object' && error.code && error.message) {
            errorMessage = String(error.message);
            if (error.details) {
              try {
                errorMessage += ` (${JSON.stringify(error.details)})`;
              } catch {
                errorMessage += ' (details unavailable)';
              }
            }
          } else if (error && typeof error === 'object' && error.error && error.error.message) {
            errorMessage = String(error.error.message);
            if (error.error.details) {
              try {
                errorMessage += ` (${JSON.stringify(error.error.details)})`;
              } catch {
                errorMessage += ' (details unavailable)';
              }
            }
          } else if (error instanceof Error) {
            errorMessage = error.message || 'Error occurred';
          } else if (error && typeof error === 'object' && error.message) {
            errorMessage = String(error.message);
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error === null || error === undefined) {
            errorMessage = 'Null or undefined error';
          } else {
            // Try to stringify the error object
            try {
              errorMessage = JSON.stringify(error);
            } catch {
              errorMessage = String(error) || 'Unknown error occurred';
            }
          }
        } catch (extractionError) {
          errorMessage = `Error extracting error message: ${extractionError instanceof Error ? extractionError.message : String(extractionError)}`;
        }
        
        const ticketId = ticket?.id || 0;
        results.errors.push({
          ticketId,
          error: errorMessage,
        });
        
        try {
          logger.error(
            { 
              error: error && typeof error === 'object' ? (error.error || error) : error,
              errorCode: error && typeof error === 'object' ? error.code : undefined,
              errorMessage,
              errorDetails: error && typeof error === 'object' ? (error.details || error.error?.details) : undefined,
              errorStack: error instanceof Error ? error.stack : undefined,
              ticketId, 
              action,
              currentStatus: action === 'close' ? 'checking status...' : undefined,
            },
            'Failed to process ticket in bulk action'
          );
        } catch (logError) {
          // If logging fails, at least log the basic error
          console.error('Failed to log error:', logError, 'Original error:', error);
        }
      }
    }

    // If action was "close", check if we should archive the group
    // Archive if all tickets in the group are closed or resolved (regardless of bulk action success)
    let groupArchived = false;
    if (action === 'close') {
      try {
        // Use raw SQL to check ticket statuses and avoid Drizzle select issues
        // First check if group is active
        const groupCheckResult = await db.execute<{ is_active: boolean }>(
          sql`SELECT is_active FROM ticket_groups WHERE id = ${id} LIMIT 1`
        );

        if (!groupCheckResult || groupCheckResult.length === 0 || !groupCheckResult[0].is_active) {
          // Group doesn't exist or is already archived
          groupArchived = false;
        } else {
          // Check if all tickets are closed or resolved
          const statusCheckResult = await db.execute<{ 
            total_count: string; 
            closed_or_resolved_count: string;
          }>(
            sql`
              SELECT 
                COUNT(*)::text as total_count,
                COUNT(CASE WHEN ts.value IN ('closed', 'resolved') THEN 1 END)::text as closed_or_resolved_count
              FROM tickets t
              INNER JOIN ticket_statuses ts ON t.status_id = ts.id
              WHERE t.group_id = ${id}
            `
          );

          if (statusCheckResult && statusCheckResult.length > 0) {
            const check = statusCheckResult[0];
            const totalCount = parseInt(check.total_count || '0', 10);
            const closedOrResolvedCount = parseInt(check.closed_or_resolved_count || '0', 10);
            const allClosedOrResolved = totalCount > 0 && totalCount === closedOrResolvedCount;

            if (allClosedOrResolved) {
              // Archive the group
              await db
                .update(ticket_groups)
                .set({
                  is_active: false,
                  updated_at: new Date(),
                })
                .where(eq(ticket_groups.id, id));

              groupArchived = true;
              logger.info(
                { 
                  groupId: id, 
                  userId: dbUser.id,
                  totalTickets: totalCount,
                  closedOrResolved: closedOrResolvedCount,
                  allClosedOrResolved: true
                },
                'Group archived after bulk close action'
              );
            } else if (totalCount === 0) {
              // No tickets in group, archive it
              await db
                .update(ticket_groups)
                .set({
                  is_active: false,
                  updated_at: new Date(),
                })
                .where(eq(ticket_groups.id, id));
              groupArchived = true;
              logger.info(
                { groupId: id, userId: dbUser.id, reason: 'No tickets in group' },
                'Group archived (no tickets)'
              );
            }
          }
        }
      } catch (archiveError: any) {
        logger.error(
          { 
            error: archiveError?.message || String(archiveError),
            errorStack: archiveError?.stack,
            groupId: id 
          },
          'Failed to archive group after closing tickets'
        );
        // Don't fail the entire request if archiving fails
      }
    }

    logger.info(
      {
        groupId: id,
        action,
        totalTickets: tickets.length,
        successful: results.successful,
        failed: results.failed,
        groupArchived,
        userId: dbUser.id,
      },
      'Bulk action completed'
    );

    return ApiResponse.success({
      summary: {
        total: tickets.length,
        successful: results.successful,
        failed: results.failed,
      },
      groupArchived,
      errors: results.errors.length > 0 ? results.errors : undefined,
      message: `Bulk action completed: ${results.successful} successful, ${results.failed} failed${groupArchived ? '. Group archived.' : ''}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to perform bulk action');
    return handleApiError(error);
  }
}

