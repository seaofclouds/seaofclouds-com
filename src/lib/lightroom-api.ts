import type { Album, Asset } from '../types';
import { AdobeOAuth } from './auth';
import { createStorageHelpers } from './storage';

export interface LightroomApiResponse<T> {
  base: string;
  resources: T[];
  links?: {
    next?: { href: string };
    prev?: { href: string };
  };
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

export class LightroomApiClient {
  private static readonly BASE_URL = 'https://lr.adobe.io/v2';
  private static readonly COLLECTION_SET_ID = '07ba0fcb09714671bc71ab7ba5a091e7'; // From CLAUDE.md
  
  // Rate limiting: Conservative approach for Adobe APIs
  private static readonly DEFAULT_RATE_LIMIT = 100; // requests per hour
  private static readonly BURST_LIMIT = 10; // requests per minute
  private static readonly RETRY_DELAYS = [1000, 2000, 5000, 10000]; // Exponential backoff

  constructor(
    private auth: AdobeOAuth,
    private env: Env,
    private storage = createStorageHelpers(env)
  ) {}

  /**
   * Make authenticated request to Lightroom API with rate limiting
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.checkRateLimit();

    const accessToken = await this.auth.getValidAccessToken();
    
    const url = endpoint.startsWith('http') ? endpoint : `${LightroomApiClient.BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'X-API-Key': this.env.ADOBE_CLIENT_ID!,
        ...options.headers
      }
    });

    // Update rate limit info from response headers
    await this.updateRateLimitFromResponse(response);

    if (response.status === 429) {
      // Rate limited - throw with retry info
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limited. Retry after ${retryAfter || '60'} seconds`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Lightroom API error (${response.status}):`, errorText);
      throw new Error(`Lightroom API error: ${response.status} ${errorText}`);
    }

    return await response.json() as T;
  }

  /**
   * Check and enforce rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const hourlyKey = `lr_api_hourly:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const minuteKey = `lr_api_minute:${Math.floor(Date.now() / (60 * 1000))}`;

    const [hourlyLimit, minuteLimit] = await Promise.all([
      this.storage.kv.getRateLimit(hourlyKey),
      this.storage.kv.getRateLimit(minuteKey)
    ]);

    if (hourlyLimit.count >= LightroomApiClient.DEFAULT_RATE_LIMIT) {
      throw new Error('Hourly rate limit exceeded');
    }

    if (minuteLimit.count >= LightroomApiClient.BURST_LIMIT) {
      throw new Error('Burst rate limit exceeded');
    }

    // Increment counters
    await Promise.all([
      this.storage.kv.setRateLimit(hourlyKey, hourlyLimit.count + 1, hourlyLimit.resetAt),
      this.storage.kv.setRateLimit(minuteKey, minuteLimit.count + 1, minuteLimit.resetAt)
    ]);
  }

  /**
   * Update rate limit info from API response headers
   */
  private async updateRateLimitFromResponse(response: Response): Promise<void> {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    const limit = response.headers.get('X-RateLimit-Limit');

    if (remaining && reset && limit) {
      const resetTime = parseInt(reset) * 1000; // Convert to milliseconds
      const key = `lr_api_actual:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
      
      await this.storage.kv.setRateLimit(
        key,
        parseInt(limit) - parseInt(remaining),
        resetTime
      );
    }
  }

  /**
   * Retry request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === maxRetries) throw error;

        const isRetryableError = error instanceof Error && (
          error.message.includes('Rate limited') ||
          error.message.includes('500') ||
          error.message.includes('502') ||
          error.message.includes('503') ||
          error.message.includes('504')
        );

        if (!isRetryableError) throw error;

        const delay = LightroomApiClient.RETRY_DELAYS[attempt] || 10000;
        console.log(`Request failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Get albums from the specified collection set
   */
  async getAlbums(cursor?: string): Promise<LightroomApiResponse<Album>> {
    return this.retryRequest(async () => {
      let endpoint = `/albums?subtype=collection&limit=50`;
      
      // Add collection set filter if specified
      if (LightroomApiClient.COLLECTION_SET_ID) {
        endpoint += `&parent=${LightroomApiClient.COLLECTION_SET_ID}`;
      }
      
      if (cursor) {
        endpoint += `&after=${cursor}`;
      }

      const response = await this.makeRequest<any>(endpoint);
      
      // Transform Adobe API response to our Album format
      const albums: Album[] = response.resources.map((item: any) => ({
        id: item.id,
        name: item.payload?.name || 'Untitled Album',
        created: item.created,
        updated: item.updated,
        subtype: item.subtype as any,
        parent_id: item.payload?.parent?.id,
        cover: item.payload?.cover ? {
          id: item.payload.cover.id,
          width: 0, // Will be populated when we fetch asset details
          height: 0,
          renditions: []
        } : undefined
      }));

      return {
        base: response.base,
        resources: albums,
        links: response.links
      };
    });
  }

  /**
   * Get album details including assets
   */
  async getAlbumDetail(albumId: string): Promise<Album> {
    return this.retryRequest(async () => {
      const [albumResponse, assetsResponse] = await Promise.all([
        this.makeRequest<any>(`/albums/${albumId}`),
        this.makeRequest<any>(`/albums/${albumId}/assets?embed=asset&limit=100`)
      ]);

      const album = albumResponse;
      const assets: Asset[] = assetsResponse.resources.map((item: any) => ({
        id: item.asset.id,
        caption: item.asset.payload?.captureDate || item.asset.payload?.userCreated,
        captureDate: item.asset.payload?.captureDate,
        width: item.asset.payload?.develop?.croppedWidth || 2048,
        height: item.asset.payload?.develop?.croppedHeight || 1365,
        renditions: this.generateRenditionUrls(item.asset.id)
      }));

      return {
        id: album.id,
        name: album.payload?.name || 'Untitled Album',
        created: album.created,
        updated: album.updated,
        subtype: album.subtype,
        parent_id: album.payload?.parent?.id,
        assets,
        cover: assets[0] // Use first asset as cover
      };
    });
  }

  /**
   * Get asset details
   */
  async getAsset(assetId: string): Promise<Asset> {
    return this.retryRequest(async () => {
      const response = await this.makeRequest<any>(`/assets/${assetId}`);
      
      return {
        id: response.id,
        caption: response.payload?.captureDate || response.payload?.userCreated,
        captureDate: response.payload?.captureDate,
        width: response.payload?.develop?.croppedWidth || 2048,
        height: response.payload?.develop?.croppedHeight || 1365,
        renditions: this.generateRenditionUrls(response.id)
      };
    });
  }

  /**
   * Generate rendition URLs for an asset
   */
  private generateRenditionUrls(assetId: string) {
    const sizes = ['640', '1280', '2048', '2560'];
    return sizes.map(size => ({
      size: size as any,
      url: `${LightroomApiClient.BASE_URL}/assets/${assetId}/renditions/${size}`,
      width: parseInt(size),
      height: Math.round(parseInt(size) * 0.67) // Approximate 3:2 ratio
    }));
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(): Promise<RateLimitInfo> {
    const hourlyKey = `lr_api_hourly:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const hourlyLimit = await this.storage.kv.getRateLimit(hourlyKey);

    return {
      remaining: LightroomApiClient.DEFAULT_RATE_LIMIT - hourlyLimit.count,
      reset: hourlyLimit.resetAt,
      limit: LightroomApiClient.DEFAULT_RATE_LIMIT
    };
  }

  /**
   * Sync albums from Lightroom and cache in R2
   */
  async syncAlbums(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    let cursor: string | undefined;

    try {
      do {
        const response = await this.getAlbums(cursor);
        
        // Cache albums metadata
        await this.storage.r2.setAlbumsMetadata(response.resources);
        synced += response.resources.length;

        // Get next page cursor
        cursor = response.links?.next?.href?.split('after=')[1]?.split('&')[0];
        
        // Small delay between pages to be respectful
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } while (cursor);

      // Update sync state
      const syncState = await this.storage.kv.getSyncState();
      syncState.lastSuccess = new Date().toISOString();
      syncState.updatedAt = new Date().toISOString();
      await this.storage.kv.setSyncState(syncState);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      
      // Log error to sync state
      const syncState = await this.storage.kv.getSyncState();
      syncState.errors.push({
        timestamp: new Date().toISOString(),
        message: errorMessage
      });
      await this.storage.kv.setSyncState(syncState);
    }

    return { synced, errors };
  }
}