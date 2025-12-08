import { NextRequest, NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { uploadFromBuffer, isCloudinaryConfigured } from '@/lib/integrations/cloudinary';
import { logger } from '@/lib/logger';

// Max 10MB
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireDbUser();

    if (!isCloudinaryConfigured()) {
      throw Errors.internal('Uploads are not configured');
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      throw Errors.validation('No file provided');
    }

    if (!ALLOWED.includes(file.type)) {
      throw Errors.validation('Only JPEG/PNG/WebP images allowed');
    }

    if (file.size > MAX_SIZE) {
      throw Errors.validation('File exceeds 10MB limit');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await uploadFromBuffer(buffer, file.name, {
      folder: 'ticket-attachments',
      resourceType: 'auto',
      tags: ['ticket-attachment', 'generic-upload'],
    });

    logger.info(
      { userId: dbUser.id, publicId: result.publicId, bytes: file.size },
      'Ticket attachment uploaded'
    );

    return NextResponse.json({ url: result.secureUrl }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Ticket attachment upload failed');
    return handleApiError(error);
  }
}

