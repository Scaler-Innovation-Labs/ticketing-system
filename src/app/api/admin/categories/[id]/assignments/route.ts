import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { category_assignments } from '@/db/schema-tickets';
import { users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/helpers';
import { logger } from '@/lib/logger';

const CreateAssignmentSchema = z.object({
    user_id: z.string().uuid(),
    assignment_type: z.string().max(50).optional().nullable(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(['admin', 'super_admin']);
        const { id } = await params;
        const categoryId = Number(id);

        if (isNaN(categoryId)) {
            return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
        }

        const assignments = await db
            .select({
                id: category_assignments.id,
                category_id: category_assignments.category_id,
                user_id: category_assignments.user_id,
                assignment_type: category_assignments.assignment_type,
                created_at: category_assignments.created_at,
                user: {
                    id: users.id,
                    full_name: users.full_name,
                    email: users.email,
                    external_id: users.external_id,
                },
            })
            .from(category_assignments)
            .leftJoin(users, eq(category_assignments.user_id, users.id))
            .where(eq(category_assignments.category_id, categoryId));

        return NextResponse.json({ assignments });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error fetching category assignments');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(['admin', 'super_admin']);
        const { id } = await params;
        const categoryId = Number(id);

        if (isNaN(categoryId)) {
            return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
        }

        const body = await request.json();
        const parsed = CreateAssignmentSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request data', details: parsed.error.format() },
                { status: 400 }
            );
        }

        // Check if assignment already exists
        const existing = await db
            .select()
            .from(category_assignments)
            .where(
                and(
                    eq(category_assignments.category_id, categoryId),
                    eq(category_assignments.user_id, parsed.data.user_id)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            return NextResponse.json(
                { error: 'Admin is already assigned to this category' },
                { status: 409 }
            );
        }

        const [assignment] = await db
            .insert(category_assignments)
            .values({
                category_id: categoryId,
                user_id: parsed.data.user_id,
                assignment_type: parsed.data.assignment_type || null,
            })
            .returning();

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error creating category assignment');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
