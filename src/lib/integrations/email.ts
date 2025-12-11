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
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Ticketing System';

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
    return !!getTransporter();
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
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Confirmation: ${ticket.ticketNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">✅ Ticket Created Successfully</h1>
    <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 16px;">Your ticket has been submitted and is being processed</p>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px; font-weight: 500;">Ticket Number: ${ticket.ticketNumber}</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
      <p style="margin: 0; color: #495057; font-size: 14px;">
        <strong>Thank you for submitting your ticket!</strong> We have received your request and will review it shortly. 
        ${ticket.assignedTo ? `Your ticket has been assigned to ${ticket.assignedTo} who will assist you.` : 'An admin will be assigned to your ticket soon.'}
      </p>
    </div>

    <h2 style="margin-top: 0; color: #212529; font-size: 20px; border-bottom: 2px solid #e9ecef; padding-bottom: 10px;">Ticket Details</h2>
    
    <div style="margin: 20px 0;">
      <h3 style="color: #495057; margin: 0 0 8px 0; font-size: 16px;">${ticket.title}</h3>
      <p style="color: #6c757d; margin: 0; white-space: pre-wrap;">${ticket.description}</p>
    </div>
    
    <table style="width: 100%; border-collapse: collapse; margin: 25px 0; background: #f8f9fa; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; width: 35%;"><strong style="color: #495057;">Ticket Number:</strong></td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #212529; font-family: monospace; font-weight: 600;">${ticket.ticketNumber}</td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6;"><strong style="color: #495057;">Category:</strong></td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #212529;">${ticket.category}</td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6;"><strong style="color: #495057;">Status:</strong></td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6;">
          <span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 500; text-transform: capitalize;">${ticket.status}</span>
        </td>
      </tr>
      ${ticket.assignedTo ? `
      <tr>
        <td style="padding: 12px 15px;"><strong style="color: #495057;">Assigned To:</strong></td>
        <td style="padding: 12px 15px; color: #212529;">${ticket.assignedTo}</td>
      </tr>
      ` : `
      <tr>
        <td style="padding: 12px 15px;"><strong style="color: #495057;">Assigned To:</strong></td>
        <td style="padding: 12px 15px; color: #6c757d; font-style: italic;">Pending assignment</td>
      </tr>
      `}
    </table>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${ticket.link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">View Your Ticket</a>
    </div>

    <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin-top: 25px;">
      <p style="margin: 0 0 10px 0; color: #495057; font-size: 14px; font-weight: 600;">What happens next?</p>
      <ul style="margin: 0; padding-left: 20px; color: #6c757d; font-size: 14px; line-height: 1.8;">
        <li>Your ticket will be reviewed by our support team</li>
        <li>You'll receive updates via email when there are status changes</li>
        <li>You can track the progress by clicking the "View Your Ticket" button above</li>
      </ul>
    </div>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
    <p style="margin: 0;">This is an automated confirmation email from the Ticketing System.</p>
    <p style="margin: 5px 0 0 0;">Please do not reply to this email. If you need to add more information, please update your ticket using the link above.</p>
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
    const recipients = getRecipients(recipientEmails);
    const originalRecipients = recipientEmails.join(', ');
    let emailBody = buildNewTicketEmail(ticket);

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
        subject: `Ticket Confirmation: ${ticket.ticketNumber} - ${ticket.title}`,
        html: emailBody,
        text: `Ticket Created Successfully\n\nYour ticket has been submitted and is being processed.\n\nTicket Number: ${ticket.ticketNumber}\nTitle: ${ticket.title}\nDescription: ${ticket.description}\nCategory: ${ticket.category}\nStatus: ${ticket.status}\n${ticket.assignedTo ? `Assigned To: ${ticket.assignedTo}\n` : 'Assigned To: Pending assignment\n'}\nView your ticket: ${ticket.link}\n\nThank you for submitting your ticket! We have received your request and will review it shortly.${ticket.assignedTo ? ` Your ticket has been assigned to ${ticket.assignedTo} who will assist you.` : ' An admin will be assigned to your ticket soon.'}\n\nThis is an automated confirmation email. Please do not reply to this email.`,
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
    const recipients = getRecipients(recipientEmails);
    let emailBody = buildStatusUpdateEmail(ticketNumber, title, oldStatus, newStatus, updatedBy, link);

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

    return sendEmail({
        to: recipients,
        subject: `[${ticketNumber}] Status Updated: ${newStatus}`,
        html: emailBody,
        text: `Ticket ${ticketNumber} status changed from ${oldStatus} to ${newStatus}\nUpdated by: ${updatedBy}\n\nView: ${link}`,
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
    const recipients = getRecipients([recipientEmail]);

    // Build HTML - only add debug note in non-production
    const debugNote = !IS_PRODUCTION
        ? `<div style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-left: 3px solid #667eea; font-size: 12px;">
            <strong>Note:</strong> This email was redirected for testing. Original recipient: ${recipientEmail}
           </div>`
        : '';

    return sendEmail({
        to: recipients,
        subject: `[${ticketNumber}] Ticket Assigned to You`,
        html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Ticket Assigned to You</h2>
        <p>You have been assigned to ticket <strong>${ticketNumber}</strong>:</p>
        <p><strong>${title}</strong></p>
        <p>Assigned to: ${assignedTo}</p>
        <p>Assigned by: ${assignedBy}</p>
        <a href="${link}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Ticket</a>
        ${debugNote}
      </div>
    `,
        text: `You have been assigned to ticket ${ticketNumber}: ${title}\nAssigned to: ${assignedTo}\nAssigned by: ${assignedBy}\n\nView: ${link}`,
    });
}
