import { defineMiddleware } from 'astro:middleware';
import { createAuthProvider } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, locals, request } = context;
  const env = locals.runtime.env as Env;
  
  // Only protect /admin/* routes (but not /admin/auth/* which handles login)
  if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/auth')) {
    try {
      const authProvider = createAuthProvider(env);
      
      // Force Adobe OAuth for localhost testing
      const isAuthenticated = await authProvider.isAuthenticated();
      if (!isAuthenticated) {
        return Response.redirect(new URL('/admin/auth/login', url.origin));
      }
    } catch (error) {
      console.error('Auth middleware error:', error);
      return Response.redirect(new URL('/admin/auth/login', url.origin));
    }
  }

  return next();
});