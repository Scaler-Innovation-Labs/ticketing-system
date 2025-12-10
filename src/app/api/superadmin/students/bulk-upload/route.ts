/**
 * Super Admin - Bulk Upload Students
 * 
 * POST /api/superadmin/students/bulk-upload - Upload CSV to create multiple students
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { createStudent, updateStudent } from '@/lib/student/student-service';
import { db, hostels, batches, class_sections, users, students, roles } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: unknown;
}

interface ProcessedStudent {
  full_name: string;
  email: string;
  phone: string;
  roll_no?: string | null;
  room_no?: string | null;
  hostel_id?: number | null;
  class_section_id?: number | null;
  batch_id?: number | null;
  department?: string | null;
  blood_group?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
}

// Simple CSV parser
function parseCSV(csvText: string): string[][] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
      i++; // Skip \n
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.map(line => {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());
    return fields;
  });
}

// Map CSV headers to normalized field names
const headerMap: Record<string, string> = {
  'full_name': 'full_name',
  'name': 'full_name',
  'email': 'email',
  'phone': 'phone',
  'mobile': 'phone',
  'roll_no': 'roll_no',
  'roll_number': 'roll_no',
  'room_no': 'room_no',
  'room_number': 'room_no',
  'hostel': 'hostel',
  'hostel_name': 'hostel',
  'hostel_id': 'hostel_id',
  'class_section': 'class_section',
  'section': 'class_section',
  'class_section_id': 'class_section_id',
  'batch': 'batch',
  'batch_year': 'batch',
  'batch_id': 'batch_id',
  'department': 'department',
  'blood_group': 'blood_group',
  'blood': 'blood_group',
  'parent_name': 'parent_name',
  'parent': 'parent_name',
  'parent_phone': 'parent_phone',
  'parent_mobile': 'parent_phone',
};

// Zod schema for raw CSV row data (all strings)
const RawCSVRowSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255, 'Full name must be 255 characters or less'),
  email: z.union([z.string().email('Invalid email format'), z.literal('INA')]),
  phone: z.string().min(1, 'Phone number is required').superRefine((val, ctx) => {
    if (val === 'INA') return;
    const phoneDigits = val.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone must be 10-15 digits',
        path: ['phone'],
      });
    }
  }),
  roll_no: z.string().optional(),
  room_no: z.string().optional(),
  hostel: z.string().optional(),
  hostel_id: z.string().optional(),
  class_section: z.string().optional(),
  class_section_id: z.string().optional(),
  batch: z.string().optional(),
  batch_id: z.string().optional(),
  department: z.string().max(100, 'Department must be 100 characters or less').optional(),
  blood_group: z.union([z.string().optional(), z.literal('INA')]).superRefine((val, ctx) => {
    if (!val || val === 'INA') return;
    // Normalize blood group by removing spaces and converting to uppercase
    const normalized = val.replace(/\s+/g, '').toUpperCase();
    const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    if (!validBloodGroups.includes(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Blood group must be one of: A+, A-, B+, B-, O+, O-, AB+, AB-',
        path: ['blood_group'],
      });
    }
  }),
  parent_name: z.string().max(255, 'Parent name must be 255 characters or less').optional(),
  parent_phone: z.string().optional(),
});

// Helper function to create validation schema with ID resolution
function createStudentValidationSchema(
  hostelMap: Map<string, number>,
  batchMap: Map<number, number>,
  sectionMap: Map<string, number>
) {
  return RawCSVRowSchema.superRefine((data, ctx) => {
    // Validate and resolve hostel ID
    if (data.hostel && data.hostel !== 'INA') {
      const hostelId = hostelMap.get(data.hostel.toLowerCase());
      if (!hostelId && data.hostel.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hostel'],
          message: `Hostel "${data.hostel}" not found`,
        });
      }
    } else if (data.hostel_id) {
      const parsed = parseInt(data.hostel_id, 10);
      if (isNaN(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hostel_id'],
          message: 'Invalid hostel ID',
        });
      }
    }

    // Validate and resolve batch ID
    if (data.batch && data.batch !== 'INA') {
      const batchYear = parseInt(data.batch, 10);
      if (isNaN(batchYear)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['batch'],
          message: 'Batch year must be a number',
        });
      } else {
        const batchId = batchMap.get(batchYear);
        if (!batchId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['batch'],
            message: `Batch year "${data.batch}" not found`,
          });
        }
      }
    } else if (data.batch_id) {
      const parsed = parseInt(data.batch_id, 10);
      if (isNaN(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['batch_id'],
          message: 'Invalid batch ID',
        });
      }
    }

    // Validate and resolve class section ID
    if (data.class_section && data.class_section !== 'INA') {
      const classSectionId = sectionMap.get(data.class_section.toLowerCase());
      if (!classSectionId && data.class_section.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['class_section'],
          message: `Class section "${data.class_section}" not found`,
        });
      }
    } else if (data.class_section_id) {
      const parsed = parseInt(data.class_section_id, 10);
      if (isNaN(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['class_section_id'],
          message: 'Invalid class section ID',
        });
      }
    }
  }).transform((data) => {
    // Transform phone to digits only (unless marked INA)
    // Handle scientific notation from Excel (e.g., 2.63E+11 -> 26300000000)
    let phoneValue = data.phone === 'INA' ? 'INA' : data.phone;
    if (phoneValue !== 'INA' && phoneValue) {
      // Check if it's in scientific notation
      if (/^[\d.]+[eE][+-]?\d+$/.test(phoneValue)) {
        // Convert scientific notation to regular number
        phoneValue = String(Number(phoneValue));
      }
      // Remove all non-digits
      phoneValue = phoneValue.replace(/\D/g, '');
    }
    let phone = phoneValue;

    // Resolve hostel ID
    let hostelId: number | null = null;
    if (data.hostel && data.hostel !== 'INA') {
      hostelId = hostelMap.get(data.hostel.toLowerCase()) || null;
    } else if (data.hostel_id) {
      const parsed = parseInt(data.hostel_id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        hostelId = parsed;
      }
    }

    // Resolve batch ID
    let batchId: number | null = null;
    if (data.batch && data.batch !== 'INA') {
      const batchYear = parseInt(data.batch, 10);
      if (!isNaN(batchYear)) {
        batchId = batchMap.get(batchYear) || null;
      }
    } else if (data.batch_id) {
      const parsed = parseInt(data.batch_id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        batchId = parsed;
      }
    }

    // Resolve class section ID
    let classSectionId: number | null = null;
    if (data.class_section && data.class_section !== 'INA') {
      classSectionId = sectionMap.get(data.class_section.toLowerCase()) || null;
    } else if (data.class_section_id) {
      const parsed = parseInt(data.class_section_id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        classSectionId = parsed;
      }
    }

    // Normalize blood group: remove spaces and convert to uppercase
    let bloodGroup: string | null = null;
    if (data.blood_group && data.blood_group !== 'INA') {
      bloodGroup = data.blood_group.replace(/\s+/g, '').toUpperCase();
    }

    // Ensure full_name doesn't contain phone numbers or scientific notation
    let fullName = data.full_name.trim();
    // Check if full_name looks like a phone number or scientific notation
    if (/^[\d.eE+-]+$/.test(fullName) || /^\d{10,}$/.test(fullName)) {
      // If full_name is actually a phone number, swap it with phone if phone is empty or looks like a name
      if (!phone || phone === 'INA' || /^[a-zA-Z\s]+$/.test(phone)) {
        const temp = fullName;
        fullName = phone && phone !== 'INA' ? phone : 'Unknown';
        phone = temp.replace(/\D/g, '');
      } else {
        // If both are numbers, keep phone as is and set name to Unknown
        fullName = 'Unknown';
      }
    }

    return {
      full_name: fullName,
      email: data.email.trim().toLowerCase(),
      phone,
      roll_no: data.roll_no?.trim() || null,
      room_no: data.room_no?.trim() || null,
      hostel_id: hostelId,
      class_section_id: classSectionId,
      batch_id: batchId,
      department: data.department?.trim() || null,
      blood_group: bloodGroup,
      parent_name: data.parent_name?.trim() || null,
      parent_phone: data.parent_phone ? String(data.parent_phone.replace(/\D/g, '')) : null,
    } as ProcessedStudent;
  });
}

// Convert Zod errors to ValidationError format
function zodErrorToValidationError(
  error: z.ZodError<any>,
  rowNum: number
): ValidationError[] {
  return error.issues.map((err) => ({
    row: rowNum,
    field: err.path.join('.') || 'unknown',
    message: err.message,
    value: err.path.length > 0 ? undefined : err.message,
  }));
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);

    // Get FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', success: false, errors: [] },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();

    // Parse CSV
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'CSV file must have at least a header row and one data row', success: false, errors: [] },
        { status: 400 }
      );
    }

    // Get headers and normalize
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const normalizedHeaders = headers.map(h => headerMap[h] || h);

    // Fetch master data for lookups
    const [allHostels, allBatches, allSections] = await Promise.all([
      db.select({ id: hostels.id, name: hostels.name }).from(hostels).where(eq(hostels.is_active, true)),
      db.select({ id: batches.id, year: batches.year }).from(batches).where(eq(batches.is_active, true)),
      db.select({ id: class_sections.id, name: class_sections.name }).from(class_sections).where(eq(class_sections.is_active, true)),
    ]);

    // Create lookup maps
    const hostelMap = new Map<string, number>();
    allHostels.forEach(h => {
      hostelMap.set(h.name.toLowerCase(), h.id);
    });

    const batchMap = new Map<number, number>();
    allBatches.forEach(b => {
      batchMap.set(b.year, b.id);
    });

    const sectionMap = new Map<string, number>();
    allSections.forEach(s => {
      sectionMap.set(s.name.toLowerCase(), s.id);
    });

    // Create validation schema with ID resolution
    const StudentSchema = createStudentValidationSchema(hostelMap, batchMap, sectionMap);

    // Validate and process rows using Zod
    const validationErrors: ValidationError[] = [];
    const processedStudents: ProcessedStudent[] = [];
    const fallbackFields = new Set(['email', 'phone', 'hostel', 'class_section', 'batch', 'blood_group']);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // 1-indexed for user display
      const rowData: Record<string, string> = {};

      // Map row data to headers
      normalizedHeaders.forEach((normalizedHeader, idx) => {
        if (idx < row.length) {
          rowData[normalizedHeader] = row[idx]?.trim() || '';
        }
      });

      // Validate using Zod (with fallback to INA on selected fields)
      const result = StudentSchema.safeParse(rowData);

      if (!result.success) {
        const fallbackRow = { ...rowData };
        let modified = false;

        for (const issue of result.error.issues) {
          const field = issue.path[0] as string | undefined;
          if (field && fallbackFields.has(field)) {
            fallbackRow[field] = 'INA';
            modified = true;
          }
        }

        if (modified) {
          const retry = StudentSchema.safeParse(fallbackRow);
          if (retry.success) {
            processedStudents.push(retry.data);
            continue;
          }
        }

        const errors = zodErrorToValidationError(result.error, rowNum);
        validationErrors.push(...errors);
        continue;
      }

      processedStudents.push(result.data);
    }

    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return NextResponse.json({
        success: false,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: validationErrors,
        summary: `Validation failed: ${validationErrors.length} error(s) found`,
      }, { status: 400 });
    }

    // Process students
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const processErrors: ValidationError[] = [];

    for (let i = 0; i < processedStudents.length; i++) {
      const student = processedStudents[i];
      const rowNum = i + 2; // +2 because row 1 is header

      try {
        // Check if user exists
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, student.email))
          .limit(1);

        if (existingUser) {
          // Check if student profile exists
          const [existingStudent] = await db
            .select({ id: students.id })
            .from(students)
            .where(eq(students.user_id, existingUser.id))
            .limit(1);

          if (existingStudent) {
            // Update existing student
            await updateStudent(existingStudent.id, student);
            updated++;
          } else {
            // User exists but no student profile - create it
            await db.transaction(async (tx) => {
              // Get student role
              const [studentRole] = await tx
                .select({ id: roles.id })
                .from(roles)
                .where(eq(roles.name, 'student'))
                .limit(1);

              if (!studentRole) {
                throw new Error('Student role not found');
              }

              // Update user to ensure they have student role
              await tx
                .update(users)
                .set({
                  full_name: student.full_name,
                  phone: student.phone,
                  role_id: studentRole.id,
                  updated_at: new Date(),
                })
                .where(eq(users.id, existingUser.id));

              // Create student profile
              await tx.insert(students).values({
                user_id: existingUser.id,
                roll_no: student.roll_no || null,
                room_no: student.room_no || null,
                hostel_id: student.hostel_id || null,
                class_section_id: student.class_section_id || null,
                batch_id: student.batch_id || null,
                department: student.department || null,
                blood_group: student.blood_group || null,
                parent_name: student.parent_name || null,
                parent_phone: student.parent_phone || null,
              });
            });
            created++;
          }
        } else {
          // Create new user and student
          await createStudent(student);
          created++;
        }
      } catch (error: any) {
        processErrors.push({
          row: rowNum,
          field: 'general',
          message: error.message || 'Failed to process student',
          value: student.email,
        });
        skipped++;
      }
    }

    const totalProcessed = created + updated;
    const hasErrors = processErrors.length > 0;

    logger.info(
      { created, updated, skipped, total: processedStudents.length },
      'Bulk upload completed'
    );

    return NextResponse.json({
      success: !hasErrors && totalProcessed > 0,
      created,
      updated,
      skipped,
      errors: processErrors,
      summary: hasErrors
        ? `Processed ${totalProcessed} students with ${processErrors.length} error(s)`
        : `Successfully processed ${totalProcessed} students (${created} created, ${updated} updated)`,
    }, { status: hasErrors ? 207 : 201 }); // 207 Multi-Status if partial success
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in bulk upload');
    return NextResponse.json(
      {
        success: false,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, field: 'general', message: error.message || 'Bulk upload failed' }],
        summary: error.message || 'Bulk upload failed',
      },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
