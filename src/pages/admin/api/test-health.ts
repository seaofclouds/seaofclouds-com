import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  // Test the Adobe Lightroom health endpoint (no auth required)
  const healthUrl = 'https://lr.adobe.io/v2/health';
  
  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': env.ADOBE_CLIENT_ID || 'test-client-id'
      }
    });
    
    const responseText = await response.text();
    
    return Response.json({
      healthCheck: {
        url: healthUrl,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText.substring(0, 500)
      },
      clientInfo: {
        hasClientId: !!env.ADOBE_CLIENT_ID,
        clientIdPrefix: env.ADOBE_CLIENT_ID?.substring(0, 8) || 'none'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    return Response.json({
      error: 'Health check failed',
      message: error.message,
      healthUrl
    }, { status: 500 });
  }
};