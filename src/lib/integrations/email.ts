/**
 * Email Integration Service
 * 
 * Handles email notifications using Nodemailer
 */

import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

// ============================================
// Configuration
// ============================================

let transporter: nodemailer.Transporter | null = null;

// Initialize Nodemailer transporter from environment variables
function getTransporter(): nodemailer.Transporter | null {
    if (transporter) return transporter;

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

    if (!smtpHost || !smtpUser || !smtpPassword) {
        logger.warn('Email not configured - missing SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for other ports
        auth: {
            user: smtpUser,
            pass: smtpPassword,
        },
    });

    return transporter;
}

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@example.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'SST-RESOLVE';

// Test email redirect - ONLY for non-production environments
const TEST_EMAIL = 'n.vedvarshit@gmail.com';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Helper to determine recipient - use actual recipients in production, test email otherwise
function getRecipients(actualRecipients: string[]): string[] {
    if (IS_PRODUCTION) {
        return actualRecipients;
    }
    // In development/test, redirect to test email
    return [TEST_EMAIL];
}

// ============================================
// Types
// ============================================

export interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    cc?: string | string[];
    replyTo?: string;
    messageId?: string; // Message ID for this email (for threading first email)
    inReplyTo?: string; // Message ID to reply to (for threading)
    references?: string; // References header (for threading)
    attachments?: Array<{
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }>;
}

export interface TicketEmailData {
    ticketId: number;
    ticketNumber: string;
    title: string;
    description: string;
    category: string;
    subcategory?: string;
    status: string;
    createdBy: string;
    createdByEmail?: string;
    assignedTo?: string;
    link: string;
    metadata?: Record<string, any>;
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
    return !!getTransporter();
}

/**
 * Generate a proper email Message ID for threading
 */
function generateMessageId(ticketNumber: string, ticketId: number): string {
    const timestamp = Date.now();
    const domain = FROM_EMAIL.split('@')[1] || 'example.com';
    return `<ticket-${ticketId}-${timestamp}@${domain}>`;
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions): Promise<string | null> {
    const mailTransporter = getTransporter();

    if (!mailTransporter) {
        logger.warn('Email not configured, skipping send');
        return null;
    }

    try {
        // Convert attachments format for Nodemailer
        const attachments = options.attachments?.map(att => {
            return {
                filename: att.filename,
                content: att.content,
                contentType: att.contentType,
            };
        });

        // Handle recipients - Nodemailer accepts strings or arrays
        const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

        // Build email payload
        const mailOptions: nodemailer.SendMailOptions = {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to,
            subject: options.subject,
        };

        // Add cc if provided
        if (options.cc) {
            mailOptions.cc = Array.isArray(options.cc) ? options.cc.join(', ') : options.cc;
        }

        // Add replyTo if provided
        if (options.replyTo) {
            mailOptions.replyTo = options.replyTo;
        }

        // Add threading headers if provided (for email threading/replies)
        if (options.messageId) {
            mailOptions.messageId = options.messageId;
        }
        if (options.inReplyTo) {
            mailOptions.inReplyTo = options.inReplyTo;
        }
        if (options.references) {
            mailOptions.references = options.references;
        }

        // Nodemailer requires at least one of text or html
        if (options.html) {
            mailOptions.html = options.html;
        }
        if (options.text) {
            mailOptions.text = options.text;
        }

        // If neither text nor html provided, use text as fallback
        if (!mailOptions.text && !mailOptions.html) {
            mailOptions.text = options.subject; // Fallback to subject
        }

        // Add attachments if provided
        if (attachments && attachments.length > 0) {
            mailOptions.attachments = attachments;
        }

        const result = await mailTransporter.sendMail(mailOptions);

        logger.info(
            { messageId: result.messageId, to: options.to },
            'Email sent successfully'
        );

        return result.messageId || null;
    } catch (error: any) {
        logger.error(
            { to: options.to, subject: options.subject, error: error.message },
            'Failed to send email'
        );
        throw error;
    }
}

// ============================================
// Email Templates
// ============================================

/**
 * Generate HTML for new ticket notification
 */
