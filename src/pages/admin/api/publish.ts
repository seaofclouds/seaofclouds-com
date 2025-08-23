import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Publishing only available in production'
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { albumId, action, slug } = body;
    
    if (!albumId || !action) {
      return Response.json({
        error: 'Missing required fields: albumId, action'
      }, { status: 400 });
    }
    
    const storage = createStorageHelpers(env);
    
    if (action === 'publish') {
      // Mark album as public
      const flags = {
        public: true,
        publishedAt: new Date().toISOString(),
        slug: slug || albumId // Use provided slug or fallback to ID
      };
      
      await storage.kv.put(`flags:${albumId}`, JSON.stringify(flags));
      
      // Store slug mapping if custom slug provided
      if (slug && slug !== albumId) {
        await storage.kv.put(`slug:${slug}`, albumId);
      }
      
      // Trigger asset sync for this album
      try {
        const client = new LightroomApiClient(env, storage);
        const catalog = await client.getCatalog();
        
        // Get album assets
        const assetsResponse = await client.getAlbumAssets(albumId, { limit: 50 });
        
        if (assetsResponse.resources && assetsResponse.resources.length > 0) {
          // Store album detail with assets
          const albumDetail = {
            id: albumId,
            assets: assetsResponse.resources,
            lastSynced: new Date().toISOString(),
            assetCount: assetsResponse.resources.length,
            flags
          };
          
          await storage.r2.putJSON(`albums/${albumId}/detail.json`, albumDetail);
          
          return Response.json({
            success: true,
            message: `Album ${albumId} published with ${assetsResponse.resources.length} assets`,
            flags,
            assetCount: assetsResponse.resources.length
          });
        } else {
          return Response.json({
            success: true,
            message: `Album ${albumId} published (no assets found)`,
            flags,
            assetCount: 0
          });
        }
      } catch (syncError: any) {
        // Album is published but sync failed - that's ok
        console.error(`Failed to sync album ${albumId} on publish:`, syncError);
        return Response.json({
          success: true,
          message: `Album ${albumId} published (sync will retry later)`,
          flags,
          warning: syncError.message
        });
      }
    } 
    
    else if (action === 'unpublish') {
      // Mark album as private
      const flags = {
        public: false,
        unpublishedAt: new Date().toISOString()
      };
      
      await storage.kv.put(`flags:${albumId}`, JSON.stringify(flags));
      
      // Remove slug mapping if it exists
      const existingFlags = await storage.kv.get(`flags:${albumId}`, 'json');
      if (existingFlags?.slug && existingFlags.slug !== albumId) {
        await storage.kv.delete(`slug:${existingFlags.slug}`);
      }
      
      return Response.json({
        success: true,
        message: `Album ${albumId} unpublished`,
        flags
      });
    }
    
    else {
      return Response.json({
        error: 'Invalid action',
        supportedActions: ['publish', 'unpublish']
      }, { status: 400 });
    }
    
  } catch (error: any) {
    console.error('Publish/unpublish failed:', error);
    
    if (error.status === 401) {
      return Response.json({
        error: 'Authentication failed',
        message: 'OAuth tokens may be expired. Re-authenticate at /admin/auth/reauth'
      }, { status: 401 });
    }
    
    return Response.json({
      error: 'Request failed',
      message: error.message
    }, { status: 500 });
  }
};