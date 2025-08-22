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

  async getOAuthTokens(): Promise<{ accessToken?: string; refreshToken?: string; expiresAt?: string }> {
    try {
      const tokens = await this.oauth.get('tokens', 'json') as any;
      return tokens || {};
    } catch (error) {
      console.error('Failed to get OAuth tokens:', error);
      return {};
    }
  }

  async setOAuthTokens(tokens: { accessToken: string; refreshToken: string; expiresAt: string }): Promise<void> {
    await this.oauth.put('tokens', JSON.stringify(tokens));
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
}

export function createStorageHelpers(env: Env) {
  return {
    r2: new R2Storage(env.ASSETS),
    kv: new KVStorage(env.ADOBE_LIGHTROOM_TOKENS, env.ADOBE_OAUTH_TOKENS, env.RATE_LIMITS)
  };
}