import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';
import { TestDataSource } from '../../../lib/datasource';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    // Always try test data first for now to debug the environment issue
    const dataSource = new TestDataSource();
    const albums = await dataSource.getAlbums();
    
    return Response.json({
      success: true,
      albums,
      totalCount: albums.length,
      environment: env.ENVIRONMENT,
      debug: 'Using test data temporarily for debugging'
    });
  } catch (error: any) {
    console.error('Failed to fetch albums:', error);
    
    return Response.json({
      success: false,
      error: 'Failed to fetch albums',
      message: error.message,
      albums: [],
      totalCount: 0
    }, { status: 500 });
  }
};