/**
 * Super Admin - Master Data Management
 * 
 * Hostels, Batches, Class Sections, Domains, Scopes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db, hostels, batches, class_sections, domains, scopes } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateHostelSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  capacity: z.number().int().positive().optional(),
  warden_name: z.string().max(255).optional(),
  warden_phone: z.string().max(15).optional(),
});

const CreateBatchSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().min(1).max(100),
});

const CreateClassSectionSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
});

const CreateDomainSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scope_mode: z.enum(['none', 'fixed', 'dynamic']).optional(),
});

const CreateScopeSchema = z.object({
  domain_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  student_field_key: z.string().max(64).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Missing type parameter' },
        { status: 400 }
      );
    }

    let data: any;

    switch (type) {
      case 'hostels':
        data = await db
          .select()
          .from(hostels)
          .orderBy(hostels.name);
        break;

      case 'batches':
        data = await db
          .select()
          .from(batches)
          .orderBy(desc(batches.year));
        break;

      case 'class_sections':
        data = await db
          .select()
          .from(class_sections)
          .orderBy(class_sections.name);
        break;

      case 'domains':
        data = await db
          .select()
          .from(domains)
          .where(eq(domains.is_active, true))
          .orderBy(domains.name);
        break;

      case 'scopes':
        const domainId = searchParams.get('domain_id');
        if (!domainId) {
          data = await db
            .select()
            .from(scopes)
            .where(eq(scopes.is_active, true))
            .orderBy(scopes.name);
        } else {
          data = await db
            .select()
            .from(scopes)
            .where(eq(scopes.domain_id, parseInt(domainId, 10)))
            .orderBy(scopes.name);
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }

    return NextResponse.json({ [type]: data });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching master data');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch master data' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const body = await request.json();

    if (!type) {
      return NextResponse.json(
        { error: 'Missing type parameter' },
        { status: 400 }
      );
    }

    let result: any;

    switch (type) {
      case 'hostels': {
        const parsed = CreateHostelSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [hostel] = await db.insert(hostels).values(parsed.data).returning();
        result = hostel;
        break;
      }

      case 'batches': {
        const parsed = CreateBatchSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [batch] = await db.insert(batches).values(parsed.data).returning();
        result = batch;
        break;
      }

      case 'class_sections': {
        const parsed = CreateClassSectionSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [section] = await db.insert(class_sections).values(parsed.data).returning();
        result = section;
        break;
      }

      case 'domains': {
        const parsed = CreateDomainSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [domain] = await db.insert(domains).values(parsed.data).returning();
        result = domain;
        break;
      }

      case 'scopes': {
        const parsed = CreateScopeSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.issues },
            { status: 400 }
          );
        }
        const [scope] = await db.insert(scopes).values(parsed.data).returning();
        result = scope;
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }

    logger.info({ type }, 'Master data created');
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating master data');
    return NextResponse.json(
      { error: error.message || 'Failed to create master data' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
