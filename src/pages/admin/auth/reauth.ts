import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';
import { createStorageHelpers } from '../../../lib/storage';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'production') {
    return Response.redirect(`${url.origin}/admin/auth/login`);
  }

  try {
    // Clear any existing OAuth tokens to force re-authentication
    const storage = createStorageHelpers(env);
    await storage.kv.clearOAuthTokens();
    
    console.log('Cleared OAuth tokens, forcing re-authentication');
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }

  // Redirect to login which will trigger OAuth flow
  return Response.redirect(`${url.origin}/admin/auth/login`);
};