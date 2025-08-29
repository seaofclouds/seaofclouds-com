import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';

export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env as Env;
  
  // Allow callback in any environment if Adobe credentials are available
  if (!env.ADOBE_CLIENT_ID || !env.ADOBE_CLIENT_SECRET) {
    return new Response('OAuth callback requires Adobe credentials', { status: 404 });
  }

  const authProvider = createAuthProvider(env) as any; // AdobeOAuth
  const urlParams = new URLSearchParams(url.search);
  
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return Response.redirect(`${url.origin}/admin/auth/login?error=oauth_failed`);
  }

  if (!code) {
    return Response.redirect(`${url.origin}/admin/auth/login?error=no_code`);
  }

  // TODO: Validate state parameter for CSRF protection
  // In a real implementation, you'd check this against stored state

  try {
    // Exchange code for tokens
    const redirectUri = `${url.origin}/admin/auth/callback`;
    console.log('Starting token exchange with redirectUri:', redirectUri);
    console.log('Authorization code received:', code?.substring(0, 20) + '...');
    
    const tokens = await authProvider.exchangeCodeForTokens(code, redirectUri);
    
    console.log('Adobe OAuth successful, tokens stored');
    console.log('Token details:', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresAt: tokens.expiresAt
    });
    
    // Redirect to admin dashboard
    return Response.redirect(`${url.origin}/admin`);
    
  } catch (error) {
    console.error('OAuth token exchange failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    return Response.redirect(`${url.origin}/admin/auth/login?error=token_exchange_failed&details=${encodeURIComponent(error.message)}`);
  }
};