/**
 * Super Admin - Master Data Management - Individual Item
 * 
 * PATCH /api/superadmin/master/[id] - Update master data item
 * DELETE /api/superadmin/master/[id] - Delete master data item
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db, hostels, batches, class_sections, domains, scopes } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateHostelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  warden_name: z.string().max(255).nullable().optional(),
  warden_phone: z.string().max(15).nullable().optional(),
});

const UpdateBatchSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  name: z.string().min(1).max(100).optional(),
});

const UpdateClassSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
});

const UpdateDomainSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  scope_mode: z.enum(['none', 'fixed', 'dynamic']).optional(),
  is_active: z.boolean().optional(),
});

const UpdateScopeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  student_field_key: z.string().max(64).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const id = parseInt(params.id, 10);

    if (!type || isNaN(id)) {
      return NextResponse.json(
        { error: 'Missing or invalid type/id parameter' },
        { status: 400 }
      );
    }

    const body = await request.json();
    let result: any;

    switch (type) {
      case 'hostels': {
        const parsed = UpdateHostelSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [hostel] = await db
          .update(hostels)
          .set(parsed.data)
          .where(eq(hostels.id, id))
          .returning();
        result = hostel;
        break;
      }

      case 'batches': {
        const parsed = UpdateBatchSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [batch] = await db
          .update(batches)
          .set(parsed.data)
          .where(eq(batches.id, id))
          .returning();
        result = batch;
        break;
      }

      case 'class_sections': {
        const parsed = UpdateClassSectionSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [section] = await db
          .update(class_sections)
          .set(parsed.data)
          .where(eq(class_sections.id, id))
          .returning();
        result = section;
        break;
      }

      case 'domains': {
        const parsed = UpdateDomainSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [domain] = await db
          .update(domains)
          .set(parsed.data)
          .where(eq(domains.id, id))
          .returning();
        result = domain;
        break;
      }

      case 'scopes': {
        const parsed = UpdateScopeSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [scope] = await db
          .update(scopes)
          .set(parsed.data)
          .where(eq(scopes.id, id))
          .returning();
        result = scope;
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    logger.info({ type, id }, 'Master data updated');
    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating master data');
    return NextResponse.json(
      { error: error.message || 'Failed to update master data' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const id = parseInt(params.id, 10);

    if (!type || isNaN(id)) {
      return NextResponse.json(
        { error: 'Missing or invalid type/id parameter' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'hostels':
        await db.delete(hostels).where(eq(hostels.id, id));
        break;

      case 'batches':
        await db.delete(batches).where(eq(batches.id, id));
        break;

      case 'class_sections':
        await db.delete(class_sections).where(eq(class_sections.id, id));
        break;

      case 'domains':
        // Soft delete
        await db
          .update(domains)
          .set({ is_active: false })
          .where(eq(domains.id, id));
        break;

      case 'scopes':
        // Soft delete
        await db
          .update(scopes)
          .set({ is_active: false })
          .where(eq(scopes.id, id));
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }

    logger.info({ type, id }, 'Master data deleted');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting master data');
    return NextResponse.json(
      { error: error.message || 'Failed to delete master data' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
