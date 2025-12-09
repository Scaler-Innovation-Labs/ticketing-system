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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const rule = await getEscalationRuleById(id);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Transform rule to match frontend expectations
    const transformedRule = {
      id: rule.id,
      domain_id: rule.domain_id,
      scope_id: rule.scope_id,
      level: rule.level,
      user_id: rule.escalate_to_user_id,
      tat_hours: rule.tat_hours,
      notify_channel: rule.notify_channel,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
      domain: rule.domain_id ? { id: rule.domain_id, name: rule.domain_name } : undefined,
      scope: rule.scope_id ? { id: rule.scope_id, name: rule.scope_name } : undefined,
      user: rule.escalate_to_user_id ? {
        id: rule.escalate_to_user_id,
        full_name: rule.escalate_to_name,
        email: rule.escalate_to_email,
        external_id: rule.escalate_to_external_id,
      } : null,
    };

    return NextResponse.json(transformedRule);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
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

    await updateEscalationRule(id, parsed.data);

    // Fetch the updated rule with joins
    const updatedRule = await getEscalationRuleById(id);

    if (!updatedRule) {
      return NextResponse.json({ error: 'Rule not found after update' }, { status: 404 });
    }

    // Transform rule to match frontend expectations
    const transformedRule = {
      id: updatedRule.id,
      domain_id: updatedRule.domain_id,
      scope_id: updatedRule.scope_id,
      level: updatedRule.level,
      user_id: updatedRule.escalate_to_user_id,
      tat_hours: updatedRule.tat_hours,
      notify_channel: updatedRule.notify_channel,
      created_at: updatedRule.created_at,
      updated_at: updatedRule.updated_at,
      domain: updatedRule.domain_id ? { id: updatedRule.domain_id, name: updatedRule.domain_name } : undefined,
      scope: updatedRule.scope_id ? { id: updatedRule.scope_id, name: updatedRule.scope_name } : undefined,
      user: updatedRule.escalate_to_user_id ? {
        id: updatedRule.escalate_to_user_id,
        full_name: updatedRule.escalate_to_name,
        email: updatedRule.escalate_to_email,
        external_id: updatedRule.escalate_to_external_id,
      } : null,
    };

    return NextResponse.json(transformedRule);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
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
