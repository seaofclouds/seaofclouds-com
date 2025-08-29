import type { APIRoute } from 'astro';
import { createAuthProvider } from '../../../lib/auth';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as Env;
  const authProvider = createAuthProvider(env);

  // Check if we have Adobe OAuth available
  if ('generateAuthUrl' in authProvider) {
    // Adobe OAuth flow - debug logging
    console.log('OAuth Debug - url.origin:', url.origin);
    console.log('OAuth Debug - url.href:', url.href);
    
    const redirectUri = `${url.origin}/admin/auth/callback`;
    console.log('OAuth Debug - redirectUri:', redirectUri);
    
    const state = crypto.randomUUID();
    const authUrl = (authProvider as any).generateAuthUrl(redirectUri, state);
    console.log('OAuth Debug - authUrl:', authUrl);
    
    // Store state for CSRF protection
    // In a real app, you'd store this in a session or secure cookie
    
    return Response.redirect(authUrl);
  } else {
    // Development login form
    const loginForm = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admin Login - Development</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              max-width: 400px; 
              margin: 100px auto; 
              padding: 20px;
              background: #f5f5f5;
            }
            .form { 
              background: white; 
              padding: 30px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { margin-top: 0; color: #333; }
            input { 
              width: 100%; 
              padding: 12px; 
              margin: 10px 0; 
              border: 1px solid #ddd; 
              border-radius: 4px;
              box-sizing: border-box;
            }
            button { 
              width: 100%; 
              padding: 12px; 
              background: #007cba; 
              color: white; 
              border: none; 
              border-radius: 4px; 
              cursor: pointer;
              font-size: 16px;
            }
            button:hover { background: #005a87; }
            .note { 
              font-size: 14px; 
              color: #666; 
              margin-top: 15px; 
              padding: 10px; 
              background: #f9f9f9; 
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="form">
            <h1>Admin Login</h1>
            <form method="POST">
              <input type="password" name="password" placeholder="Password (any value)" required>
              <button type="submit">Login</button>
            </form>
            <div class="note">
              <strong>Development Mode:</strong> No password required - enter any value.
              In production, this will use Adobe OAuth instead.
            </div>
          </div>
        </body>
      </html>
    `;

    return new Response(loginForm, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env as Env;
  
  if (env.ENVIRONMENT !== 'development') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authProvider = createAuthProvider(env) as any; // DevAuth
  const formData = await request.formData();
  const password = formData.get('password') as string;

  // TEMPORARILY DISABLED: Skip password validation for SSL testing
  // if (!password || !authProvider.validatePassword(password)) {
  //   return Response.redirect(`${url.origin}/admin/auth/login?error=invalid`);
  // }

  // Create session
  const sessionToken = authProvider.generateSessionToken();
  await authProvider.createSession(sessionToken);

  // Create response with cookie
  const response = new Response(null, {
    status: 302,
    headers: {
      'Location': `${url.origin}/admin`,
      'Set-Cookie': [
        `admin_session=${sessionToken}`,
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Max-Age=86400', // 24 hours
        `Path=/admin`
      ].join('; ')
    }
  });

  return response;
};