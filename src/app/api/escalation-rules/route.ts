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

    return NextResponse.json({ rules });
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
