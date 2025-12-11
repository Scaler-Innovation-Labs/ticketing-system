/**
 * Integration Services Index
 * 
 * Re-exports all integration services for convenient importing
 */

// Slack
export {
    isSlackConfigured,
    sendSlackMessage,
    updateSlackMessage,
    notifyNewTicket as slackNotifyNewTicket,
    notifyStatusUpdate as slackNotifyStatusUpdate,
    notifyAssignment as slackNotifyAssignment,
    buildNewTicketBlocks,
    buildStatusUpdateBlocks,
    type SlackMessage,
    type TicketSlackNotification,
} from './slack';

// Email
export {
    isEmailConfigured,
    sendEmail,
    notifyNewTicketEmail,
    notifyStatusUpdateEmail,
    notifyAssignmentEmail,
    notifyCommentEmail,
    notifyReassignmentEmail,
    buildNewTicketEmail,
    buildStatusUpdateEmail,
    type EmailOptions,
    type TicketEmailData,
} from './email';

// Cloudinary
export {
    isCloudinaryConfigured,
    uploadFromBuffer,
    uploadFromBase64,
    uploadFromUrl,
    deleteFile,
    generateSignedUrl,
    getOptimizedImageUrl,
    uploadTicketAttachment,
    deleteTicketAttachments,
    type UploadResult,
    type UploadOptions,
} from './cloudinary';

// Unified Notification Service
export {
    notifyTicketCreated,
    notifyStatusUpdated,
    notifyTicketAssigned,
    type NotificationContext,
    type NotificationResult,
} from './notification-service';
