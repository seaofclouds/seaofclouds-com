import type { APIRoute } from 'astro';
import { createStorageHelpers } from '../../../lib/storage';

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime.env as Env;
  
  try {
    const { albumId, isPublic } = await request.json();
    
    if (!albumId) {
      return Response.json({
        success: false,
        error: 'Album ID is required'
      }, { status: 400 });
    }
    
    const storage = createStorageHelpers(env);
    
    // Get existing flags or create new ones
    let flags;
    try {
      flags = await storage.kv.get(`flags:${albumId}`, 'json') || {};
    } catch (error) {
      flags = {};
    }
    
    // Update public flag
    flags.public = isPublic;
    flags.updatedAt = new Date().toISOString();
    
    // Save updated flags
    await storage.kv.put(`flags:${albumId}`, JSON.stringify(flags));
    
    return Response.json({
      success: true,
      albumId,
      isPublic,
      message: `Album ${isPublic ? 'published' : 'unpublished'} successfully`
    });
    
  } catch (error: any) {
    console.error('Failed to toggle public status:', error);
    
    return Response.json({
      success: false,
      error: 'Failed to update album status',
      message: error.message
    }, { status: 500 });
  }
};