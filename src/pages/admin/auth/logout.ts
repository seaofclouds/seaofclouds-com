import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals, url, cookies }) => {
  const env = locals.runtime.env as Env;
  const authProvider = createAuthProvider(env);

  try {
    // Force clear tokens for both auth types
    if ('revokeTokens' in authProvider) {
      // Adobe OAuth: Revoke tokens and clear memory  
      const oauthProvider = authProvider as any;
      await oauthProvider.revokeTokens();
      console.log('Adobe OAuth tokens revoked and cleared');
    } else {
      // DevAuth: Clear session
      const sessionCookie = cookies.get('admin_session');
      if (sessionCookie) {
        const devAuth = authProvider as any;
        await devAuth.revokeSession(sessionCookie.value);
      }
    }
    
    // Force clear any remaining storage
    const storage = createStorageHelpers(env);
    await storage.clearOAuthTokens();
    console.log('All auth tokens force cleared');
    
  } catch (error) {
    console.error('Error during logout:', error);
    // Continue with logout even if revocation fails
  }

  // Redirect to root domain, not admin
  const redirectUrl = `${url.origin}/?logout=success`;
  const headers = new Headers();
  headers.set('Location', redirectUrl);
  headers.set('Set-Cookie', 'admin_session=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax');

  return new Response(null, {
    status: 302,
    headers
  });
};