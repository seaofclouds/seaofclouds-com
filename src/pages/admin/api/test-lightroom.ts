import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  // Allow bypassing auth with secret query param for testing
  const testKey = url.searchParams.get('test_key');
  const isTestMode = testKey === env.API_SECRET_KEY;
  
  // Dev environment doesn't have real API access (unless test mode)
  if (env.ENVIRONMENT !== 'production' && !isTestMode) {
    return Response.json({
      error: 'Lightroom API test only available in production',
      environment: env.ENVIRONMENT,
      hint: 'Add ?test_key=<API_SECRET_KEY> to bypass in development'
    }, { status: 400 });
  }

  try {
    const storage = createStorageHelpers(env);
    const client = new LightroomApiClient(env, storage);
    
    // Debug: Check if we have OAuth tokens
    const tokens = await storage.kv.getOAuthTokens();
    console.log('OAuth tokens available:', !!tokens?.accessToken);
    console.log('Token expires at:', tokens?.expiresAt ? new Date(tokens.expiresAt) : 'unknown');
    
    if (!tokens?.accessToken) {
      return Response.json({
        error: 'No OAuth tokens available',
        hint: 'Visit /admin/auth/login to authenticate with Adobe',
        hasTokens: false
      }, { status: 401 });
    }
    
    // Test 1: Try account endpoint first (simpler than catalog)
    console.log('Testing Lightroom API: Getting account...');
    let account, catalog;
    let debugInfo = {};
    
    try {
      // Get debug info about the request that will be made
      const testToken = await storage.kv.getOAuthTokens();
      debugInfo = {
        hasToken: !!testToken?.accessToken,
        tokenLength: testToken?.accessToken?.length || 0,
        expires: testToken?.expiresAt ? new Date(testToken.expiresAt).toISOString() : null,
        isExpired: testToken?.expiresAt ? Date.now() > testToken.expiresAt : null,
        baseUrl: 'https://lr.adobe.io/v2'
      };
      
      // Test account endpoint first
      account = await client.getAccount();
      
      // If account works, try catalog
      catalog = await client.getCatalog();
    } catch (error) {
      // If any request fails, return the debug info
      return Response.json({
        error: 'API request failed',
        debugInfo,
        testedEndpoints: {
          account: account ? 'success' : 'failed', 
          catalog: catalog ? 'success' : 'failed'
        },
        message: error.message,
        status: error.status || 500
      }, { status: error.status || 500 });
    }
    
    // Test 2: List albums with pagination (get first page only for test)
    console.log('Testing Lightroom API: Listing albums...');
    const albumsResponse = await client.listAlbums(catalog.id, { limit: 5 });
    
    // Test 3: If we have albums, get details of the first one
    let albumDetail = null;
    if (albumsResponse.resources && albumsResponse.resources.length > 0) {
      const firstAlbum = albumsResponse.resources[0];
      console.log(`Testing Lightroom API: Getting album detail for ${firstAlbum.id}...`);
      albumDetail = await client.getAlbum(firstAlbum.id);
    }
    
    // Test 4: Check rate limit status
    const rateLimitStatus = await storage.kv.getRateLimitStatus();
    
    return Response.json({
      success: true,
      tests: {
        catalog: {
          id: catalog.id,
          created: catalog.created,
          updated: catalog.updated
        },
        albums: {
          count: albumsResponse.resources?.length || 0,
          hasMore: !!albumsResponse.links?.next,
          firstAlbum: albumsResponse.resources?.[0] || null
        },
        albumDetail: albumDetail ? {
          id: albumDetail.id,
          name: albumDetail.payload?.name,
          assetCount: albumDetail.payload?.asset_count,
          coverAsset: albumDetail.payload?.cover?.id
        } : null,
        rateLimit: rateLimitStatus
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (outerError: any) {
    console.error('Lightroom API test failed:', outerError);
    
    // Get debug info for the outer error too
    try {
      const storage = createStorageHelpers(env);
      const testToken = await storage.kv.getOAuthTokens();
      const debugInfo = {
        hasToken: !!testToken?.accessToken,
        tokenLength: testToken?.accessToken?.length || 0,
        expires: testToken?.expiresAt ? new Date(testToken.expiresAt).toISOString() : null,
        isExpired: testToken?.expiresAt ? Date.now() > testToken.expiresAt : null,
        baseUrl: 'https://lr.adobe.io/v2'
      };
      
      // Check if it's a rate limit error
      if (outerError.status === 429) {
        return Response.json({
          error: 'Rate limited by Adobe API',
          retryAfter: outerError.retryAfter || 'unknown',
          message: outerError.message,
          debugInfo
        }, { status: 429 });
      }
      
      // Check if it's an auth error
      if (outerError.status === 401) {
        return Response.json({
          error: 'Authentication failed - may need to re-authenticate',
          message: outerError.message,
          hint: 'Visit /admin/auth/reauth to refresh OAuth tokens',
          debugInfo
        }, { status: 401 });
      }
      
      return Response.json({
        error: 'Test failed',
        message: outerError.message || 'Unknown error',
        status: outerError.status || 500,
        details: outerError.stack,
        debugInfo
      }, { status: 500 });
    } catch (debugError) {
      return Response.json({
        error: 'Test failed and debug failed',
        message: outerError.message || 'Unknown error',
        status: outerError.status || 500,
        details: outerError.stack,
        debugError: debugError.message
      }, { status: 500 });
    }
  }
};