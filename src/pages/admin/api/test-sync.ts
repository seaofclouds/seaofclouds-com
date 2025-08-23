import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Test only available in production',
      environment: env.ENVIRONMENT
    }, { status: 400 });
  }

  try {
    const storage = createStorageHelpers(env);
    const client = new LightroomApiClient(env, storage);
    
    // Test 1: Get catalog (should work)
    const catalog = await client.getCatalog();
    
    // Test 2: Get rate limit status
    const rateLimits = await storage.getRateLimitStatus();
    
    // Test 3: List albums from collection set (first 10)
    const albumsResponse = await client.listAlbums(catalog.id, { limit: 10 });
    
    return Response.json({
      success: true,
      catalog: {
        id: catalog.id,
        name: catalog.payload?.name || 'Unknown'
      },
      rateLimits,
      albums: {
        count: albumsResponse.resources?.length || 0,
        hasMore: !!albumsResponse.links?.next,
        first3: albumsResponse.resources?.slice(0, 3).map(album => ({
          id: album.id,
          name: album.payload?.name || 'Unnamed',
          subtype: album.subtype
        })) || []
      }
    });
    
  } catch (error: any) {
    console.error('Test sync failed:', error);
    
    return Response.json({
      error: 'Test failed',
      message: error.message,
      status: error.status || 500,
      stack: error.stack
    }, { status: 500 });
  }
};