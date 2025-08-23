import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Test 1: Check current tokens
    const currentTokens = await storage.kv.getOAuthTokens();
    
    console.log('REAUTH TEST: Current tokens:', !!currentTokens?.accessToken);
    
    // Test 2: Verify auth provider creation
    const authProvider = createAuthProvider(env);
    
    console.log('REAUTH TEST: Auth provider type:', authProvider.constructor.name);
    
    // Test 3: Check environment
    const envCheck = {
      environment: env.ENVIRONMENT,
      hasClientId: !!env.ADOBE_CLIENT_ID,
      hasClientSecret: !!env.ADOBE_CLIENT_SECRET,
      clientIdPrefix: env.ADOBE_CLIENT_ID?.substring(0, 8) || 'none'
    };
    
    console.log('REAUTH TEST: Environment:', envCheck);
    
    // Test 4: Generate auth URL (don't redirect)
    let authUrl = null;
    if (env.ENVIRONMENT === 'production' && authProvider.generateAuthUrl) {
      const redirectUri = `${url.origin}/admin/auth/callback`;
      authUrl = authProvider.generateAuthUrl(redirectUri, 'test-state');
      console.log('REAUTH TEST: Generated auth URL length:', authUrl.length);
    }
    
    return Response.json({
      success: true,
      tests: {
        currentTokens: {
          exists: !!currentTokens?.accessToken,
          hasRefreshToken: !!currentTokens?.refreshToken,
          expiresAt: currentTokens?.expiresAt
        },
        authProvider: {
          type: authProvider.constructor.name,
          hasGenerateAuthUrl: typeof authProvider.generateAuthUrl === 'function',
          hasExchangeCodeForTokens: typeof authProvider.exchangeCodeForTokens === 'function'
        },
        environment: envCheck,
        authUrl: authUrl ? {
          length: authUrl.length,
          isAdobeUrl: authUrl.includes('adobelogin.com'),
          preview: authUrl.substring(0, 100) + '...'
        } : null
      }
    });
    
  } catch (error: any) {
    console.error('REAUTH TEST: Test failed:', error);
    return Response.json({
      error: 'Reauth test failed', 
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};