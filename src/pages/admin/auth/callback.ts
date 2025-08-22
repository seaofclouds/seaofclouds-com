import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';

export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return new Response('OAuth callback only available in production', { status: 404 });
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
    const tokens = await authProvider.exchangeCodeForTokens(code, redirectUri);
    
    console.log('Adobe OAuth successful, tokens stored');
    
    // Redirect to admin dashboard
    return Response.redirect(`${url.origin}/admin`);
    
  } catch (error) {
    console.error('OAuth token exchange failed:', error);
    return Response.redirect(`${url.origin}/admin/auth/login?error=token_exchange_failed`);
  }
};