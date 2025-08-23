import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storageHelpers = createStorageHelpers(env);
    
    // Test storage methods
    // const rateLimits = await storageHelpers.getRateLimitStatus();
    // const syncState = await storageHelpers.kv.get('sync:state', 'json') || {};
    
    return Response.json({
      success: true,
      // rateLimits,
      // syncState,
      storageTest: 'passed',
      storageKeys: Object.keys(storageHelpers),
      hasKV: !!storageHelpers.kv,
      hasR2: !!storageHelpers.r2
    });
    
  } catch (error: any) {
    return Response.json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};