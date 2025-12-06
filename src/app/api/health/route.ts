/**
 * Health Check Endpoint
 * 
 * Verifies system health for monitoring and load balancers.
 * - Database connectivity
 * - Configuration loaded
 * - Basic system info
 */

import { NextRequest } from 'next/server';
import { db, sql } from '@/db';
import { config, isDevelopment } from '@/conf/config';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  environment: string;
  checks: {
    database: {
      status: 'ok' | 'error';
      latency?: number;
      error?: string;
    };
    config: {
      status: 'ok' | 'error';
      error?: string;
    };
  };
  version?: string;
}

/**
 * GET /api/health
 * 
 * Returns system health status.
 * Used by monitoring tools and load balancers.
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      checks: {
        database: { status: 'ok' },
        config: { status: 'ok' },
      },
    };

    // Check database connectivity
    try {
      const dbStartTime = Date.now();
      
      // Simple query to test connection
      const result = await sql`SELECT 1 as result`;
      
      const dbLatency = Date.now() - dbStartTime;
      health.checks.database = {
        status: 'ok',
        latency: dbLatency,
      };

      // Warn if database is slow
      if (dbLatency > 1000) {
        health.status = 'degraded';
        logger.warn(
          { latency: dbLatency },
          'Database health check slow'
        );
      }
    } catch (error) {
      health.status = 'unhealthy';
      health.checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      logger.error(
        { error },
        'Database health check failed'
      );
    }

    // Check config loaded
    try {
      if (!config.databaseUrl || !config.clerk.secretKey) {
        throw new Error('Required configuration missing');
      }
      health.checks.config.status = 'ok';
    } catch (error) {
      health.status = 'unhealthy';
      health.checks.config = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      logger.error(
        { error },
        'Configuration health check failed'
      );
    }

    // Add version in development
    if (isDevelopment) {
      health.version = process.env.npm_package_version || 'unknown';
    }

    // Log health check
    const totalLatency = Date.now() - startTime;
    logger.info(
      {
        status: health.status,
        latency: totalLatency,
        dbLatency: health.checks.database.latency,
      },
      'Health check completed'
    );

    // Return appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 503;

    return Response.json(health, { status: statusCode });
  } catch (error) {
    logger.error({ error }, 'Health check endpoint error');
    return handleApiError(error);
  }
}
