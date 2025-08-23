import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Check OAuth tokens
    const oauthTokens = await storage.kv.getOAuthTokens();
    
    // Check rate limit status
    const rateLimitStatus = await storage.kv.getRateLimitStatus();
    
    return Response.json({
      environment: env.ENVIRONMENT,
      oauth: {
        hasTokens: !!oauthTokens?.access_token,
        tokenLength: oauthTokens?.access_token?.length || 0,
        hasRefreshToken: !!oauthTokens?.refresh_token,
        expiresAt: oauthTokens?.expires_at ? new Date(oauthTokens.expires_at).toISOString() : null,
        isExpired: oauthTokens?.expires_at ? Date.now() > oauthTokens.expires_at : null
      },
      rateLimit: rateLimitStatus,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    return Response.json({
      error: 'Debug failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};