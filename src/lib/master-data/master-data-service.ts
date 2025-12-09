/**
 * Master Data Management Service
 * 
 * Handles CRUD for hostels, batches, class sections, domains, scopes
 */

import { db } from '@/db';
import { hostels, batches, class_sections, domains, scopes } from '@/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

// ============================================
// Hostels
// ============================================

export async function listHostels(activeOnly = false) {
  try {
    const query = db.select().from(hostels);
    if (activeOnly) {
      query.where(eq(hostels.is_active, true));
    }
    return await query.orderBy(hostels.name);
  } catch (error) {
    logger.error({ error }, 'Failed to list hostels');
    throw error;
  }
}

export async function createHostel(name: string, code: string) {
  try {
    const [hostel] = await db
      .insert(hostels)
      .values({
        name: name.trim(),
        code: code.trim().toUpperCase(),
      })
      .returning();
    logger.info({ hostelId: hostel.id }, 'Hostel created');
    return hostel;
  } catch (error) {
    logger.error({ error, name, code }, 'Failed to create hostel');
    throw error;
  }
}

export async function updateHostel(id: number, name?: string, code?: string, is_active?: boolean) {
  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code.trim().toUpperCase();
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update');
    }

    const [hostel] = await db
      .update(hostels)
      .set(updates)
      .where(eq(hostels.id, id))
      .returning();
    if (!hostel) {
      throw new Error('Hostel not found');
    }
    logger.info({ hostelId: id }, 'Hostel updated');
    return hostel;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update hostel');
    throw error;
  }
}

export async function deleteHostel(id: number) {
  try {
    const [hostel] = await db
      .update(hostels)
      .set({ is_active: false })
      .where(eq(hostels.id, id))
      .returning();
    if (!hostel) {
      throw new Error('Hostel not found');
    }
    logger.info({ hostelId: id }, 'Hostel deleted');
    return hostel;
  } catch (error) {
    logger.error({ error, id }, 'Failed to delete hostel');
    throw error;
  }
}

// ============================================
// Batches
// ============================================

export async function listBatches(activeOnly = false) {
  try {
    const query = db.select().from(batches);
    if (activeOnly) {
      query.where(eq(batches.is_active, true));
    }
    return await query.orderBy(batches.year);
  } catch (error) {
    logger.error({ error }, 'Failed to list batches');
    throw error;
  }
}

export async function createBatch(year: number, name: string) {
  try {
    const [batch] = await db
      .insert(batches)
      .values({ year, name: name.trim() })
      .returning();
    logger.info({ batchId: batch.id }, 'Batch created');
    return batch;
  } catch (error: any) {
    // If batch with this year already exists, reactivate and update it
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      const [existingBatch] = await db
        .select()
        .from(batches)
        .where(eq(batches.year, year))
        .limit(1);
      
      if (existingBatch) {
        const [updatedBatch] = await db
          .update(batches)
          .set({ 
            name: name.trim(),
            is_active: true 
          })
          .where(eq(batches.id, existingBatch.id))
          .returning();
        logger.info({ batchId: updatedBatch.id }, 'Batch reactivated and updated');
        return updatedBatch;
      }
    }
    logger.error({ error, year }, 'Failed to create batch');
    throw error;
  }
}

export async function updateBatch(id: number, year?: number, name?: string, is_active?: boolean) {
  try {
    const updates: Record<string, unknown> = {};
    if (year !== undefined) updates.year = year;
    if (name !== undefined) updates.name = name.trim();
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update');
    }

    const [batch] = await db
      .update(batches)
      .set(updates)
      .where(eq(batches.id, id))
      .returning();
    if (!batch) {
      throw new Error('Batch not found');
    }
    logger.info({ batchId: id }, 'Batch updated');
    return batch;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update batch');
    throw error;
  }
}

export async function deleteBatch(id: number) {
  try {
    const [batch] = await db
      .update(batches)
      .set({ is_active: false })
      .where(eq(batches.id, id))
      .returning();
    if (!batch) {
      throw new Error('Batch not found');
    }
    logger.info({ batchId: id }, 'Batch deleted');
    return batch;
  } catch (error) {
    logger.error({ error, id }, 'Failed to delete batch');
    throw error;
  }
}

// ============================================
// Class Sections
// ============================================

export async function listClassSections(activeOnly = false) {
  try {
    const query = db.select().from(class_sections);
    if (activeOnly) {
      query.where(eq(class_sections.is_active, true));
    }
    return await query.orderBy(class_sections.name);
  } catch (error) {
    logger.error({ error }, 'Failed to list class sections');
    throw error;
  }
}

export async function createClassSection(name: string, department?: string | null, batchId?: number | null) {
  try {
    const [section] = await db
      .insert(class_sections)
      .values({
        name: name.trim(),
        department: department?.trim() || null,
        batch_id: batchId || null,
      })
      .returning();
    logger.info({ sectionId: section.id }, 'Class section created');
    return section;
  } catch (error) {
    logger.error({ error, name }, 'Failed to create class section');
    throw error;
  }
}

