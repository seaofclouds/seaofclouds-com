import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    // Make a direct request to the working sync-fresh endpoint to get album data
    const request = new Request(`https://dev.seaofclouds.com/admin/api/sync-fresh?limit=50`);
    const response = await fetch(request);
    
    if (response.ok) {
      const data = await response.json();
      return Response.json({
        success: true,
        totalAlbums: data.albumIds?.length || 0,
        publicAlbums: 0, // TODO: implement public count
        lastSync: new Date().toISOString(),
        albumIds: data.albumIds || []
      });
    } else {
      throw new Error('Sync failed');
    }
  } catch (error: any) {
    return Response.json({
      error: 'Failed to get album stats',
      message: error.message
    }, { status: 500 });
  }
};