/**
 * Cron Authentication Helper
 * 
 * Verifies cron job requests using Bearer token or secret header
 */

import { NextRequest, NextResponse } from 'next/server';

export function verifyCronAuth(request: NextRequest): NextResponse | null {
  // Allow bypassing auth in development mode for easier testing
  if (process.env.NODE_ENV === 'development') {
    return null; // Auth bypassed in development
  }
  
  const authHeader = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-cron-secret');
  
  const expectedSecret = process.env.CRON_SECRET || 'your-cron-secret-here';
  
  // Check Bearer token
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    if (token === expectedSecret) {
      return null; // Auth successful
    }
  }
  
  // Check custom header
  if (cronSecret === expectedSecret) {
    return null; // Auth successful
  }
  
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}
