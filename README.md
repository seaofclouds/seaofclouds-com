# Sea of Clouds - Photography Portfolio

A minimalist photography portfolio built with Astro and Cloudflare Workers, serving cached Adobe Lightroom data.

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start local development server (runs on http://localhost:8787)
npm run dev
```

## Development

This project uses Cloudflare Workers (not Pages) with KV storage and R2 buckets. See [CLAUDE.md](./CLAUDE.md) for detailed architecture and development guidance.

### Key Features

- **Public Site**: Minimalist galleries with fast, SEO-optimized rendering
- **Admin UI**: Single-user management interface for publishing albums
- **Cache-first API**: Lightroom data served from R2 with Adobe fallback
- **Local Development**: Test data mode since Adobe OAuth doesn't work on localhost

### Project Structure

```
/
├── dist/              # Build output (Worker files)
├── src/
│   ├── pages/         # Astro routes
│   │   ├── admin/     # Admin interface
│   │   └── api/       # API endpoints
│   ├── types/         # TypeScript definitions
│   └── worker.ts      # Worker entry point
├── astro.config.mjs   # Astro configuration
└── wrangler.toml      # Cloudflare Worker config
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server on port 8787 |
| `npm run build` | Build for production |
| `npm run deploy` | Build and deploy to Cloudflare |

### Environment

- **Development**: Uses test data with Lorem Picsum images
- **Production**: Adobe OAuth with Lightroom API integration
- **Authentication**: ADMIN_PASSWORD for local dev, Adobe SSO in production

## Deployment

Deployment to Cloudflare Workers requires the following secrets to be set via `wrangler secret`:

- `ADMIN_PASSWORD` - Admin access password for development
- `ADOBE_CLIENT_ID` - Adobe API client ID (production only)
- `ADOBE_CLIENT_SECRET` - Adobe API client secret (production only)

## Architecture

See [CLAUDE.md](./CLAUDE.md) for comprehensive documentation about:
- Storage model (R2 + KV structure)
- API rate limiting and caching strategies
- Data flow patterns
- Authentication approach
- Development principles