export function buildNewTicketEmail(ticket: TicketEmailData): string {
    // Normalize metadata and form details
    const rawMeta = ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {};
    const metaDetails = (rawMeta as any)?.details || {};
    const metaProfile = (rawMeta as any)?.profile || {};
    
    // Separate student profile from form fields (exclude roll_no and department)
    const studentProfileKeys = ['full_name', 'email', 'phone', 'room_no', 'hostel', 'batch', 'class_section'];
    const systemKeys = ['acknowledged_at', 'resolved_at', 'reopened_at', 'rating', 'feedback', 'attachments', 'images', 'details', 'profile'];
    
    // Extract student profile
    const studentProfile = Object.entries({ ...rawMeta, ...metaProfile })
        .filter(([k]) => studentProfileKeys.includes(k))
        .map(([k, v]) => ({ key: k, value: typeof v === 'string' ? v : String(v) }));
    
    // Extract form fields (exclude student profile and system keys)
    const formEntries = Object.entries({ ...rawMeta, ...metaDetails })
        .filter(([k, v]) => !studentProfileKeys.includes(k) && !systemKeys.includes(k) && v !== null && v !== undefined && v !== '')
        .map(([k, v]) => ({ key: k, value: typeof v === 'string' ? v : String(v) }));

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticket.ticketId} Created</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 35px 30px; border-radius: 12px 12px 0 0; text-align: center; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
    <div style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); display: inline-block; padding: 8px 20px; border-radius: 20px; margin-bottom: 15px;">
      <span style="color: white; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">✓ TICKET CREATED</span>
    </div>
    <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Ticket #${ticket.ticketId}</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px; font-family: 'Courier New', monospace;">${ticket.ticketNumber}</p>
  </div>
  
  <!-- Content -->
  <div style="background: #ffffff; padding: 35px 30px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    
    <!-- Ticket Info -->
    <div style="background: linear-gradient(to right, #f8f9fa, #ffffff); padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin-bottom: 30px;">
      <h2 style="margin: 0 0 15px 0; color: #212529; font-size: 20px; font-weight: 600;">${ticket.title}</h2>
      <p style="margin: 0 0 15px 0; color: #495057; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${ticket.description}</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 15px;">
        <span style="background: #e7f3ff; color: #0066cc; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;">${ticket.category}${ticket.subcategory ? ` → ${ticket.subcategory}` : ''}</span>
        <span style="background: #28a745; color: white; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; text-transform: capitalize;">${ticket.status}</span>
        ${ticket.assignedTo ? `<span style="background: #6c757d; color: white; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;">👤 ${ticket.assignedTo}</span>` : ''}
      </div>
    </div>

    ${formEntries.length > 0 ? `
    <!-- Form Fields -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e9ecef; padding-bottom: 8px;">📋 Form Details</h3>
      <div style="background: #f8f9fa; border-radius: 8px; overflow: hidden; border: 1px solid #e9ecef;">
        ${formEntries.map((entry, idx) => `
          <div style="padding: 14px 18px; border-bottom: ${idx < formEntries.length - 1 ? '1px solid #dee2e6' : 'none'}; display: flex; align-items: start;">
            <span style="flex: 0 0 40%; color: #6c757d; font-size: 13px; font-weight: 600; text-transform: capitalize;">${entry.key.replace(/_/g, ' ')}</span>
            <span style="flex: 1; color: #212529; font-size: 14px; word-break: break-word;">${entry.value}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    ${studentProfile.length > 0 ? `
    <!-- Student Details -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e9ecef; padding-bottom: 8px;">👤 Student Information</h3>
      <div style="background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 8px; padding: 20px; border: 1px solid #e9ecef;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          ${studentProfile.map(entry => `
            <div>
              <div style="color: #6c757d; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px;">${entry.key.replace(/_/g, ' ')}</div>
              <div style="color: #212529; font-size: 15px; font-weight: 500;">${entry.value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 35px 0 0 0;">
      <a href="${ticket.link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">View Ticket →</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="padding: 25px 20px; text-align: center;">
    <p style="margin: 0; color: #6c757d; font-size: 13px; font-weight: 500;">SST-RESOLVE Ticketing System</p>
    <p style="margin: 8px 0 0 0; color: #adb5bd; font-size: 12px;">Powered by your campus support team</p>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for status update notification
 */
export function buildStatusUpdateEmail(
    ticketId: number,
    ticketNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string,
    comment?: string
): string {
    // Status color mapping
    const statusColors: Record<string, string> = {
        open: '#007bff',
        acknowledged: '#17a2b8',
        in_progress: '#ffc107',
        resolved: '#28a745',
        closed: '#6c757d',
        awaiting_student_response: '#A855F7',
        reopened: '#dc3545',
        cancelled: '#9CA3AF',
    };

    const newStatusColor = statusColors[newStatus.toLowerCase().replace(/ /g, '_')] || '#667eea';
    const oldStatusColor = statusColors[oldStatus.toLowerCase().replace(/ /g, '_')] || '#6c757d';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticketId} Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-radius: 10px;">
    <h2 style="margin-top: 0; color: #212529; font-size: 22px;">Ticket Update</h2>
    <p style="color: #495057; font-size: 16px; margin: 5px 0 20px 0;"><strong>Ticket #${ticketId}:</strong> ${title}</p>
    
    <div style="background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; color: #495057; font-weight: 600;">Status Changed:</p>
      <p style="margin: 0; font-size: 16px;">
        <span style="background: ${oldStatusColor}; color: white; padding: 6px 14px; border-radius: 4px; font-weight: 500; text-transform: capitalize;">${oldStatus.replace(/_/g, ' ')}</span>
        <span style="margin: 0 12px; color: #6c757d;">→</span>
        <span style="background: ${newStatusColor}; color: white; padding: 6px 14px; border-radius: 4px; font-weight: 500; text-transform: capitalize;">${newStatus.replace(/_/g, ' ')}</span>
      </p>
    </div>
    
    ${comment ? `
    <div style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; color: #495057; font-weight: 600; font-size: 16px;">💬 ${newStatus.toLowerCase() === 'awaiting_student_response' ? 'Question from Admin' : 'Message'}:</p>
      <p style="margin: 0; color: #212529; white-space: pre-wrap; font-size: 15px;">${comment}</p>
    </div>
    ` : ''}
    
    <p style="color: #6c757d; font-size: 14px; margin: 20px 0;"><strong>Updated by:</strong> ${updatedBy}</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View & Reply</a>
    </div>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
    <p style="margin: 0;">SST-RESOLVE Ticketing System</p>
  </div>
</body>
</html>`;
}

// ============================================
// High-Level Notification Functions
// ============================================

/**
 * Send notification for new ticket
 */
export async function notifyNewTicketEmail(
    ticket: TicketEmailData,
    recipientEmails: string[]
): Promise<string | null> {
    const recipients = getRecipients(recipientEmails);
    const originalRecipients = recipientEmails.join(', ');
    let emailBody = buildNewTicketEmail(ticket);
    
    // Generate a Message ID for threading (using ticket ID like Slack)
    const messageId = generateMessageId(ticket.ticketNumber, ticket.ticketId);

    // Add debug note only in non-production
    if (!IS_PRODUCTION) {
        emailBody = emailBody.replace(
            '</div>',
            `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
                <strong>Note:</strong> This email was redirected for testing. Original recipients: ${originalRecipients || 'None'}
            </div></div>`
        );
    }

    return sendEmail({
        to: recipients,
        subject: `[${ticket.ticketNumber}] ${ticket.title}`,
        html: emailBody,
        messageId, // Set the Message ID for threading
        text: `Ticket Created Successfully

Ticket Number: ${ticket.ticketNumber}
Title: ${ticket.title}
Description: ${ticket.description}
Category: ${ticket.category}
${ticket.subcategory ? `Subcategory: ${ticket.subcategory}\n` : ''}Status: ${ticket.status}
${ticket.assignedTo ? `Assigned To: ${ticket.assignedTo}\n` : 'Assigned To: Pending assignment\n'}${ticket.metadata ? Object.entries(ticket.metadata)
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !['acknowledged_at','resolved_at','reopened_at','rating','feedback','attachments','images','details','profile'].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
    .join('\n') : ''}\nView your ticket: ${ticket.link}

Thank you for submitting your ticket! We have received your request and will review it shortly.${ticket.assignedTo ? ` Your ticket has been assigned to ${ticket.assignedTo} who will assist you.` : ' An admin will be assigned to your ticket soon.'}

This is an automated confirmation email. Please do not reply to this email.`,
    });
}

/**
 * Send notification for status update
 */
export async function notifyStatusUpdateEmail(
    ticketId: number,
    ticketNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string,
    recipientEmails: string[],
    inReplyTo?: string,
    references?: string,
    comment?: string
): Promise<string | null> {
    const recipients = getRecipients(recipientEmails);
    let emailBody = buildStatusUpdateEmail(ticketId, ticketNumber, title, oldStatus, newStatus, updatedBy, link, comment);

    // Add debug note only in non-production
    if (!IS_PRODUCTION) {
        const originalRecipients = recipientEmails.join(', ');
        emailBody = emailBody.replace(
            '</div>',
            `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
                <strong>Note:</strong> This email was redirected for testing. Original recipients: ${originalRecipients || 'None'}
            </div></div>`
        );
    }

    const textContent = `Ticket ${ticketNumber} status changed from ${oldStatus} to ${newStatus}${comment ? `\n\nMessage:\n${comment}` : ''}\n\nUpdated by: ${updatedBy}\n\nView: ${link}`;
    
    return sendEmail({
        to: recipients,
        subject: `Re: [${ticketNumber}] ${title}`, // Re: prefix for threaded emails
        html: emailBody,
        text: textContent,
        inReplyTo,
        references,
    });
}

/**
 * Generate HTML for ticket comment/question notification
 */
export function buildCommentEmail(
    ticketNumber: string,
    title: string,
    comment: string,
    commentedBy: string,
    link: string
): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Update on Ticket: ${ticketNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-radius: 10px;">
    <h2 style="margin-top: 0; color: #212529;">Update on Your Ticket</h2>
    <p style="color: #495057; font-size: 16px;"><strong>Ticket:</strong> ${ticketNumber} - ${title}</p>
    
    <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #495057; white-space: pre-wrap;">${comment}</p>
    </div>
    
    <p style="color: #6c757d; font-size: 14px;"><strong>From:</strong> ${commentedBy}</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Ticket & Reply</a>
    </div>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
    <p style="margin: 0;">This is an automated update from the Ticketing System.</p>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for ticket reassignment/forward notification
 */
export function buildReassignmentEmail(
    ticketNumber: string,
    title: string,
    action: 'reassigned' | 'forwarded',
    assignedTo: string,
    assignedBy: string,
    link: string,
    reason?: string
): string {
    const actionText = action === 'forwarded' ? 'forwarded' : 'reassigned';
    const actionTitle = action === 'forwarded' ? 'Ticket Forwarded' : 'Ticket Reassigned';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionTitle}: ${ticketNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-radius: 10px;">
    <h2 style="margin-top: 0; color: #212529;">${actionTitle}</h2>
    <p style="color: #495057; font-size: 16px;"><strong>Ticket:</strong> ${ticketNumber} - ${title}</p>
    
    <div style="background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #495057;">Your ticket has been ${actionText} to <strong>${assignedTo}</strong>.</p>
      ${reason ? `<p style="margin: 10px 0 0 0; color: #6c757d; font-size: 14px;"><strong>Reason:</strong> ${reason}</p>` : ''}
    </div>
    
    <p style="color: #6c757d; font-size: 14px;"><strong>${action === 'forwarded' ? 'Forwarded' : 'Reassigned'} by:</strong> ${assignedBy}</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Ticket</a>
    </div>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
    <p style="margin: 0;">This is an automated update from the Ticketing System.</p>
  </div>
</body>
</html>`;
}

/**
 * Send notification for ticket comment/question (threaded to student)
 */
export async function notifyCommentEmail(
    ticketNumber: string,
    title: string,
    comment: string,
    commentedBy: string,
    link: string,
    recipientEmail: string,
    inReplyTo?: string,
    references?: string
): Promise<string | null> {
    const recipients = getRecipients([recipientEmail]);
    let emailBody = buildCommentEmail(ticketNumber, title, comment, commentedBy, link);

    // Add debug note only in non-production
    if (!IS_PRODUCTION) {
        emailBody = emailBody.replace(
            '</div>',
            `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
                <strong>Note:</strong> This email was redirected for testing. Original recipient: ${recipientEmail}
            </div></div>`
        );
    }

    return sendEmail({
        to: recipients,
        subject: `Re: [${ticketNumber}] ${title}`,
        html: emailBody,
        text: `Update on ticket ${ticketNumber}: ${title}\n\n${comment}\n\nFrom: ${commentedBy}\n\nView: ${link}`,
        inReplyTo,
        references,
    });
}

/**
 * Send notification for ticket reassignment/forward (threaded to student)
 */
export async function notifyReassignmentEmail(
    ticketNumber: string,
    title: string,
    action: 'reassigned' | 'forwarded',
    assignedTo: string,
    assignedBy: string,
    link: string,
    recipientEmail: string,
    reason?: string,
    inReplyTo?: string,
    references?: string
): Promise<string | null> {
    const recipients = getRecipients([recipientEmail]);
    let emailBody = buildReassignmentEmail(ticketNumber, title, action, assignedTo, assignedBy, link, reason);

    // Add debug note only in non-production
    if (!IS_PRODUCTION) {
        emailBody = emailBody.replace(
            '</div>',
            `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
                <strong>Note:</strong> This email was redirected for testing. Original recipient: ${recipientEmail}
            </div></div>`
        );
    }

    const actionText = action === 'forwarded' ? 'forwarded' : 'reassigned';
    return sendEmail({
        to: recipients,
        subject: `Re: [${ticketNumber}] ${title}`,
        html: emailBody,
        text: `Your ticket ${ticketNumber} has been ${actionText} to ${assignedTo}${reason ? `\nReason: ${reason}` : ''}\n\n${assignedBy} ${actionText} this ticket.\n\nView: ${link}`,
        inReplyTo,
        references,
    });
}
