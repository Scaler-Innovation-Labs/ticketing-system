/**
 * Cloudinary Integration Service
 * 
 * Handles file uploads to Cloudinary for ticket attachments
 */

import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { logger } from '@/lib/logger';

// ============================================
// Configuration
// ============================================

const isConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
}

// ============================================
// Types
// ============================================

export interface UploadResult {
    publicId: string;
    url: string;
    secureUrl: string;
    format: string;
    width?: number;
    height?: number;
    bytes: number;
    resourceType: string;
}

export interface UploadOptions {
    folder?: string;
    publicId?: string;
    resourceType?: 'image' | 'raw' | 'video' | 'auto';
    transformation?: object;
    tags?: string[];
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
    return isConfigured;
}

/**
 * Upload a file from buffer
 */
export async function uploadFromBuffer(
    buffer: Buffer,
    filename: string,
    options: UploadOptions = {}
): Promise<UploadResult> {
    if (!isConfigured) {
        throw new Error('Cloudinary not configured');
    }

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: options.folder || 'ticket-attachments',
                public_id: options.publicId || `${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`,
                resource_type: options.resourceType || 'auto',
                transformation: options.transformation,
                tags: options.tags,
            },
            (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
                if (error) {
                    logger.error({ error: error.message, filename }, 'Cloudinary upload failed');
                    reject(new Error(error.message));
                    return;
                }

                if (!result) {
                    reject(new Error('No result from Cloudinary'));
                    return;
                }

                logger.info(
                    { publicId: result.public_id, bytes: result.bytes },
                    'File uploaded to Cloudinary'
                );

                resolve({
                    publicId: result.public_id,
                    url: result.url,
                    secureUrl: result.secure_url,
                    format: result.format,
                    width: result.width,
                    height: result.height,
                    bytes: result.bytes,
                    resourceType: result.resource_type,
                });
            }
        );

        uploadStream.end(buffer);
    });
}

/**
 * Upload a file from base64 string
 */
export async function uploadFromBase64(
    base64Data: string,
    filename: string,
    options: UploadOptions = {}
): Promise<UploadResult> {
    if (!isConfigured) {
        throw new Error('Cloudinary not configured');
    }

    try {
        const result = await cloudinary.uploader.upload(
            `data:application/octet-stream;base64,${base64Data}`,
            {
                folder: options.folder || 'ticket-attachments',
                public_id: options.publicId || `${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`,
                resource_type: options.resourceType || 'auto',
                transformation: options.transformation,
                tags: options.tags,
            }
        );

        logger.info(
            { publicId: result.public_id, bytes: result.bytes },
            'File uploaded to Cloudinary'
        );

        return {
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resource_type,
        };
    } catch (error: any) {
        logger.error({ error: error.message, filename }, 'Cloudinary upload failed');
        throw error;
    }
}

/**
 * Upload a file from URL
 */
export async function uploadFromUrl(
    url: string,
    options: UploadOptions = {}
): Promise<UploadResult> {
    if (!isConfigured) {
        throw new Error('Cloudinary not configured');
    }

    try {
        const result = await cloudinary.uploader.upload(url, {
            folder: options.folder || 'ticket-attachments',
            public_id: options.publicId,
            resource_type: options.resourceType || 'auto',
            transformation: options.transformation,
            tags: options.tags,
        });

        logger.info(
            { publicId: result.public_id, bytes: result.bytes },
            'File uploaded to Cloudinary from URL'
        );

        return {
            publicId: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resource_type,
        };
    } catch (error: any) {
        logger.error({ error: error.message, url }, 'Cloudinary upload from URL failed');
        throw error;
    }
}

/**
 * Delete a file from Cloudinary
 */
export async function deleteFile(publicId: string, resourceType: string = 'image'): Promise<boolean> {
    if (!isConfigured) {
        return false;
    }

    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });

        logger.info({ publicId, result: result.result }, 'File deleted from Cloudinary');
        return result.result === 'ok';
    } catch (error: any) {
        logger.error({ error: error.message, publicId }, 'Failed to delete from Cloudinary');
        return false;
    }
}

/**
 * Generate a signed URL for private files
 */
export function generateSignedUrl(publicId: string, options: {
    expiresIn?: number;
    transformation?: object;
} = {}): string {
    if (!isConfigured) {
        throw new Error('Cloudinary not configured');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + (options.expiresIn || 3600);

    return cloudinary.url(publicId, {
        sign_url: true,
        type: 'authenticated',
        expires_at: expiresAt,
        transformation: options.transformation,
    });
}

/**
 * Get optimized URL for images
 */
export function getOptimizedImageUrl(publicId: string, options: {
    width?: number;
    height?: number;
    quality?: number | 'auto';
    format?: 'auto' | 'webp' | 'png' | 'jpg';
} = {}): string {
    if (!isConfigured) {
        throw new Error('Cloudinary not configured');
    }

    return cloudinary.url(publicId, {
        transformation: [
            {
                width: options.width,
                height: options.height,
                crop: 'limit',
                quality: options.quality || 'auto',
                fetch_format: options.format || 'auto',
            },
        ],
    });
}

// ============================================
// Ticket Attachment Helpers
// ============================================

/**
 * Upload ticket attachment
 */
export async function uploadTicketAttachment(
    buffer: Buffer,
    filename: string,
    ticketId: number
): Promise<UploadResult> {
    return uploadFromBuffer(buffer, filename, {
        folder: `tickets/${ticketId}`,
        tags: ['ticket-attachment', `ticket-${ticketId}`],
    });
}

/**
 * Delete all attachments for a ticket
 */
export async function deleteTicketAttachments(ticketId: number): Promise<void> {
    if (!isConfigured) {
        return;
    }

    try {
        await cloudinary.api.delete_resources_by_prefix(`tickets/${ticketId}/`);
        logger.info({ ticketId }, 'Deleted all attachments for ticket');
    } catch (error: any) {
        logger.error({ error: error.message, ticketId }, 'Failed to delete ticket attachments');
    }
}
