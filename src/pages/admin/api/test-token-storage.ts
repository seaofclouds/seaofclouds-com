import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Test 1: Create fake tokens
    const testTokens = {
      accessToken: 'test-access-token-123',
      refreshToken: 'test-refresh-token-456', 
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scope: 'openid,AdobeID,lr_partner_apis',
      tokenType: 'Bearer'
    };
    
    console.log('TEST: About to store test tokens');
    
    // Test 2: Store tokens
    await storage.kv.setOAuthTokens(testTokens);
    
    console.log('TEST: Test tokens stored, now reading back');
    
    // Test 3: Read tokens back
    const retrievedTokens = await storage.kv.getOAuthTokens();
    
    console.log('TEST: Retrieved tokens:', !!retrievedTokens);
    
    // Test 4: Clear tokens
    await storage.kv.clearOAuthTokens();
    
    console.log('TEST: Cleared tokens, reading again');
    
    // Test 5: Verify cleared
    const clearedTokens = await storage.kv.getOAuthTokens();
    
    return Response.json({
      success: true,
      tests: {
        originalTokens: testTokens,
        retrievedTokens: retrievedTokens,
        clearedTokens: clearedTokens,
        storageWorks: !!retrievedTokens?.accessToken,
        clearWorks: !clearedTokens?.accessToken
      }
    });
    
  } catch (error: any) {
    console.error('TEST: Token storage test failed:', error);
    return Response.json({
      error: 'Token storage test failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};