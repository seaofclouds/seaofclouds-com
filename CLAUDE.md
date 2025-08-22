# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A unified Cloudflare Worker (via Astro SSR adapter) serving a personal photography website with:
- Public galleries (minimalist, fast, SEO/a11y optimized)
- Admin UI for single-user management
- Cache-first API for Adobe Lightroom data
- Asset serving from R2 with Adobe fallback

## Commands

Since the project uses Astro with Cloudflare Workers:

```bash
# Install dependencies
npm install

# Local development
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare
npx wrangler deploy
```

## Architecture

### Single Worker Routing
All routes handled by one Worker:
- `/` - Public site (Astro SSR)
- `/:slug` - Album by slug (KV lookup)
- `/albums/:id` - Album by Lightroom ID
- `/assets/*` - R2 asset serving with Adobe fallback
- `/admin/*` - Protected admin UI
- `/admin/api/*` - Admin JSON endpoints
- `/admin/auth/*` - OAuth (prod) / dev login (local)

### Data Sources
Abstracted as `DataSource = test | lightroom | flatfile`:
- `test`: Local dev with Lorem Picsum images
- `lightroom`: Production with OAuth + paginated API
- `flatfile`: Optional static content pages

### Storage Model
**R2 Structure:**
- `/albums/metadata.json` - Album list cache
- `/albums/{albumId}/metadata.json` - Album detail + ordered assets
- `/assets/{assetId}/metadata.json` - Asset metadata
- `/assets/{assetId}/renditions/{size}.jpg` - 640, 1280, 2048, 2560, fullsize

**KV Structure:**
- `ADOBE_LIGHTROOM_TOKENS` - Sync state, cursors, pagination metadata
- `ADOBE_OAUTH_TOKENS` - Runtime OAuth tokens (access_token, refresh_token, token_expires_at)
- `RATE_LIMITS` - Per-route counters/backoff
- `slug:{slug}` - Slug→ID mapping
- `sync:state` - Ingestion cursors + health
- `flags:{albumId}` - Public/featured flags + slug config

### Key Implementation Notes

**Authentication:**
- Production: Adobe OAuth for `/admin/*` (single user)
- Local dev: `ADMIN_PASSWORD` gate (no localhost OAuth)

**Caching Strategy:**
- JSON: `Cache-Control: public, max-age=3600` with ETag
- Images: Long-lived (up to 1y, immutable)
- Always serve last-good JSON on public routes if sync fails

**API Rate Limiting:**
- Always paginate via `links.next`
- Never recurse children until needed
- Concurrency limits (3-5 requests) with exponential backoff
- Daily soft budgets for sync operations

**Reserved Slugs:**
Avoid collisions with: `/`, `/admin`, `/albums`, `/assets`, `/api`, `/auth`, `/method`, `/about`, `/posts`

**Rendition Sizes:**
640, 1280, 2048, 2560 (standard), fullsize (optional)

## Development Principles

- Semantic HTML only (article, figure, main, nav, section)
- Minimal CSS with BEM, CSS Custom Properties, mobile-first
- A11y-first, progressive enhancement, minimal JS (Astro Islands sparingly)
- Server-side rendered public pages with edge/R2/KV caching
- Touch targets ≥ 44px
- Grid/Flex layouts with relative units (rem/%/vh/vw)

## Environment Configuration

**Wrangler Secrets Required:**
- `ADOBE_CLIENT_ID` - Adobe API application ID
- `ADOBE_CLIENT_SECRET` - Adobe API application secret
- `ADMIN_PASSWORD` - Admin UI password
- `API_SECRET_KEY` (optional) - For manual sync triggers

**Environment Variables (in wrangler.toml):**
- `ALLOWED_ORIGINS` - CORS allowed origins
- `ENVIRONMENT` (development | staging | production)

**KV Namespaces:**
- `ADOBE_LIGHTROOM_TOKENS` - Sync metadata and state
- `ADOBE_OAUTH_TOKENS` - OAuth tokens and expiry
- `RATE_LIMITS` - API rate limiting

**R2 Bucket:**
- `ASSETS` (bucket: seaofclouds-assets)

## Data Flow

**Public Album Page:**
1. Fetch `R2:/albums/{id}/metadata.json` (with ETag)
2. Render grid using ordered assets
3. Point `<img>` to assets domain URLs with srcset

**Admin Publish Flow:**
1. Toggle "public" → enqueue album detail fetch
2. Fetch album detail from Lightroom API
3. Write metadata + create renditions in R2
4. Update KV flags

**Sync Safety:**
- Resumable via KV cursors/timestamps
- Exponential backoff on 429/5xx
- Only mirror published albums to R2

## REFERENCES

Adobe Lightroom API
- https://developer.adobe.com/lightroom/lightroom-api-docs/
- https://developer.adobe.com/lightroom/lightroom-api-docs/getting-started/
- https://developer.adobe.com/lightroom/lightroom-api-docs/api/
- https://developer.adobe.com/lightroom/lightroom-api-docs/guides/common_data_model/
- https://developer.adobe.com/lightroom/lightroom-api-docs/guides/calling_api/
- https://developer.adobe.com/lightroom/lightroom-api-docs/release-notes/

Adobe OAuth / IMS
- https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/implementation/
- https://developer.adobe.com/apis

Adobe I/O Events / Webhooks (for sync)
- https://developer.adobe.com/events/docs/guides/
- https://developer.adobe.com/firefly-services/docs/lightroom/features/
- https://github.com/adobeio/io-event-sample-webhook

Cloudflare Workers / Astro on Cloudflare
- https://developers.cloudflare.com/workers/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- https://docs.astro.build/en/guides/deploy/cloudflare/

Cloudflare Storage & Caching (R2, KV, Cache Rules)
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/api/list-keys/
- https://developers.cloudflare.com/cache/how-to/cache-rules/
 - https://developers.cloudflare.com/cache/concepts/default-cache-behavior/

Wrangler & Secrets
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/wrangler/commands/
- https://developers.cloudflare.com/workers/configuration/secrets/

GitHub OAuth (fallback admin auth)
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

Astro & Repos
- https://github.com/withastro/astro
- https://github.com/cloudflare/workers-sdk

Test Images (local dev placeholders)
- https://picsum.photos/
- https://github.com/DMarby/picsum-photos
- refer to - https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/implementation/ when working on Adobe OAuth or stuck