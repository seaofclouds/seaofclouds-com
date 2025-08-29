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
    
    const limit = parseInt(url.searchParams.get('limit') || '250');
    const force = url.searchParams.get('force') === 'true';
    const cursor = url.searchParams.get('cursor') || undefined;
    const append = url.searchParams.get('append') === 'true';
    
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
    
    // List ALL albums (both collection_sets and collections) with pagination
    const albumsResponse = await clientInstance.listAlbums(catalog.id, { limit, cursor });
    
    if (!albumsResponse.resources) {
      return Response.json({
        message: 'No albums found',
        catalog: { id: catalog.id }
      });
    }
    
    // Store albums individually and collect for index
    const albumIds = [];
    const albumsForIndex = [];
    
    for (const album of albumsResponse.resources) {
      await storageInstance.r2.putJSON(`albums/${album.id}/metadata.json`, album);
      albumIds.push(album.id);
      albumsForIndex.push(album);
    }
    
    // Create or update the albums index
    let albumsIndex;
    if (append && cursor) {
      // Append to existing index
      try {
        const existingIndex = await storageInstance.r2.getJSON('albums/metadata.json') || { albums: [] };
        albumsIndex = {
          albums: [...(existingIndex.albums || []), ...albumsForIndex],
          lastUpdated: new Date().toISOString(),
          totalCount: (existingIndex.albums?.length || 0) + albumsForIndex.length,
          syncedAt: new Date().toISOString(),
          nextCursor: null
        };
      } catch (error) {
        // Fallback to new index if existing index is corrupted
        albumsIndex = {
          albums: albumsForIndex,
          lastUpdated: new Date().toISOString(),
          totalCount: albumsForIndex.length,
          syncedAt: new Date().toISOString(),
          nextCursor: null
        };
      }
    } else {
      // Create new index (full sync)
      albumsIndex = {
        albums: albumsForIndex,
        lastUpdated: new Date().toISOString(),
        totalCount: albumsForIndex.length,
        syncedAt: new Date().toISOString(),
        nextCursor: albumsResponse.links?.next?.href?.split('after=')[1]?.split('&')[0] || null
      };
    }
    
    await storageInstance.r2.putJSON('albums/metadata.json', albumsIndex);
    
    return Response.json({
      success: true,
      message: `Synced ${albumIds.length} albums${append ? ' (appended)' : ''}`,
      albumIds,
      totalSynced: albumsIndex.totalCount,
      hasMore: !!albumsIndex.nextCursor,
      nextCursor: albumsIndex.nextCursor,
      rateLimits: await storageInstance.getRateLimitStatus()
    });
    
  } catch (error: any) {
    console.error('Sync error details:', error);
    return Response.json({
      error: 'Sync failed',
      message: error.message,
      stack: error.stack?.substring(0, 200)
    }, { status: 500 });
  }
};