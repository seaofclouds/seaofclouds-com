import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Try to get the albums index
    const albumsIndex = await storage.r2.getJSON('albums/metadata.json');
    
    return Response.json({
      success: true,
      hasIndex: !!albumsIndex,
      albumsCount: albumsIndex?.albums?.length || 0,
      totalCount: albumsIndex?.totalCount || 0,
      lastUpdated: albumsIndex?.lastUpdated || null,
      firstAlbumName: albumsIndex?.albums?.[0]?.payload?.name || 'no albums',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return Response.json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5) // First 5 lines only
    }, { status: 500 });
  }
};