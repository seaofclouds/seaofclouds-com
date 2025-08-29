import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  return new Response(JSON.stringify({
    hasAdobeClientId: !!env.ADOBE_CLIENT_ID,
    hasAdobeClientSecret: !!env.ADOBE_CLIENT_SECRET,
    hasAdminPassword: !!env.ADMIN_PASSWORD,
    environment: env.ENVIRONMENT,
    allowedOrigins: env.ALLOWED_ORIGINS
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
