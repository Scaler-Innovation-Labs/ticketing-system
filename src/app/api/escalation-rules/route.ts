/**
 * Admin - Escalation Rules Management
 * 
 * GET /api/escalation-rules - List escalation rules
 * POST /api/escalation-rules - Create escalation rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { listEscalationRules, createEscalationRule } from '@/lib/escalation/escalation-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CreateEscalationRuleSchema = z.object({
  domain_id: z.number().int().positive().nullable(),
  scope_id: z.number().int().positive().nullable(),
  level: z.number().int().positive(),
  escalate_to_user_id: z.string().uuid(),
  tat_hours: z.number().int().positive(),
  notify_channel: z.string().max(50).nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const domain_id = searchParams.get('domain_id');
    const scope_id = searchParams.get('scope_id');

    const rules = await listEscalationRules({
      domain_id: domain_id ? parseInt(domain_id, 10) : undefined,
      scope_id: scope_id ? parseInt(scope_id, 10) : undefined,
    });

    // Transform rules to match frontend expectations
    const transformedRules = rules.map((rule: any) => ({
      id: rule.id,
      domain_id: rule.domain_id,
      scope_id: rule.scope_id,
      level: rule.level,
      user_id: rule.escalate_to_user_id,
      tat_hours: rule.tat_hours,
      notify_channel: rule.notify_channel,
      created_at: rule.created_at,
      updated_at: rule.created_at, // Use created_at as fallback if updated_at not available
      domain: rule.domain_id ? { id: rule.domain_id, name: rule.domain_name } : undefined,
      scope: rule.scope_id ? { id: rule.scope_id, name: rule.scope_name } : undefined,
      user: rule.escalate_to_user_id ? {
        id: rule.escalate_to_user_id,
        full_name: rule.escalate_to_name,
        email: rule.escalate_to_email,
        external_id: rule.escalate_to_external_id,
      } : null,
    }));

    return NextResponse.json({ rules: transformedRules });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing escalation rules');
    return NextResponse.json(
      { error: error.message || 'Failed to list escalation rules' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateEscalationRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const ruleId = await createEscalationRule(parsed.data);

    return NextResponse.json({ id: ruleId }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating escalation rule');
    return NextResponse.json(
      { error: error.message || 'Failed to create escalation rule' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}
