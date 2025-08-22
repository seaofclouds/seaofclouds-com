/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface Env {
  ADOBE_TOKENS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  ASSETS: R2Bucket;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  // Dev-only password auth (no Adobe OAuth in development)
  ADMIN_PASSWORD?: string;
  // Optional for manual sync triggers
  API_SECRET_KEY?: string;
}