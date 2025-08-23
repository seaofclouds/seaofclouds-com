import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../lib/storage';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  const testKey = url.searchParams.get('key');
  
  // Simple auth bypass for debugging  
  if (testKey !== 'debug123') {
    return Response.json({ error: 'Add ?key=debug123 to access debug info' }, { status: 401 });
  }
  
  try {
    const storage = createStorageHelpers(env);
    
    console.log('DEBUG: Testing token storage...');
    
    // Test 1: Create fake tokens
    const testTokens = {
      accessToken: 'test-access-token-123',
      refreshToken: 'test-refresh-token-456', 
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scope: 'openid,AdobeID,lr_partner_apis',
      tokenType: 'Bearer'
    };
    
    // Test 2: Store tokens
    await storage.kv.setOAuthTokens(testTokens);
    console.log('DEBUG: Stored test tokens');
    
    // Test 3: Read tokens back immediately
    const retrievedTokens = await storage.kv.getOAuthTokens();
    console.log('DEBUG: Retrieved tokens:', !!retrievedTokens?.accessToken);
    
    return Response.json({
      success: true,
      environment: env.ENVIRONMENT,
      testResults: {
        storedTokens: testTokens,
        retrievedTokens: retrievedTokens,
        storageWorked: !!retrievedTokens?.accessToken && retrievedTokens.accessToken === testTokens.accessToken
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('DEBUG: Token storage test failed:', error);
    return Response.json({
      error: 'Debug test failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};