/**
 * Admin - Escalation Rules Management - Individual
 * 
 * GET /api/escalation-rules/[id] - Get escalation rule
 * PATCH /api/escalation-rules/[id] - Update escalation rule
 * DELETE /api/escalation-rules/[id] - Delete escalation rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { 
  getEscalationRuleById, 
  updateEscalationRule, 
  deleteEscalationRule 
} from '@/lib/escalation/escalation-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateEscalationRuleSchema = z.object({
  domain_id: z.number().int().positive().nullable().optional(),
  scope_id: z.number().int().positive().nullable().optional(),
  level: z.number().int().positive().optional(),
  escalate_to_user_id: z.string().uuid().optional(),
  tat_hours: z.number().int().positive().optional(),
  notify_channel: z.string().max(50).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const rule = await getEscalationRuleById(id);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(rule);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching escalation rule');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch escalation rule' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = UpdateEscalationRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const rule = await updateEscalationRule(id, parsed.data);

    return NextResponse.json(rule);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating escalation rule');
    return NextResponse.json(
      { error: error.message || 'Failed to update escalation rule' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await deleteEscalationRule(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting escalation rule');
    return NextResponse.json(
      { error: error.message || 'Failed to delete escalation rule' },
      { status: 500 }
    );
  }
}
