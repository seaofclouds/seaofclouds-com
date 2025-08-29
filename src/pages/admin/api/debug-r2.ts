import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const storage = createStorageHelpers(env);
    
    // Check if albums metadata exists
    const albumsMetadata = await storage.r2.getJSON('albums/metadata.json');
    
    return Response.json({
      success: true,
      hasAlbumsMetadata: !!albumsMetadata,
      albumsCount: albumsMetadata?.albums?.length || 0,
      albumsMetadata: albumsMetadata || null,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return Response.json({
      error: 'Debug failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};