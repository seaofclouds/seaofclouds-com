import type { Album, Asset, Rendition, DataSource } from '../types';
import { createStorageHelpers } from './storage';

export interface DataSourceProvider {
  getAlbums(): Promise<Album[]>;
  getAlbum(id: string): Promise<Album | null>;
  getAssets(albumId: string): Promise<Asset[]>;
}

export class TestDataSource implements DataSourceProvider {
  async getAlbums(): Promise<Album[]> {
    return generateTestAlbums();
  }

  async getAlbum(id: string): Promise<Album | null> {
    const albums = await this.getAlbums();
    const album = albums.find(a => a.id === id);
    if (!album) return null;

    const assets = await this.getAssets(id);
    return { ...album, assets };
  }

  async getAssets(albumId: string): Promise<Asset[]> {
    return generateTestAssets(albumId);
  }
}

export class LightroomDataSource implements DataSourceProvider {
  private storage: ReturnType<typeof createStorageHelpers> | null = null;
  private apiClient: any = null; // Will import when needed to avoid circular deps
  
  constructor(private env: Env) {}

  private getStorage() {
    if (!this.storage) {
      this.storage = createStorageHelpers(this.env);
    }
    return this.storage;
  }

  private async getApiClient() {
    if (!this.apiClient) {
      const { LightroomApiClient } = await import('./lightroom-api');
      const { AdobeOAuth } = await import('./auth');
      
      const auth = new AdobeOAuth(this.env);
      this.apiClient = new LightroomApiClient(auth, this.env);
    }
    return this.apiClient;
  }

  async getAlbums(): Promise<Album[]> {
    // Try R2 cache first
    const cachedAlbums = await this.getStorage().r2.getAlbumsMetadata();
    if (cachedAlbums.length > 0) {
      return cachedAlbums;
    }

    // Fallback to API if cache is empty (will require authentication)
    try {
      const apiClient = await this.getApiClient();
      const response = await apiClient.getAlbums();
      
      // Cache the results
      await this.getStorage().r2.setAlbumsMetadata(response.resources);
      
      return response.resources;
    } catch (error) {
      console.error('Failed to fetch albums from Lightroom API:', error);
      return []; // Return empty array if API fails
    }
  }

  async getAlbum(id: string): Promise<Album | null> {
    // Try R2 cache first
    const cachedAlbum = await this.getStorage().r2.getAlbumDetail(id);
    if (cachedAlbum) {
      return cachedAlbum;
    }

    // Fallback to API
    try {
      const apiClient = await this.getApiClient();
      const album = await apiClient.getAlbumDetail(id);
      
      // Cache the result
      await this.getStorage().r2.setAlbumDetail(album);
      
      return album;
    } catch (error) {
      console.error(`Failed to fetch album ${id} from Lightroom API:`, error);
      return null;
    }
  }

  async getAssets(albumId: string): Promise<Asset[]> {
    const album = await this.getAlbum(albumId);
    return album?.assets || [];
  }
}

export class FlatFileDataSource implements DataSourceProvider {
  constructor(private env: Env) {}

  async getAlbums(): Promise<Album[]> {
    return [];
  }

  async getAlbum(id: string): Promise<Album | null> {
    return null;
  }

  async getAssets(albumId: string): Promise<Asset[]> {
    return [];
  }
}

export function createDataSource(type: DataSource, env: Env): DataSourceProvider {
  switch (type) {
    case 'test':
      return new TestDataSource();
    case 'lightroom':
      return new LightroomDataSource(env);
    case 'flatfile':
      return new FlatFileDataSource(env);
    default:
      return new TestDataSource();
  }
}

