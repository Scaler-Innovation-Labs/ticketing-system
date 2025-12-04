/**
 * Database Connection
 * 
 * Configured with proper connection pooling and error handling.
 * Uses postgres driver (better than neon-http for self-hosted DBs).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config, isDevelopment } from '@/conf/config';
import { DB_CONFIG } from '@/conf/constants';
import * as schema from './schema';
import * as schemaTickets from './schema-tickets';
import * as schemaQueue from './schema-queue';

// Merge all schemas
const fullSchema = {
  ...schema,
  ...schemaTickets,
  ...schemaQueue,
};

// Create postgres client with connection pooling
const queryClient = postgres(config.databaseUrl, {
  max: DB_CONFIG.MAX_CONNECTIONS,
  idle_timeout: DB_CONFIG.IDLE_TIMEOUT,
  connect_timeout: DB_CONFIG.CONNECT_TIMEOUT,
  max_lifetime: DB_CONFIG.MAX_LIFETIME,
  
  // Prepared statements for better performance
  prepare: true,
  
  // Connection naming for debugging
  connection: {
    application_name: isDevelopment ? 'ticketing-system-dev' : 'ticketing-system',
  },
  
  // Logging in development
  debug: isDevelopment ? (connection, query, params) => {
    // Only log slow queries in dev
    console.log('[DB Query]', query);
  } : undefined,
  
  // Error handling
  onnotice: isDevelopment ? console.log : undefined,
});

// Create drizzle instance
export const db = drizzle(queryClient, { schema: fullSchema });

// Export query client for raw SQL if needed
export { queryClient as sql };

// Export schema modules
export * from './schema';
export * from './schema-tickets';
export * from './schema-queue';

/**
 * Type for database transaction
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
