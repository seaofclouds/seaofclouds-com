import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { LightroomApiClient } from '../../../lib/lightroom-api';

const RENDITION_SIZES = ['640', '1280', '2048'] as const;

async function syncAlbumAssets(
  client: LightroomApiClient, 
  storage: ReturnType<typeof createStorageHelpers>, 
  albumId: string,
  options: { 
    maxAssets?: number;
    skipExisting?: boolean;
    catalogId?: string;
  } = {}
) {
  console.log(`Starting efficient asset sync for album: ${albumId}`);
  
  const { maxAssets = 10, skipExisting = true } = options;
  
  // Use cached catalog ID if provided
  const catalogId = options.catalogId || (await client.getCatalog()).id;
  
  // Check if we already have cached assets and they're recent
  if (skipExisting) {
    const existingDetail = await storage.r2.getJSON(`albums/${albumId}/detail.json`);
    if (existingDetail && existingDetail.lastSynced) {
      const lastSync = new Date(existingDetail.lastSynced);
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceSync < 24) { // Skip if synced within 24 hours
        console.log(`Album ${albumId} assets synced ${hoursSinceSync.toFixed(1)}h ago, skipping`);
        return existingDetail;
      }
    }
  }
  
  // Fetch only metadata for all assets (lightweight operation)
  let cursor: string | undefined;
  let allAssets: any[] = [];
  let apiCallCount = 0;
  
  do {
    const assetsResponse = await client.getAlbumAssets(albumId, { 
      limit: 50, // Larger batch for metadata-only requests
      cursor 
    });
    apiCallCount++;
    
    if (assetsResponse.resources) {
      allAssets.push(...assetsResponse.resources);
    }
    
    cursor = assetsResponse.links?.next;
    
    // Safety: Don't make more than 5 API calls for a single album
    if (apiCallCount >= 5) {
      console.warn(`Hit API call limit for album ${albumId}, stopping pagination`);
      break;
    }
  } while (cursor);
  
  console.log(`Found ${allAssets.length} assets in album ${albumId} (${apiCallCount} API calls)`);
  
  // Store album detail with all assets metadata (no renditions yet)
  const albumDetail = {
    id: albumId,
    assets: allAssets,
    lastSynced: new Date().toISOString(),
    assetCount: allAssets.length,
    renditionsSynced: 0 // Track how many have renditions
  };
  
  await storage.r2.putJSON(`albums/${albumId}/detail.json`, albumDetail);
  
  // Only download renditions for a limited number of assets per sync
  const assetsToDownload = allAssets.slice(0, maxAssets);
  let renditionsSynced = 0;
  
  for (const asset of assetsToDownload) {
    try {
      // Store asset metadata (lightweight)
      await storage.r2.putJSON(`assets/${asset.id}/metadata.json`, asset);
      
      // Check if renditions already exist before downloading
      let hasAllRenditions = true;
      if (skipExisting) {
        for (const size of RENDITION_SIZES) {
          const exists = await storage.r2.exists(`assets/${asset.id}/renditions/${size}.jpg`);
          if (!exists) {
            hasAllRenditions = false;
            break;
          }
        }
      } else {
        hasAllRenditions = false;
      }
      
      if (hasAllRenditions) {
        console.log(`Asset ${asset.id} renditions already cached, skipping`);
        renditionsSynced++;
        continue;
      }
      
      // Download only missing renditions
      for (const size of RENDITION_SIZES) {
        try {
          // Skip if already exists
          if (skipExisting) {
            const exists = await storage.r2.exists(`assets/${asset.id}/renditions/${size}.jpg`);
            if (exists) {
              console.log(`Rendition ${asset.id}/${size} already exists, skipping`);
              continue;
            }
          }
          
          console.log(`Downloading ${size} rendition for asset ${asset.id}`);
          const renditionBuffer = await client.getAssetRendition(catalogId, asset.id, size);
          await storage.r2.putBinary(`assets/${asset.id}/renditions/${size}.jpg`, renditionBuffer);
          console.log(`Stored ${size} rendition for asset ${asset.id}`);
        } catch (rendError: any) {
          console.error(`Failed to download ${size} rendition for ${asset.id}:`, rendError);
          // Continue with other renditions - don't let one failure stop everything
        }
      }
      
      renditionsSynced++;
    } catch (assetError: any) {
      console.error(`Failed to sync asset ${asset.id}:`, assetError);
      // Continue with other assets
    }
  }
  
  // Update album detail with rendition sync status
  albumDetail.renditionsSynced = renditionsSynced;
  albumDetail.lastRenditionSync = new Date().toISOString();
  await storage.r2.putJSON(`albums/${albumId}/detail.json`, albumDetail);
  
  console.log(`Completed asset sync for album ${albumId}: ${renditionsSynced}/${assetsToDownload.length} assets with renditions`);
  
  return {
    assetsFound: allAssets.length,
    assetsWithRenditions: renditionsSynced,
    apiCalls: apiCallCount + (renditionsSynced * RENDITION_SIZES.length)
  };
}

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Sync only available in production',
      environment: env.ENVIRONMENT
    }, { status: 400 });
  }

  try {
    const storage = createStorageHelpers(env);
    const client = new LightroomApiClient(env, storage);
    
    // Get collection_set ID from query param or use default
    const collectionSetId = url.searchParams.get('collection_set') || 
      '07ba0fcb09714671bc71ab7ba5a091e7';
    
    const force = url.searchParams.get('force') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    console.log(`Starting sync for collection_set: ${collectionSetId}`);
    
    // Check rate limits before proceeding 
    const rateLimitStatus = await storage.getRateLimitStatus();
    if (!force && rateLimitStatus.hourly.remaining < 5) {
      return Response.json({
        error: 'Rate limit protection',
        message: 'Less than 5 requests remaining in hourly budget',
        rateLimits: rateLimitStatus
      }, { status: 429 });
    }
    
    // Get existing sync state
    const syncState = await storage.kv.get('sync:state', 'json') || {};
    const lastSyncTime = syncState.lastSync || null;
    const cursor = force ? null : syncState.cursor;
    
    console.log(`Last sync: ${lastSyncTime}, cursor: ${cursor}`);
    
    // Test upper limit: 250 albums per request to minimize API calls
    const batchSize = Math.min(limit, 250);
    
    // Skip sync if done very recently (unless forced) - but much more reasonable
    if (!force && lastSyncTime) {
      const lastSync = new Date(lastSyncTime);
      const minutesSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60);
      
      if (minutesSinceSync < 5) { // Don't sync more than every 5 minutes 
        return Response.json({
          message: 'Sync skipped - synced recently',
          lastSync: lastSyncTime,
          nextSyncAvailable: new Date(Date.now() + (300000 - (minutesSinceSync * 60000))).toISOString()
        });
      }
    }
    
    // Fetch albums from collection set with pagination
    const albumsResponse = await client.listAlbums(collectionSetId, {
      limit: batchSize,
      cursor
    });
    
    if (!albumsResponse.resources || albumsResponse.resources.length === 0) {
      return Response.json({
        message: 'No new albums to sync',
        syncState: {
          lastSync: lastSyncTime,
          cursor,
          totalSynced: syncState.totalSynced || 0
        }
      });
    }
    
    // Get catalog ID once and cache it for efficiency
    const catalog = await client.getCatalog();
    const catalogId = catalog.id;
    console.log(`Using catalog: ${catalogId}`);
    
    // Store album metadata in R2
    const albums = albumsResponse.resources;
    const albumIds = [];
    const errors = [];
    let totalApiCalls = 1; // Already made 1 call for getCatalog + 1 for listAlbums = 2
    
    for (const album of albums) {
      try {
        // Store individual album metadata
        await storage.r2.putJSON(`albums/${album.id}/metadata.json`, album);
        albumIds.push(album.id);
        console.log(`Stored album metadata: ${album.id} (${album.payload?.name || 'Unnamed'})`);
        
        // Assets are synced separately via /admin/api/sync-renditions
        // This keeps album metadata sync fast and efficient
      } catch (error: any) {
        console.error(`Failed to store album ${album.id}:`, error);
        errors.push({ albumId: album.id, error: error.message });
      }
    }
    
    // Update the main albums index
    try {
      let albumsIndex = await storage.r2.getJSON('albums/metadata.json') || { albums: [] };
      
      // Add new albums to index (deduplicate by ID)
      const existingIds = new Set(albumsIndex.albums.map((a: any) => a.id));
      const newAlbums = albums.filter(album => !existingIds.has(album.id));
      
      albumsIndex.albums.push(...newAlbums);
      albumsIndex.lastUpdated = new Date().toISOString();
      albumsIndex.syncedCount = albumsIndex.albums.length;
      
      await storage.r2.putJSON('albums/metadata.json', albumsIndex);
      console.log(`Updated albums index: ${albumsIndex.albums.length} total albums`);
    } catch (error: any) {
      console.error('Failed to update albums index:', error);
      errors.push({ type: 'index_update', error: error.message });
    }
    
    // Update sync state with new cursor and timestamp
    const newSyncState = {
      lastSync: new Date().toISOString(),
      cursor: albumsResponse.links?.next || null,
      totalSynced: (syncState.totalSynced || 0) + albumIds.length,
      lastBatch: albumIds.length,
      hasMore: !!albumsResponse.links?.next
    };
    
    await storage.kv.put('sync:state', JSON.stringify(newSyncState));
    
    return Response.json({
      success: true,
      message: `Synced ${albumIds.length} albums`,
      albumIds,
      syncState: newSyncState,
      rateLimits: await storage.getRateLimitStatus(),
      apiCallsUsed: totalApiCalls + 1, // +1 for final rate limit check
      efficiency: {
        albumsPerCall: (albumIds.length / totalApiCalls).toFixed(2),
        budgetRemaining: `${((100 - totalApiCalls) / 100 * 100).toFixed(1)}%`
      },
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error: any) {
    console.error('Sync failed:', error);
    
    // Handle specific API errors
    if (error.status === 429) {
      return Response.json({
        error: 'Rate limited',
        message: error.message,
        rateLimits: await storage.getRateLimitStatus()
      }, { status: 429 });
    }
    
    if (error.status === 401) {
      return Response.json({
        error: 'Authentication failed',
        message: 'OAuth tokens may be expired. Re-authenticate at /admin/auth/reauth'
      }, { status: 401 });
    }
    
    return Response.json({
      error: 'Sync failed',
      message: error.message,
      stack: env.ENVIRONMENT === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.json({
      error: 'Sync only available in production'
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action, albumId } = body;
    
    if (action === 'publish' && albumId) {
      const storage = createStorageHelpers(env);
      const client = new LightroomApiClient(env, storage);
      
      // Mark album as public
      await storage.kv.put(`flags:${albumId}`, JSON.stringify({
        public: true,
        publishedAt: new Date().toISOString()
      }));
      
      // Fetch full album details if not already cached
      try {
        const albumDetail = await client.getAlbum(albumId);
        await storage.r2.putJSON(`albums/${albumId}/detail.json`, albumDetail);
        
        return Response.json({
          success: true,
          message: `Album ${albumId} published and synced`
        });
      } catch (error: any) {
        // Album marked public but sync failed
        return Response.json({
          success: true,
          message: `Album ${albumId} published (sync will retry later)`,
          warning: error.message
        });
      }
    }
    
    return Response.json({
      error: 'Invalid action',
      supportedActions: ['publish']
    }, { status: 400 });
    
  } catch (error: any) {
    console.error('Sync POST failed:', error);
    return Response.json({
      error: 'Request failed',
      message: error.message
    }, { status: 500 });
  }
};