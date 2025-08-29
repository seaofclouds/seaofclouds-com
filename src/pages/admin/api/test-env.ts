import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  
  try {
    return Response.json({
      success: true,
      hasR2Storage: !!env.R2_STORAGE,
      r2StorageType: typeof env.R2_STORAGE,
      r2StorageKeys: env.R2_STORAGE ? Object.getOwnPropertyNames(env.R2_STORAGE).slice(0, 5) : [],
      hasEnv: !!env,
      envKeys: Object.keys(env).filter(k => k.startsWith('R2') || k.startsWith('ADOBE')),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return Response.json({
      error: 'Env test failed',
      message: error.message
    }, { status: 500 });
  }
};