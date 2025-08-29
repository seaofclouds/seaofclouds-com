// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

// HTTPS configuration for local development
const isDev = process.env.NODE_ENV !== 'production';
const httpsConfig = isDev ? {
  key: readFileSync(resolve('./certs/localhost-key.pem')),
  cert: readFileSync(resolve('./certs/localhost.pem'))
} : undefined;

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'advanced',
    runtime: {
      mode: 'local'
    },
    routes: {
      strategy: 'auto'
    },
    cloudflareModules: false
  }),
  integrations: [tailwind()],
  server: isDev ? {
    port: 8787,
    https: httpsConfig
  } : undefined,
  vite: {
    build: {
      rollupOptions: {
        external: []
      }
    }
  }
});