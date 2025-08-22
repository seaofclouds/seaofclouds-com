import { App } from 'astro/app';
// @ts-ignore
import manifest from './manifest';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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