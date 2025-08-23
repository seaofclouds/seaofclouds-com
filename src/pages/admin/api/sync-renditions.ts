import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

const RENDITION_SIZES = ['640', '1280', '2048'] as const;

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Rendition sync only available in production'
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { albumId, maxAssets = 5 } = body;
    
    if (!albumId) {
      return Response.json({
        error: 'Missing albumId'
      }, { status: 400 });
    }
    
    const storage = createStorageHelpers(env);
    const client = new LightroomApiClient(env, storage);
    
    // Check if album is public
    const albumFlags = await storage.kv.get(`flags:${albumId}`, 'json');
    if (!albumFlags?.public) {
      return Response.json({
        error: 'Album is not public',
        albumId
      }, { status: 400 });
    }
    
    // Check API budget
    const rateLimitStatus = await storage.getRateLimitStatus();
    if (rateLimitStatus.hourly.remaining < 15) {
      return Response.json({
        error: 'Insufficient API budget for rendition sync',
        rateLimits: rateLimitStatus
      }, { status: 429 });
    }
    
    // Get album detail to find assets
    const albumDetail = await storage.r2.getJSON(`albums/${albumId}/detail.json`);
    if (!albumDetail || !albumDetail.assets) {
      return Response.json({
        error: 'Album not found or no assets cached',
        albumId
      }, { status: 404 });
    }
    
    const catalog = await client.getCatalog();
    const catalogId = catalog.id;
    
    // Find assets that need renditions
    const assetsNeedingRenditions = [];
    
    for (const asset of albumDetail.assets.slice(0, maxAssets)) {
      let needsRenditions = false;
      
      for (const size of RENDITION_SIZES) {
        const exists = await storage.r2.exists(`assets/${asset.id}/renditions/${size}.jpg`);
        if (!exists) {
          needsRenditions = true;
          break;
        }
      }
      
      if (needsRenditions) {
        assetsNeedingRenditions.push(asset);
      }
    }
    
    console.log(`Found ${assetsNeedingRenditions.length} assets needing renditions in album ${albumId}`);
    
    let renditionsDownloaded = 0;
    let apiCallsUsed = 1; // getCatalog
    const errors = [];
    
    for (const asset of assetsNeedingRenditions) {
      try {
        // Store asset metadata first
        await storage.r2.putJSON(`assets/${asset.id}/metadata.json`, asset);
        
        // Download missing renditions only
        for (const size of RENDITION_SIZES) {
          const renditionPath = `assets/${asset.id}/renditions/${size}.jpg`;
          const exists = await storage.r2.exists(renditionPath);
          
          if (exists) {
            console.log(`Rendition ${asset.id}/${size} already exists, skipping`);
            continue;
          }
          
          try {
            console.log(`Downloading ${size} rendition for asset ${asset.id}`);
            const renditionBuffer = await client.getAssetRendition(catalogId, asset.id, size);
            await storage.r2.putBinary(renditionPath, renditionBuffer);
            renditionsDownloaded++;
            apiCallsUsed++;
            console.log(`Stored ${size} rendition for asset ${asset.id}`);
            
            // Add small delay between downloads to be respectful
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (rendError: any) {
            console.error(`Failed to download ${size} rendition for ${asset.id}:`, rendError);
            errors.push({ 
              assetId: asset.id, 
              size, 
              error: rendError.message,
              status: rendError.status 
            });
          }
        }
      } catch (assetError: any) {
        console.error(`Failed to process asset ${asset.id}:`, assetError);
        errors.push({ assetId: asset.id, error: assetError.message });
      }
    }
    
    // Update album detail with sync status
    albumDetail.lastRenditionSync = new Date().toISOString();
    albumDetail.renditionsSynced = (albumDetail.renditionsSynced || 0) + Math.floor(renditionsDownloaded / RENDITION_SIZES.length);
    await storage.r2.putJSON(`albums/${albumId}/detail.json`, albumDetail);
    
    return Response.json({
      success: true,
      message: `Downloaded ${renditionsDownloaded} renditions for ${assetsNeedingRenditions.length} assets`,
      albumId,
      stats: {
        assetsProcessed: assetsNeedingRenditions.length,
        renditionsDownloaded,
        apiCallsUsed,
        errorsCount: errors.length
      },
      rateLimits: await storage.getRateLimitStatus(),
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error: any) {
    console.error('Rendition sync failed:', error);
    
    if (error.status === 401) {
      return Response.json({
        error: 'Authentication failed',
        message: 'OAuth tokens may be expired. Re-authenticate at /admin/auth/reauth'
      }, { status: 401 });
    }
    
    return Response.json({
      error: 'Rendition sync failed',
      message: error.message
    }, { status: 500 });
  }
};