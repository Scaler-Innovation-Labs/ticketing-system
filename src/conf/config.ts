/**
 * Application Configuration
 * 
 * Type-safe configuration with runtime validation using Zod.
 * Fails fast if required environment variables are missing.
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables (load .env first, then .env.local which can override)
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// Define configuration schema
const configSchema = z.object({
  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Application
  appUrl: z.string().url().default('http://localhost:3000'),

  // Database
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),

  // Clerk Authentication
  clerk: z.object({
    publishableKey: z.string().optional(),
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional(),
  }),

  // Cron Jobs (optional in development)
  cronSecret: z.string().optional().default(''),

  // Optional: External Services
  slack: z.object({
    botToken: z.string().optional(),
    signingSecret: z.string().optional(),
  }).optional(),

  // Optional: Email (SMTP via Nodemailer)
  email: z.object({
    smtpHost: z.string().optional(),
    smtpPort: z.string().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    from: z.string().email().optional(),
    fromName: z.string().optional(),
  }).optional(),
});

// Parse and validate configuration
function loadConfig() {
  try {
    return configSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      databaseUrl: process.env.DATABASE_URL,
      clerk: {
        publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY,
        webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
      },
      cronSecret: process.env.CRON_SECRET,
      slack: {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
      },
      email: {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD ? '***' : undefined, // Don't expose password
        from: process.env.EMAIL_FROM,
        fromName: process.env.EMAIL_FROM_NAME,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      (error as z.ZodError).issues.forEach((err: z.ZodIssue) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration. Please check your environment variables.');
    }
    throw error;
  }
}

export const config = loadConfig();

export type AppConfig = z.infer<typeof configSchema>;

// Export individual config sections for convenience
export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
export const isTest = config.nodeEnv === 'test';

export default config;
