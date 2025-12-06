/**
 * Admin - Assignment Rules Management
 * 
 * GET /api/admin/assignments - List assignment rules
 * POST /api/admin/assignments - Create assignment rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { getAssignmentRules, createAssignmentRule } from '@/lib/assignment/assignment-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateAssignmentRuleSchema = z.object({
  user_id: z.string().uuid(),
  domain_id: z.number().int().positive(),
  scope_id: z.number().int().positive().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const rules = await getAssignmentRules();

    return NextResponse.json({ rules });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing assignment rules');
    return NextResponse.json(
      { error: error.message || 'Failed to list assignment rules' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateAssignmentRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const ruleId = await createAssignmentRule({
      user_id: parsed.data.user_id,
      domain_id: parsed.data.domain_id,
      scope_id: parsed.data.scope_id,
    });

    return NextResponse.json({ id: ruleId }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating assignment rule');
    return NextResponse.json(
      { error: error.message || 'Failed to create assignment rule' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}
