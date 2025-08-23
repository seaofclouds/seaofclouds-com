import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    // Test environment access without any storage
    return Response.json({
      success: true,
      environment: env.ENVIRONMENT,
      hasASSETS: !!env.ASSETS,
      assetType: typeof env.ASSETS,
      hasAdobeClientId: !!env.ADOBE_CLIENT_ID,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return Response.json({
      error: 'Simple test failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
};