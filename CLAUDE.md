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
- `ADOBE_TOKENS` - OAuth tokens
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
- `ADOBE_CLIENT_ID`
- `ADOBE_CLIENT_SECRET` 
- `ADOBE_REDIRECT_URI`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`
- `ENVIRONMENT` (development | staging | production)
- `API_SECRET_KEY` (optional)

**KV Namespaces:**
- `ADOBE_TOKENS`
- `RATE_LIMITS`

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