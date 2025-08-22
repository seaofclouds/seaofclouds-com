import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';

export const GET: APIRoute = async ({ locals, url, cookies }) => {
  const env = locals.runtime.env as Env;
  const authProvider = createAuthProvider(env);

  try {
    if (env.ENVIRONMENT === 'production') {
      // Production: Revoke Adobe OAuth tokens
      const oauthProvider = authProvider as any;
      await oauthProvider.revokeTokens();
      console.log('Adobe OAuth tokens revoked');
    } else {
      // Development: Clear session
      const sessionCookie = cookies.get('admin_session');
      if (sessionCookie) {
        const devAuth = authProvider as any;
        await devAuth.revokeSession(sessionCookie.value);
      }
    }
  } catch (error) {
    console.error('Error during logout:', error);
    // Continue with logout even if revocation fails
  }

  // Clear session cookie
  cookies.delete('admin_session', {
    path: '/admin'
  });

  // Redirect to login page
  return Response.redirect(`${url.origin}/admin/auth/login?logout=success`);
};