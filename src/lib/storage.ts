import type { Album, Asset, AlbumFlags, SyncState, SlugMapping, DataSource } from '../types';

export class R2Storage {
  constructor(private bucket: R2Bucket) {}

  private ensureBucket() {
    if (!this.bucket) {
      throw new Error('R2 bucket not available');
    }
    return this.bucket;
  }

  async getAlbumsMetadata(): Promise<Album[]> {
    try {
      const object = await this.bucket.get('albums/metadata.json');
      if (!object) return [];
      
      const data = await object.json() as { albums: Album[] };
      return data.albums;
    } catch (error) {
      console.error('Failed to fetch albums metadata:', error);
      return [];
    }
  }

  async setAlbumsMetadata(albums: Album[]): Promise<void> {
    await this.bucket.put('albums/metadata.json', JSON.stringify({ albums }, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600'
      }
    });
  }

  async getAlbumDetail(albumId: string): Promise<Album | null> {
    try {
      const object = await this.bucket.get(`albums/${albumId}/metadata.json`);
      if (!object) return null;
      
      return await object.json() as Album;
    } catch (error) {
      console.error(`Failed to fetch album ${albumId}:`, error);
      return null;
    }
  }

  async setAlbumDetail(album: Album): Promise<void> {
    await this.bucket.put(`albums/${album.id}/metadata.json`, JSON.stringify(album, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600'
      }
    });
  }

  async getAssetMetadata(assetId: string): Promise<Asset | null> {
    try {
      const object = await this.bucket.get(`assets/${assetId}/metadata.json`);
      if (!object) return null;
      
      return await object.json() as Asset;
    } catch (error) {
      console.error(`Failed to fetch asset ${assetId}:`, error);
      return null;
    }
  }

  async setAssetMetadata(asset: Asset): Promise<void> {
    await this.bucket.put(`assets/${asset.id}/metadata.json`, JSON.stringify(asset, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=86400'
      }
    });
  }

  async getRendition(assetId: string, size: string): Promise<ReadableStream | null> {
    try {
      const object = await this.bucket.get(`assets/${assetId}/renditions/${size}.jpg`);
      return object?.body || null;
    } catch (error) {
      console.error(`Failed to fetch rendition ${assetId}/${size}:`, error);
      return null;
    }
  }

  async putBinary(path: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    const contentType = path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' :
                       path.endsWith('.png') ? 'image/png' :
                       'application/octet-stream';
    
    await this.bucket.put(path, data, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable' // 1 year cache for images
      }
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      const object = await this.bucket.head(path);
      return !!object;
    } catch (error) {
      return false;
    }
  }

  async putJSON(path: string, data: any): Promise<void> {
    await this.bucket.put(path, JSON.stringify(data, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600'
      }
    });
  }

  async getJSON(path: string): Promise<any> {
    try {
      const object = await this.bucket.get(path);
      if (!object) return null;
      
      const text = await object.text();
      return JSON.parse(text);
    } catch (error) {
      console.error(`Failed to get JSON from ${path}:`, error);
      return null;
    }
  }
}

export class KVStorage {
  constructor(
    private lightroom: KVNamespace,
    private oauth: KVNamespace,
    private rateLimits: KVNamespace
  ) {}

  async getAlbumFlags(albumId: string): Promise<AlbumFlags> {
    try {
      const flags = await this.lightroom.get(`flags:${albumId}`, 'json') as AlbumFlags;
      return flags || { public: false, featured: false };
    } catch (error) {
      console.error(`Failed to get flags for album ${albumId}:`, error);
      return { public: false, featured: false };
    }
  }

  async setAlbumFlags(albumId: string, flags: AlbumFlags): Promise<void> {
    await this.lightroom.put(`flags:${albumId}`, JSON.stringify(flags));
  }

  async getSlugMapping(slug: string): Promise<SlugMapping | null> {
    try {
      return await this.lightroom.get(`slug:${slug}`, 'json') as SlugMapping;
    } catch (error) {
      console.error(`Failed to get slug mapping for ${slug}:`, error);
      return null;
    }
  }

  async setSlugMapping(slug: string, mapping: SlugMapping): Promise<void> {
    await this.lightroom.put(`slug:${slug}`, JSON.stringify(mapping));
  }

  async deleteSlugMapping(slug: string): Promise<void> {
    await this.lightroom.delete(`slug:${slug}`);
  }

