import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { category_assignments } from '@/db/schema-tickets';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/helpers';
import { logger } from '@/lib/logger';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
    try {
        await requireRole(['admin', 'super_admin']);
        const { id, assignmentId } = await params;
        const categoryId = Number(id);
        const assignId = Number(assignmentId);

        if (isNaN(categoryId) || isNaN(assignId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const [deleted] = await db
            .delete(category_assignments)
            .where(
                and(
                    eq(category_assignments.id, assignId),
                    eq(category_assignments.category_id, categoryId)
                )
            )
            .returning();

        if (!deleted) {
            return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Assignment removed successfully' });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error removing category assignment');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
