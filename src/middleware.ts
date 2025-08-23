import { defineMiddleware } from 'astro:middleware';
import { createAuthProvider } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, locals, request } = context;
  const env = locals.runtime.env as Env;
  
  // Only protect /admin/* routes (but not /admin/auth/* which handles login)
  if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/auth')) {
    try {
      const authProvider = createAuthProvider(env);
      
      if (env.ENVIRONMENT === 'production') {
        // Production: Use Adobe OAuth
        const isAuthenticated = await authProvider.isAuthenticated();
        if (!isAuthenticated) {
          return Response.redirect(new URL('/admin/auth/login', url.origin));
        }
      } else {
        // Development: Check session cookie
        const sessionToken = context.cookies.get('admin_session')?.value;
        const isAuthenticated = await authProvider.isAuthenticated(sessionToken);
        
        if (!isAuthenticated) {
          return Response.redirect(new URL('/admin/auth/login', url.origin));
        }
      }
    } catch (error) {
      console.error('Auth middleware error:', error);
      return Response.redirect(new URL('/admin/auth/login', url.origin));
    }
  }

  return next();
});