import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Try to get tokens using our storage method
    const tokens = await storage.kv.getOAuthTokens();
    console.log('Storage getOAuthTokens result:', tokens);
    
    // Try to get raw KV data directly
    const rawTokens = await env.ADOBE_OAUTH_TOKENS.get('oauth_tokens');
    console.log('Raw KV get result:', rawTokens ? 'found' : 'not found');
    
    // Try to get raw KV data with json parsing
    const jsonTokens = await env.ADOBE_OAUTH_TOKENS.get('oauth_tokens', 'json');
    console.log('Raw KV JSON result:', jsonTokens ? 'found' : 'not found');
    
    // List all keys in the namespace
    const keyList = await env.ADOBE_OAUTH_TOKENS.list();
    console.log('All keys in namespace:', keyList.keys.map(k => k.name));
    
    return Response.json({
      storageMethod: tokens || 'null',
      rawKV: rawTokens || 'null', 
      jsonKV: jsonTokens || 'null',
      allKeys: keyList.keys.map(k => k.name),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Debug tokens failed:', error);
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};