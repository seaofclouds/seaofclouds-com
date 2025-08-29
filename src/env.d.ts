/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface Env {
  ADOBE_LIGHTROOM_TOKENS: KVNamespace;  // Non-sensitive: sync state, cursors, pagination
  ADOBE_OAUTH_TOKENS: KVNamespace;      // Runtime OAuth: access_token, refresh_token, token_expires_at
  RATE_LIMITS: KVNamespace;
  SESSION: KVNamespace;  // Astro session storage
  R2_STORAGE: R2Bucket;  // R2 bucket for asset storage
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  // Secrets (encrypted, set via wrangler secret)
  ADMIN_PASSWORD?: string;
  ADOBE_CLIENT_ID?: string;      // Secret: Adobe API client ID
  ADOBE_CLIENT_SECRET?: string;  // Secret: Adobe API client secret
  API_SECRET_KEY?: string;
}