function generateTestAlbums(): Album[] {
  const currentYear = new Date().getFullYear();
  
  return [
    // Collection Sets (top-level containers)
    {
      id: 'cs-travel-2024',
      name: 'Travel Photography 2024',
      subtype: 'collection_set',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-08-15T12:00:00Z',
      cover: {
        id: 'asset-travel-cover',
        width: 2048,
        height: 1365,
        renditions: generateTestRenditions('asset-travel-cover')
      }
    },
    {
      id: 'cs-street-2024',
      name: 'Street Photography Collection',
      subtype: 'collection_set',
      created: '2024-02-01T00:00:00Z',
      updated: '2024-08-20T18:00:00Z',
      cover: {
        id: 'asset-street-cover',
        width: 1536,
        height: 2048,
        renditions: generateTestRenditions('asset-street-cover')
      }
    },
    
    // Collections (regular albums)
    {
      id: 'coll-tokyo-spring',
      name: 'Tokyo Spring Cherry Blossoms',
      subtype: 'collection',
      parent_id: 'cs-travel-2024',
      created: '2024-03-15T08:00:00Z',
      updated: '2024-03-25T16:00:00Z',
      cover: {
        id: 'asset-cherry-1',
        width: 1920,
        height: 1280,
        renditions: generateTestRenditions('asset-cherry-1')
      }
    },
    {
      id: 'coll-kyoto-temples',
      name: 'Kyoto Temple Architecture',
      subtype: 'collection',
      parent_id: 'cs-travel-2024',
      created: '2024-03-20T10:00:00Z',
      updated: '2024-03-28T14:00:00Z',
      cover: {
        id: 'asset-temple-1',
        width: 2048,
        height: 1365,
        renditions: generateTestRenditions('asset-temple-1')
      }
    },
    {
      id: 'coll-urban-sf',
      name: 'San Francisco Urban Scenes',
      subtype: 'collection',
      parent_id: 'cs-street-2024',
      created: '2024-05-10T09:00:00Z',
      updated: '2024-05-15T17:00:00Z',
      cover: {
        id: 'asset-sf-1',
        width: 1365,
        height: 2048,
        renditions: generateTestRenditions('asset-sf-1')
      }
    },
    {
      id: 'coll-nyc-nights',
      name: 'NYC After Dark',
      subtype: 'collection',
      parent_id: 'cs-street-2024',
      created: '2024-07-05T20:00:00Z',
      updated: '2024-07-12T22:00:00Z',
      cover: {
        id: 'asset-nyc-1',
        width: 2048,
        height: 1365,
        renditions: generateTestRenditions('asset-nyc-1')
      }
    },
    {
      id: 'coll-portraits-2024',
      name: 'Portrait Session Highlights',
      subtype: 'collection',
      created: '2024-04-01T00:00:00Z',
      updated: '2024-08-01T12:00:00Z',
      cover: {
        id: 'asset-portrait-1',
        width: 1365,
        height: 2048,
        renditions: generateTestRenditions('asset-portrait-1')
      }
    },
    
    // Smart Collections (auto-generated based on criteria)
    {
      id: 'smart-recent-uploads',
      name: 'Recent Uploads (Last 30 Days)',
      subtype: 'smart',
      created: '2024-08-01T00:00:00Z',
      updated: '2024-08-22T00:00:00Z',
      cover: {
        id: 'asset-recent-1',
        width: 1920,
        height: 1280,
        renditions: generateTestRenditions('asset-recent-1')
      }
    },
    {
      id: 'smart-5-star-rated',
      name: 'Five Star Rated Images',
      subtype: 'smart',
      created: '2024-01-15T00:00:00Z',
      updated: '2024-08-20T12:00:00Z',
      cover: {
        id: 'asset-5star-1',
        width: 2048,
        height: 1365,
        renditions: generateTestRenditions('asset-5star-1')
      }
    },
    {
      id: 'smart-sony-a7r5',
      name: 'Shot with Sony A7R V',
      subtype: 'smart',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-08-18T14:00:00Z',
      cover: {
        id: 'asset-sony-1',
        width: 2560,
        height: 1707,
        renditions: generateTestRenditions('asset-sony-1')
      }
    },
    
    // Topics (AI-generated clusters)
    {
      id: 'topic-architecture',
      name: 'Architecture & Buildings',
      subtype: 'topic',
      created: '2024-07-01T00:00:00Z',
      updated: '2024-08-15T10:00:00Z',
      cover: {
        id: 'asset-arch-1',
        width: 1365,
        height: 2048,
        renditions: generateTestRenditions('asset-arch-1')
      }
    },
    {
      id: 'topic-golden-hour',
      name: 'Golden Hour Photography',
      subtype: 'topic',
      created: '2024-06-20T00:00:00Z',
      updated: '2024-08-12T16:00:00Z',
      cover: {
        id: 'asset-golden-1',
        width: 2048,
        height: 1365,
        renditions: generateTestRenditions('asset-golden-1')
      }
    },
    {
      id: 'topic-people-portraits',
      name: 'People & Portraits',
      subtype: 'topic',
      created: '2024-05-15T00:00:00Z',
      updated: '2024-08-10T18:00:00Z',
      cover: {
        id: 'asset-people-1',
        width: 1920,
        height: 1280,
        renditions: generateTestRenditions('asset-people-1')
      }
    }
  ];
}

