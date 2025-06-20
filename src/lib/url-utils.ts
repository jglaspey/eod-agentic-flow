/**
 * URL Utilities for Dynamic Environment Detection
 * 
 * This module provides robust URL detection that works across all environments:
 * - Development (localhost)
 * - Preview deployments (branch-specific URLs)
 * - Production (custom domains)
 * 
 * No hardcoded URLs or manual configuration required.
 */

import { NextRequest } from 'next/server';

/**
 * Get the current deployment URL dynamically
 * Works in all Vercel environments without configuration
 * 
 * @param request - The Next.js request object (optional, for server-side)
 * @returns The full base URL (with protocol) for the current environment
 */
export function getDeploymentUrl(request?: NextRequest): string {
  // Server-side detection
  if (request) {
    // Try to get host from request headers
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    
    if (host) {
      return `${protocol}://${host}`;
    }
  }
  
  // Vercel automatic environment variables (server-side only)
  if (typeof window === 'undefined') {
    // Production URL (custom domain if available, vercel.app if not)
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    
    // Current deployment URL (works for all environments)
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    
    // Branch-specific URL for preview deployments
    if (process.env.VERCEL_BRANCH_URL) {
      return `https://${process.env.VERCEL_BRANCH_URL}`;
    }
  }
  
  // Client-side detection
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // Development fallback
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  
  // Last resort fallback (should never happen)
  throw new Error('Unable to determine deployment URL. This should not happen in normal operation.');
}

/**
 * Create an absolute URL for an API endpoint
 * 
 * @param path - The API path (e.g., '/api/queue/process')
 * @param request - The Next.js request object (optional)
 * @returns Full absolute URL
 */
export function createApiUrl(path: string, request?: NextRequest): string {
  const baseUrl = getDeploymentUrl(request);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Trigger an internal API endpoint via HTTP
 * This replaces the need for setImmediate in serverless environments
 * 
 * @param path - The API path to trigger
 * @param request - The current request object
 * @param options - Additional fetch options
 */
export async function triggerInternalApi(
  path: string, 
  request?: NextRequest,
  options: RequestInit = {}
): Promise<void> {
  try {
    const url = createApiUrl(path, request);
    
    console.log(`🔄 Triggering internal API: ${url}`);
    
    // Fire and forget - don't await the response
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-queue-trigger': 'internal',
        ...options.headers
      },
      ...options
    }).catch(err => {
      console.error(`Failed to trigger ${path}:`, err);
    });
    
  } catch (error) {
    console.error(`Error creating URL for ${path}:`, error);
  }
}

/**
 * Environment information for debugging
 */
export function getEnvironmentInfo(): {
  environment: 'development' | 'preview' | 'production' | 'unknown';
  deploymentUrl?: string;
  vercelEnv?: string;
  vercelUrl?: string;
  branchUrl?: string;
  productionUrl?: string;
} {
  return {
    environment: process.env.VERCEL_ENV as any || 
                (process.env.NODE_ENV === 'development' ? 'development' : 'unknown'),
    deploymentUrl: getDeploymentUrl(),
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    branchUrl: process.env.VERCEL_BRANCH_URL,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL
  };
}