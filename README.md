# Sea of Clouds - Photography Portfolio

A minimalist photography portfolio built with Astro and Cloudflare Workers, serving cached Adobe Lightroom data.

## Quick Start

```bash
npm install
npm run dev     # Local development on https://localhost:8787
npm run build   # Build for production
npm run deploy  # Deploy to Cloudflare Workers
```

## Features

- **Public Galleries**: Fast, SEO-optimized album viewing with slug-based URLs
- **Admin Interface**: Single-user management with Adobe OAuth authentication  
- **Cache-First API**: Lightroom data served from R2 with Adobe API fallback
- **Asset CDN**: Optimized image serving with multiple rendition sizes
- **Test Mode**: 13 realistic albums with Lorem Picsum for local development

## Architecture

Single Cloudflare Worker serving:
- Public site at `/` and `/:slug` 
- Admin interface at `/admin/*` (Adobe OAuth protected)
- Asset serving at `/assets/*` (R2 + Adobe fallback)

**Storage**: R2 buckets for assets/metadata, KV for flags/slugs/tokens

**Authentication**: Adobe OAuth 2.0 with IMS endpoints (single user)

## Documentation

See [CLAUDE.md](./CLAUDE.md) for comprehensive technical documentation and [Planning-Chat.md](./Planning-Chat.md) for current development status.

## Deployment

Requires these Cloudflare secrets via `wrangler secret`:
- `ADOBE_CLIENT_ID` / `ADOBE_CLIENT_SECRET` 
- `ADMIN_PASSWORD`