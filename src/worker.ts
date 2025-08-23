import { App } from 'astro/app';
// @ts-ignore
import manifest from './manifest';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    
    // TEMPORARY FIX: Add fake fetch method to R2 bucket to prevent errors
    // This must happen BEFORE creating the Astro app
    if (env.ASSETS && typeof env.ASSETS === 'object' && !env.ASSETS.fetch) {
      (env.ASSETS as any).fetch = () => {
        throw new Error('R2 buckets do not support .fetch() - use .get()/.put()/.delete() instead');
      };
    }
    
    const app = new App(manifest);
    
    // Add env to locals for access in Astro routes
    const locals = {
      runtime: {
        env,
        ctx,
        cf: request.cf
      }
    };

    return app.render(request, { locals });
  }
};