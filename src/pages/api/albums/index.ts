import type { APIRoute } from 'astro';
import type { Album } from '../../../types';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  // For now, return test data
  // TODO: Implement R2 fetch from /albums/metadata.json
  const testAlbums: Album[] = [
    {
      id: 'test-album-1',
      name: 'Test Album 2024',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      subtype: 'collection'
    }
  ];

  return new Response(JSON.stringify({ albums: testAlbums }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};