export async function updateClassSection(id: number, name?: string, department?: string | null, batchId?: number | null, is_active?: boolean) {
  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (department !== undefined) updates.department = department?.trim() || null;
    if (batchId !== undefined) updates.batch_id = batchId || null;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update');
    }

    const [section] = await db
      .update(class_sections)
      .set(updates)
      .where(eq(class_sections.id, id))
      .returning();
    if (!section) {
      throw new Error('Class section not found');
    }
    logger.info({ sectionId: id }, 'Class section updated');
    return section;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update class section');
    throw error;
  }
}

export async function deleteClassSection(id: number) {
  try {
    const [section] = await db
      .update(class_sections)
      .set({ is_active: false })
      .where(eq(class_sections.id, id))
      .returning();
    if (!section) {
      throw new Error('Class section not found');
    }
    logger.info({ sectionId: id }, 'Class section deleted');
    return section;
  } catch (error) {
    logger.error({ error, id }, 'Failed to delete class section');
    throw error;
  }
}

// ============================================
// Domains
// ============================================

export async function listDomains(activeOnly = false) {
  try {
    const query = db.select().from(domains);
    if (activeOnly) {
      query.where(eq(domains.is_active, true));
    }
    return await query.orderBy(domains.name);
  } catch (error) {
    logger.error({ error }, 'Failed to list domains');
    throw error;
  }
}

export async function createDomain(name: string, slug: string, description?: string | null) {
  try {
    const [domain] = await db
      .insert(domains)
      .values({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
        description: description?.trim() || null
      })
      .returning();
    logger.info({ domainId: domain.id }, 'Domain created');
    return domain;
  } catch (error) {
    logger.error({ error, name, slug }, 'Failed to create domain');
    throw error;
  }
}

export async function updateDomain(id: number, name?: string, slug?: string, description?: string | null) {
  try {
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (slug !== undefined) updates.slug = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (description !== undefined) updates.description = description?.trim() || null;

    const [domain] = await db
      .update(domains)
      .set(updates)
      .where(eq(domains.id, id))
      .returning();
    if (!domain) {
      throw new Error('Domain not found');
    }
    logger.info({ domainId: id }, 'Domain updated');
    return domain;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update domain');
    throw error;
  }
}

export async function deleteDomain(id: number) {
  try {
    const [domain] = await db
      .update(domains)
      .set({ is_active: false })
      .where(eq(domains.id, id))
      .returning();
    if (!domain) {
      throw new Error('Domain not found');
    }
    logger.info({ domainId: id }, 'Domain deleted');
    return domain;
  } catch (error) {
    logger.error({ error, id }, 'Failed to delete domain');
    throw error;
  }
}

// ============================================
// Scopes
// ============================================

export async function listScopes(domainId?: number, activeOnly = false) {
  try {
    const conditions = [];
    if (domainId !== undefined) {
      conditions.push(eq(scopes.domain_id, domainId));
    }
    if (activeOnly) {
      conditions.push(eq(scopes.is_active, true));
    }

    const result = conditions.length > 0
      ? await db.select().from(scopes).where(and(...conditions)).orderBy(scopes.name)
      : await db.select().from(scopes).orderBy(scopes.name);

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to list scopes');
    throw error;
  }
}

export async function createScope(
  domainId: number,
  name: string,
  slug: string,
  studentFieldKey?: string | null,
  referenceType?: string | null,
  referenceId?: number | null
) {
  try {
    const [scope] = await db
      .insert(scopes)
      .values({
        domain_id: domainId,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        reference_type: referenceType || null,
        reference_id: referenceId || null,
        student_field_key: studentFieldKey || null,
      })
      .returning();
    logger.info({ scopeId: scope.id }, 'Scope created');
    return scope;
  } catch (error) {
    logger.error({ error, domainId, name }, 'Failed to create scope');
    throw error;
  }
}

export async function updateScope(
  id: number,
  name?: string,
  slug?: string,
  studentFieldKey?: string | null,
  referenceType?: string | null,
  referenceId?: number | null
) {
  try {
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (slug !== undefined) updateData.slug = slug.trim().toLowerCase();
    if (referenceType !== undefined) updateData.reference_type = referenceType;
    if (referenceId !== undefined) updateData.reference_id = referenceId;
    if (studentFieldKey !== undefined) updateData.student_field_key = studentFieldKey;

    const [scope] = await db
      .update(scopes)
      .set(updateData)
      .where(eq(scopes.id, id))
      .returning();
    if (!scope) {
      throw new Error('Scope not found');
    }
    logger.info({ scopeId: id }, 'Scope updated');
    return scope;
  } catch (error) {
    logger.error({ error, id }, 'Failed to update scope');
    throw error;
  }
}

export async function deleteScope(id: number) {
  try {
    const [scope] = await db
      .update(scopes)
      .set({ is_active: false })
      .where(eq(scopes.id, id))
      .returning();
    if (!scope) {
      throw new Error('Scope not found');
    }
    logger.info({ scopeId: id }, 'Scope deleted');
    return scope;
  } catch (error) {
    logger.error({ error, id }, 'Failed to delete scope');
    throw error;
  }
}
