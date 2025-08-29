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

# Deploy to Cloudflare (always specify production environment)
npx wrangler deploy --env production
```

## Architecture

### Single Worker Routing
All routes handled by one Worker:
- `/` - Public site (Astro SSR)
- `/:slug` - Album by slug (KV lookup with reserved slug protection)
- `/albums/:id` - Album by Lightroom ID
- `/assets/*` - R2 asset serving with Adobe fallback for cache misses
- `/admin/*` - Protected admin UI (requires authentication)
- `/admin/api/*` - Protected admin JSON endpoints (requires authentication)
- `/admin/auth/*` - OAuth authentication flow

**Authentication Architecture:**
- All `/admin/*` routes protected by Astro middleware
- Production: Adobe OAuth with KV-stored tokens
- Development: Adobe OAuth with shared memory token storage
- Staging: OAuth enabled with limited album slice
- Middleware redirects unauthenticated requests to `/admin/auth/login`
- Session cookies: HttpOnly, Secure, SameSite=Strict

### Data Sources
Abstracted as `DataSource = test | lightroom | flatfile`:
- `test`: Local dev with Lorem Picsum deterministic images, schema identical to production
- `lightroom`: Production with OAuth + paginated API (collection_set: 07ba0fcb09714671bc71ab7ba5a091e7)
- `flatfile`: Optional static content pages (Astro), can coexist with album slugs

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
- **Middleware Protection**: All `/admin/*` routes protected by `src/middleware.ts`
- **Production**: Adobe OAuth 2.0 with IMS endpoints (single user)
- **Development**: Passwordless session-based authentication
- **OAuth Scopes**: `openid,AdobeID,lr_partner_apis,lr_partner_rendition_apis,offline_access`
- **Token Management**: Automatic refresh with KV storage
- **Session Handling**: Cookies with HttpOnly, Secure, SameSite=Strict

**Caching Strategy:**
- JSON: `Cache-Control: public, max-age=3600` with strong ETag (content hash)
- Images: Long-lived TTL (1y, immutable), new processing → new object keys
- Cloudflare Cache Rules: "Cache Everything" with proper Cache-Control headers
- Cache Reserve and Tiered Cache for large/heavy assets
- Always serve last-good JSON on public routes if sync fails
- Write R2 only on content change (compare hash before PUT)

**API Rate Limiting:**
- Always paginate via `links.next`
- Never recurse children until needed
- Concurrency limits (3-5 requests) with exponential backoff
- Daily soft budgets for sync operations

**Reserved Slugs:**
Avoid collisions with: `/`, `/admin`, `/albums`, `/assets`, `/api`, `/auth`, `/method`, `/about`, `/posts`

**Slug Generation:**
- Auto-generation: lowercase, keep a-z/0-9, spaces/specials → '-', collapse dashes, trim edges
- Collision handling: append "-2", "-3", ... deterministically
- KV slug map: `slug:{slug}` = `{ id, type:"album" }`

**Rendition Sizes:**
640, 1280, 2048, 2560 (standard), fullsize (optional)

## Development Principles

- Semantic HTML only (article, figure, main, nav, section)
- Minimal CSS with BEM, CSS Custom Properties, mobile-first
- A11y-first, progressive enhancement, minimal JS (Astro Islands sparingly)
- Server-side rendered public pages with edge/R2/KV caching
- Touch targets ≥ 44px
- Grid/Flex layouts with relative units (rem/%/vh/vw)
- Tiled grid v1: CSS Grid auto-fit with minmax, no fixed heights, respect orientation
- Future: "print-like" spread layouts
- Layout & A11y: `<figure><img><figcaption>` semantics, keyboard nav + minimal lightbox
- Image optimization: lazy loading, decoding=async, sizes/srcset
- Right-click deterrents: disable context menu/drag, overlay pixel trick (not true protection)

## Environment Configuration

**Wrangler Secrets Required:**
- `ADOBE_CLIENT_ID` - Adobe API application ID
- `ADOBE_CLIENT_SECRET` - Adobe API application secret
- `ADMIN_PASSWORD` - Admin UI password
- `API_SECRET_KEY` (optional) - For manual sync triggers

**Environment Variables (in wrangler.toml):**
- `ALLOWED_ORIGINS` - CORS allowed origins
- `ENVIRONMENT` (development | staging | production)

**Domain Strategy:**
- Public site: `https://www.seaofclouds.com`
- Assets CDN: `https://assets.seaofclouds.com` (R2 public bucket)
- Admin: Same Worker at `/admin` (single user Adobe SSO)

**KV Namespaces:**
- `ADOBE_LIGHTROOM_TOKENS` - Sync metadata and state
- `ADOBE_OAUTH_TOKENS` - OAuth tokens and expiry
- `RATE_LIMITS` - API rate limiting

**R2 Bucket:**
- `ASSETS` (bucket: seaofclouds-assets)

## Data Flow

**Public Album Page:**
1. Resolve slug via KV lookup (`slug:{slug}`) or use direct ID
2. Fetch `R2:/albums/{id}/metadata.json` (with ETag)
3. Render tiled grid (CSS Grid auto-fit, minmax) using ordered assets
4. Point `<img>` to assets domain URLs with srcset/sizes

**Admin Album List:**
1. Fetch `R2:/albums/metadata.json` once
2. Client-side sort/filter (name, updated, public, featured)
3. Expand collection_set nodes on demand (no eager children fetches)
4. Load album details only when selected

**Admin Publish Flow:**
1. Toggle "public" → enqueue album detail fetch from Lightroom API
2. Fetch album detail (ordered asset IDs), write `R2:/albums/{id}/metadata.json`
3. For each asset: write metadata.json, create renditions (640/1280/2048/2560)
4. Set `flags:{albumId}.public=true` in KV
5. Update main albums index

**Feature Toggle:**
- Update `flags:{albumId}.featured` in KV
- Optional: mirror into album JSON on next write

**Error Handling & Fallback:**
- Public pages: On R2 miss → serve last-good JSON, show "updated {time} ago"
- Asset serving: R2 miss → Adobe fetch + write-through if album is public
- Admin: Show precise ingestion status, surface backoffs and retry times

**Sync Safety:**
- Resumable via KV cursors/timestamps (`sync:state`)
- Concurrency limits (3-5 requests) + exponential backoff on 429/5xx
- Daily soft budgets to prevent unbounded sync
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
- check @Planning-Chat.md before beginning a new task.
- when user confirms task is complete, update @Planning-Chat.md and prepare a git commit and push to Github
- combine deploy with a tail so we can monitor activity.
- don't say "you're absolutely right!" please try other things

## Current Development Status

### ✅ Completed Infrastructure:
- **Foundation**: Astro + Cloudflare Workers with Adobe OAuth
- **Authentication**: Middleware-protected admin routes (`src/middleware.ts`)
- **API Structure**: All endpoints consolidated under `/admin/api/*`
- **Production Deploy**: Working at `dev.seaofclouds.com`

### 🔨 Active Development:
- **Sync System**: Enhancing `sync-fresh.ts` with pagination and state management
- **Next Phase**: Build upon clean sync-fresh.ts foundation rather than complex sync-metadata.ts

### 📋 Sync Endpoint Strategy:
- `sync-fresh.ts` - Clean foundation for album sync (needs enhancement)
- `sync-metadata.ts` - Complex implementation (reference for features)
- `sync-renditions.ts` - Focused rendition downloads (stable)

### 🚀 Deployment Configuration:
- **Production Default**: Always use `npx wrangler deploy --env production`
- **Worker Environment**: `seaofclouds-production` with custom domain `dev.seaofclouds.com`
- **Monitoring**: Build timestamps in HTML meta tags for deployment verification
- **Logging**: Use `npx wrangler tail --env production` for server monitoring
- test task in browser with playwright after deploy or confirm with user.
- remember there are some challenges with recursion in api requests. load them using cursor and efficiently from adobe.
- when running local server, watch logs and run playwright to monitor changes and events in browser.