  async getSyncState(): Promise<SyncState> {
    try {
      const state = await this.lightroom.get('sync:state', 'json') as SyncState;
      return state || {
        cursors: {},
        updatedAt: new Date().toISOString(),
        lastSuccess: new Date().toISOString(),
        errors: []
      };
    } catch (error) {
      console.error('Failed to get sync state:', error);
      return {
        cursors: {},
        updatedAt: new Date().toISOString(),
        lastSuccess: new Date().toISOString(),
        errors: []
      };
    }
  }

  async setSyncState(state: SyncState): Promise<void> {
    await this.lightroom.put('sync:state', JSON.stringify(state));
  }


  async getRateLimit(key: string): Promise<{ count: number; resetAt: number }> {
    try {
      const limit = await this.rateLimits.get(key, 'json') as any;
      return limit || { count: 0, resetAt: Date.now() + 3600000 };
    } catch (error) {
      console.error(`Failed to get rate limit for ${key}:`, error);
      return { count: 0, resetAt: Date.now() + 3600000 };
    }
  }

  async setRateLimit(key: string, count: number, resetAt: number): Promise<void> {
    await this.rateLimits.put(key, JSON.stringify({ count, resetAt }));
  }

  async getRateLimitStatus(): Promise<any> {
    const hourlyKey = `lr_api_hourly:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const minuteKey = `lr_api_minute:${Math.floor(Date.now() / (60 * 1000))}`;
    
    const [hourlyLimit, minuteLimit] = await Promise.all([
      this.getRateLimit(hourlyKey),
      this.getRateLimit(minuteKey)
    ]);
    
    return {
      hourly: {
        used: hourlyLimit.count,
        remaining: 100 - hourlyLimit.count,
        resetAt: new Date(hourlyLimit.resetAt).toISOString()
      },
      burst: {
        used: minuteLimit.count,
        remaining: 10 - minuteLimit.count,
        resetAt: new Date(minuteLimit.resetAt).toISOString()
      }
    };
  }

  // OAuth Token Management
  async getOAuthTokens(): Promise<any> {
    try {
      console.log('Storage: Attempting to get oauth_tokens from KV...');
      const tokens = await this.oauth.get('oauth_tokens', 'json');
      console.log('Storage: getOAuthTokens raw result:', tokens ? 'found' : 'null');
      if (tokens) {
        console.log('Storage: token keys found:', Object.keys(tokens));
      }
      return tokens || {};
    } catch (error) {
      console.error('Failed to get OAuth tokens:', error);
      return {};
    }
  }

  async setOAuthTokens(tokens: any): Promise<void> {
    try {
      console.log('Storage: About to save tokens to KV:', {
        hasAccessToken: !!tokens.accessToken,
        tokenKeys: Object.keys(tokens),
        kvNamespace: this.oauth.constructor.name || 'unknown'
      });
      
      const serialized = JSON.stringify(tokens);
      console.log('Storage: Serialized token data length:', serialized.length);
      
      // Log the actual KV namespace binding info if available
      console.log('Storage: KV namespace details:', {
        hasOauth: !!this.oauth,
        oauthType: typeof this.oauth,
        oauthKeys: this.oauth ? Object.getOwnPropertyNames(this.oauth).slice(0, 3) : []
      });
      
      await this.oauth.put('oauth_tokens', serialized);
      console.log('Storage: OAuth tokens saved to KV successfully');
      
      // Add a small delay to ensure KV write completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the save worked
      const verify = await this.oauth.get('oauth_tokens');
      console.log('Storage: Verification read result:', !!verify);
      
      // Try to parse and validate the retrieved data
      if (verify) {
        const parsed = JSON.parse(verify);
        console.log('Storage: Verified token has accessToken:', !!parsed.accessToken);
      }
      
    } catch (error) {
      console.error('Storage: Failed to save OAuth tokens:', error);
      console.error('Storage: Error details:', error.message, error.stack);
      throw error;
    }
  }

  async clearOAuthTokens(): Promise<void> {
    try {
      await this.oauth.delete('oauth_tokens');
      console.log('OAuth tokens cleared successfully');
    } catch (error) {
      console.error('Failed to clear OAuth tokens:', error);
      throw error;
    }
  }
}

export function createStorageHelpers(env: Env) {
  const r2 = new R2Storage(env.ASSETS);
  const kv = new KVStorage(env.ADOBE_LIGHTROOM_TOKENS, env.ADOBE_OAUTH_TOKENS, env.RATE_LIMITS);
  
  return {
    r2,
    kv,
    // Expose KV methods at top level for convenience
    getRateLimitStatus: () => kv.getRateLimitStatus(),
    getOAuthTokens: () => kv.getOAuthTokens(),
    setOAuthTokens: (tokens: any) => kv.setOAuthTokens(tokens),
    clearOAuthTokens: () => kv.clearOAuthTokens()
  };
}