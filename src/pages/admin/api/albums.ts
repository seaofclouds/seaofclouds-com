import type { APIRoute } from 'astro';
import { TestDataSource } from '../../../lib/datasource';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    // Use test data for now, regardless of environment
    const dataSource = new TestDataSource();
    const albums = await dataSource.getAlbums();
    
    return new Response(JSON.stringify({ 
      albums,
      debug: 'Updated with new test data',
      count: albums.length 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'ETag': `"${Date.now()}"`
      }
    });
  } catch (error) {
    console.error('Failed to fetch albums:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch albums',
      albums: [] 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};