import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  // Test the actual Adobe API endpoint without proper auth to see what error we get
  const testUrl = 'https://lr.adobe.io/v2/catalog';
  
  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-invalid-token',
        'Accept': 'application/json',
        'X-API-Key': env.ADOBE_CLIENT_ID || 'test-client-id'
      }
    });
    
    const responseText = await response.text();
    
    return Response.json({
      testUrl,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText.substring(0, 500), // First 500 chars to avoid huge responses
      hasClientId: !!env.ADOBE_CLIENT_ID,
      clientIdPrefix: env.ADOBE_CLIENT_ID?.substring(0, 8) || 'none'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    return Response.json({
      error: 'Network or fetch error',
      message: error.message,
      testUrl
    }, { status: 500 });
  }
};