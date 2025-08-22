export interface Album {
  id: string;
  name: string;
  created: string;
  updated: string;
  cover?: Asset;
  assets?: Asset[];
  parent_id?: string;
  subtype?: 'collection' | 'collection_set';
}

export interface Asset {
  id: string;
  caption?: string;
  captureDate?: string;
  width: number;
  height: number;
  renditions?: Rendition[];
}

export interface Rendition {
  size: '640' | '1280' | '2048' | '2560' | 'fullsize';
  url: string;
  width: number;
  height: number;
}

export interface AlbumFlags {
  public: boolean;
  featured: boolean;
  slug?: string;
}

export interface SyncState {
  cursors: Record<string, string>;
  updatedAt: string;
  lastSuccess: string;
  errors: Array<{
    timestamp: string;
    message: string;
    albumId?: string;
  }>;
}

export interface SlugMapping {
  id: string;
  type: 'album';
}

export type DataSource = 'test' | 'lightroom' | 'flatfile';