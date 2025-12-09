/**
 * Email Integration Service
 * 
 * Handles email notifications using Resend
 */

import { Resend } from 'resend';
import { logger } from '@/lib/logger';

// ============================================
// Configuration
// ============================================

let resendClient: Resend | null = null;

// Initialize Resend client from environment variables
function getResendClient(): Resend | null {
    if (resendClient) return resendClient;

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        logger.warn('Email not configured - missing RESEND_API_KEY');
        return null;
    }

    resendClient = new Resend(apiKey);
    return resendClient;
}

// Use Resend's test domain if no EMAIL_FROM is set (for testing)
// For production, set EMAIL_FROM to your verified domain email
const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Ticketing System';

// Temporary: Redirect all emails to this address for testing (until domain is verified)
const TEST_EMAIL = 'n.vedvarshit@gmail.com';

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
    status: string;
    createdBy: string;
    assignedTo?: string;
    link: string;
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
    return !!getResendClient();
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions): Promise<string | null> {
    const client = getResendClient();

    if (!client) {
        logger.warn('Email not configured, skipping send');
        return null;
    }

    try {
        // Convert attachments format for Resend (base64 encoded)
        const attachments = options.attachments?.map(att => {
            let content: string;
            if (typeof att.content === 'string') {
                // If already a string, assume it's base64 or convert to base64
                content = att.content;
            } else {
                // Convert Buffer to base64
                content = att.content.toString('base64');
            }
            
            return {
                filename: att.filename,
                content,
            };
        });

        // Handle recipients - Resend expects arrays
        const to = Array.isArray(options.to) ? options.to : [options.to];
        
        // Build email payload - only include defined fields
        const emailPayload: any = {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to,
            subject: options.subject,
        };

        // Add cc if provided
        if (options.cc) {
            emailPayload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
        }

        // Add replyTo if provided
        if (options.replyTo) {
            emailPayload.replyTo = options.replyTo;
        }

        // Resend requires at least one of text or html
        if (options.html) {
            emailPayload.html = options.html;
        }
        if (options.text) {
            emailPayload.text = options.text;
        }
        
        // If neither text nor html provided, use text as fallback
        if (!emailPayload.text && !emailPayload.html) {
            emailPayload.text = options.subject; // Fallback to subject
        }

        // Add attachments if provided
        if (attachments && attachments.length > 0) {
            emailPayload.attachments = attachments;
        }

        const result = await client.emails.send(emailPayload);

        if (result.error) {
            throw new Error(result.error.message || 'Failed to send email');
        }

        logger.info(
            { messageId: result.data?.id, to: options.to },
            'Email sent successfully'
        );

        return result.data?.id || null;
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
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Ticket: ${ticket.ticketNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🎫 New Ticket Created</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${ticket.ticketNumber}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef; border-top: none;">
    <h2 style="margin-top: 0; color: #495057;">${ticket.title}</h2>
    <p style="color: #6c757d;">${ticket.description}</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Category:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${ticket.category}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Status:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">
          <span style="background: #28a745; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${ticket.status}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Created By:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${ticket.createdBy}</td>
      </tr>
      <tr>
        <td style="padding: 10px;"><strong>Assigned To:</strong></td>
        <td style="padding: 10px;">${ticket.assignedTo || 'Unassigned'}</td>
      </tr>
    </table>
    
    <a href="${ticket.link}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Ticket</a>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
    <p>This is an automated message from the Ticketing System.</p>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for status update notification
 */
export function buildStatusUpdateEmail(
    ticketNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string
): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket Status Update: ${ticketNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea;">
    <h2 style="margin: 0 0 10px 0;">📋 Ticket Status Updated</h2>
    <p style="margin: 0; color: #6c757d;">Ticket <strong>${ticketNumber}</strong> - ${title}</p>
  </div>
  
  <div style="padding: 20px 0;">
    <p>The status has been changed:</p>
    <p style="font-size: 18px;">
      <span style="background: #e9ecef; padding: 4px 12px; border-radius: 4px;">${oldStatus}</span>
      <span style="margin: 0 10px;">→</span>
      <span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 4px;">${newStatus}</span>
    </p>
    <p style="color: #6c757d;">Updated by: ${updatedBy}</p>
  </div>
  
  <a href="${link}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Ticket</a>
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
    // Temporary: Redirect to test email, but include original recipients in body
    const originalRecipients = recipientEmails.join(', ');
    const emailBody = buildNewTicketEmail(ticket);
    const emailBodyWithRecipients = emailBody.replace(
        '</div>',
        `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
            <strong>Note:</strong> This email was redirected for testing. Original recipients: ${originalRecipients || 'None'}
        </div></div>`
    );
    
    return sendEmail({
        to: [TEST_EMAIL],
        subject: `[${ticket.ticketNumber}] New Ticket: ${ticket.title}`,
        html: emailBodyWithRecipients,
        text: `New ticket created: ${ticket.ticketNumber}\n\nTitle: ${ticket.title}\nCategory: ${ticket.category}\nCreated by: ${ticket.createdBy}\n\nOriginal recipients: ${originalRecipients || 'None'}\n\nView: ${ticket.link}`,
    });
}

/**
 * Send notification for status update
 */
export async function notifyStatusUpdateEmail(
    ticketNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string,
    recipientEmails: string[]
): Promise<string | null> {
    // Temporary: Redirect to test email, but include original recipients in body
    const originalRecipients = recipientEmails.join(', ');
    const emailBody = buildStatusUpdateEmail(ticketNumber, title, oldStatus, newStatus, updatedBy, link);
    const emailBodyWithRecipients = emailBody.replace(
        '</div>',
        `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
            <strong>Note:</strong> This email was redirected for testing. Original recipients: ${originalRecipients || 'None'}
        </div></div>`
    );
    
    return sendEmail({
        to: [TEST_EMAIL],
        subject: `[${ticketNumber}] Status Updated: ${newStatus}`,
        html: emailBodyWithRecipients,
        text: `Ticket ${ticketNumber} status changed from ${oldStatus} to ${newStatus}\nUpdated by: ${updatedBy}\n\nOriginal recipients: ${originalRecipients || 'None'}\n\nView: ${link}`,
    });
}

/**
 * Send notification for ticket assignment
 */
export async function notifyAssignmentEmail(
    ticketNumber: string,
    title: string,
    assignedTo: string,
    assignedBy: string,
    link: string,
    recipientEmail: string
): Promise<string | null> {
    // Temporary: Redirect to test email, but include original recipient in body
    return sendEmail({
        to: [TEST_EMAIL],
        subject: `[${ticketNumber}] Ticket Assigned to You`,
        html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Ticket Assigned to You</h2>
        <p>You have been assigned to ticket <strong>${ticketNumber}</strong>:</p>
        <p><strong>${title}</strong></p>
        <p>Assigned to: ${assignedTo}</p>
        <p>Assigned by: ${assignedBy}</p>
        <a href="${link}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Ticket</a>
        <div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
            <strong>Note:</strong> This email was redirected for testing. Original recipient: ${recipientEmail}
        </div>
      </div>
    `,
        text: `You have been assigned to ticket ${ticketNumber}: ${title}\nAssigned to: ${assignedTo}\nAssigned by: ${assignedBy}\n\nOriginal recipient: ${recipientEmail}\nView: ${link}`,
    });
}
