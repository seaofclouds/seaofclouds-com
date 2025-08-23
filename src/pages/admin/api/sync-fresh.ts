import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Sync only available in production'
    }, { status: 400 });
  }

  try {
    const storageInstance = createStorageHelpers(env);
    const clientInstance = new LightroomApiClient(env, storageInstance);
    
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const force = url.searchParams.get('force') === 'true';
    
    // Test basic functionality first
    const rateLimits = await storageInstance.getRateLimitStatus();
    
    if (!force && rateLimits.hourly.remaining < 5) {
      return Response.json({
        error: 'Rate limit protection',
        rateLimits
      }, { status: 429 });
    }
    
    // Get catalog
    const catalog = await clientInstance.getCatalog();
    
    // List albums
    const albumsResponse = await clientInstance.listAlbums(catalog.id, { limit });
    
    if (!albumsResponse.resources) {
      return Response.json({
        message: 'No albums found',
        catalog: { id: catalog.id }
      });
    }
    
    // Store albums
    const albumIds = [];
    for (const album of albumsResponse.resources) {
      await storageInstance.r2.putJSON(`albums/${album.id}/metadata.json`, album);
      albumIds.push(album.id);
    }
    
    return Response.json({
      success: true,
      message: `Synced ${albumIds.length} albums`,
      albumIds,
      rateLimits: await storageInstance.getRateLimitStatus()
    });
    
  } catch (error: any) {
    return Response.json({
      error: 'Sync failed',
      message: error.message
    }, { status: 500 });
  }
};