function generateTestAssets(albumId: string): Asset[] {
  const baseAssets = [
    { id: 'cherry-1', caption: 'Shibuya Cherry Blossoms at Dawn', width: 1920, height: 1280 },
    { id: 'cherry-2', caption: 'Ueno Park Pink Petals', width: 2048, height: 1365 },
    { id: 'cherry-3', caption: 'Philosopher\'s Path Sakura Tunnel', width: 1365, height: 2048 },
    { id: 'temple-1', caption: 'Kiyomizu-dera Wooden Architecture', width: 2048, height: 1365 },
    { id: 'temple-2', caption: 'Fushimi Inari Torii Gates', width: 1365, height: 2048 },
    { id: 'temple-3', caption: 'Golden Pavilion Reflection', width: 2560, height: 1707 },
    { id: 'sf-1', caption: 'Market Street Morning Rush', width: 1365, height: 2048 },
    { id: 'sf-2', caption: 'Golden Gate Bridge Fog', width: 2048, height: 1365 },
    { id: 'sf-3', caption: 'Chinatown Lanterns', width: 1920, height: 1280 },
    { id: 'nyc-1', caption: 'Times Square Neon Reflections', width: 2048, height: 1365 },
    { id: 'nyc-2', caption: 'Brooklyn Bridge at Twilight', width: 2560, height: 1707 },
    { id: 'nyc-3', caption: 'Central Park Autumn', width: 1920, height: 1280 },
    { id: 'portrait-1', caption: 'Natural Light Portrait', width: 1365, height: 2048 },
    { id: 'portrait-2', caption: 'Studio Headshot Session', width: 2048, height: 2048 },
    { id: 'portrait-3', caption: 'Environmental Portrait', width: 1920, height: 1280 },
    { id: 'macro-1', caption: 'Morning Dew on Spider Web', width: 2048, height: 2048 },
    { id: 'macro-2', caption: 'Butterfly Wing Detail', width: 2560, height: 1707 },
    { id: 'macro-3', caption: 'Water Drop Reflection', width: 1920, height: 1280 }
  ];

  const albumAssetMap: Record<string, string[]> = {
    'coll-tokyo-spring': ['cherry-1', 'cherry-2', 'cherry-3'],
    'coll-kyoto-temples': ['temple-1', 'temple-2', 'temple-3'],
    'coll-urban-sf': ['sf-1', 'sf-2', 'sf-3'],
    'coll-nyc-nights': ['nyc-1', 'nyc-2', 'nyc-3'],
    'coll-portraits-2024': ['portrait-1', 'portrait-2', 'portrait-3'],
    'coll-nature-macro': ['macro-1', 'macro-2', 'macro-3']
  };

  const assetIds = albumAssetMap[albumId] || ['cherry-1', 'temple-1'];
  
  return assetIds.map(id => {
    const baseAsset = baseAssets.find(a => a.id === id) || baseAssets[0];
    return {
      id: `asset-${id}`,
      caption: baseAsset.caption,
      captureDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      width: baseAsset.width,
      height: baseAsset.height,
      renditions: generateTestRenditions(`asset-${id}`)
    };
  });
}

function generateTestRenditions(assetId: string): Rendition[] {
  const seed = hashCode(assetId);
  const baseWidth = 1920 + (seed % 640);
  const aspectRatio = 1.5 + ((seed % 100) / 100);
  
  return [
    {
      size: '640',
      url: `https://picsum.photos/seed/${assetId}-640/640/${Math.round(640 / aspectRatio)}`,
      width: 640,
      height: Math.round(640 / aspectRatio)
    },
    {
      size: '1280',
      url: `https://picsum.photos/seed/${assetId}-1280/1280/${Math.round(1280 / aspectRatio)}`,
      width: 1280,
      height: Math.round(1280 / aspectRatio)
    },
    {
      size: '2048',
      url: `https://picsum.photos/seed/${assetId}-2048/2048/${Math.round(2048 / aspectRatio)}`,
      width: 2048,
      height: Math.round(2048 / aspectRatio)
    },
    {
      size: '2560',
      url: `https://picsum.photos/seed/${assetId}-2560/2560/${Math.round(2560 / aspectRatio)}`,
      width: 2560,
      height: Math.round(2560 / aspectRatio)
    }
  ];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}