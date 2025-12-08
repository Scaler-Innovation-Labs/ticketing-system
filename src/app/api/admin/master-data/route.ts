
import { NextResponse } from 'next/server';
import { db, categories, ticket_statuses } from '@/db';
import { eq } from 'drizzle-orm';

import { requireRole } from '@/lib/auth/helpers';

export async function GET() {
    try {
        await requireRole(['super_admin', 'snr_admin']);
        const [cats, stats] = await Promise.all([
            db.select().from(categories).where(eq(categories.is_active, true)),
            db.select().from(ticket_statuses).where(eq(ticket_statuses.is_active, true))
        ]);

        return NextResponse.json({
            categories: cats,
            statuses: stats
        });
    } catch (error) {
        console.error('Failed to fetch master data:', error);
        return NextResponse.json({ error: 'Failed to fetch master data' }, { status: 500 });
    }
}
