---
name: replicate-framer
description: Replicate any Framer website as a self-hosted static mirror. Use when user wants to clone, replicate, mirror, or self-host a Framer site. Takes a Framer URL and produces a complete static site with Cloudflare Worker.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_evaluate, mcp__plugin_playwright_playwright__browser_network_requests
argument-hint: [framer-url]
---

# Framer Site Replication Engine

You are replicating a Framer website as a fully self-hosted static mirror. The target URL is: **$ARGUMENTS**

## How Framer Sites Work

Framer sites are React apps using Framer Motion, served from CDN. Key architecture:

- **Site HTML**: Server-rendered React with inline CSS (~162KB), animation JSON, breakpoint configs
- **JS Runtime**: 16+ `.mjs` bundles at `framerusercontent.com/sites/{siteId}/` — handles animations, scroll effects, video embeds, responsive behavior
- **Assets**: Fonts (`.woff2`), images, videos at `framerusercontent.com/assets/`, `/images/`, `/third-party-assets/`
- **Modules**: Phosphor icons at `framerusercontent.com/modules/` and `framer.com/m/`
- **CSS System**: `framer-{hash}` class names, zero child combinators (only descendant selectors), 3 breakpoints (Desktop >=1200px, Tablet 810-1199px, Mobile <=809px)
- **Design Tokens**: CSS variables `--token-{uuid}` on `<body>` for colors

### CDN Domains to MIRROR:
- `framerusercontent.com` — fonts, images, JS bundles, modules, videos
- `events.framer.com` — analytics script (optional)
- `framer.com/m/` — phosphor icon components

### CDN Domains to SKIP (editor/analytics cruft):
- `app.framerstatic.com` — Framer editor bar (~150 chunk files, not needed)
- `challenges.cloudflare.com` — Cloudflare Turnstile bot protection
- `o20425.ingest.sentry.io` — Sentry error reporting
- `api.framer.com` — Framer auth

## Step-by-Step Process

### Step 1: Discover the Site

1. Navigate to the Framer URL using Playwright
2. Wait for full load, then take a screenshot for reference
3. Identify:
   - **Site ID**: Find in HTML source (look for `framerusercontent.com/sites/{siteId}/`)
   - **All pages**: Check navigation links, sitemap, `<a>` tags with internal hrefs
   - **Site title and metadata**: From `<title>`, OG tags

### Step 2: Create Output Directory

Create this structure in the current working directory:

```
dist/
  _deps/           # mirrors framerusercontent.com CDN paths
    assets/         # fonts (.woff2), videos (.mp4, .webm)
    sites/{siteId}/ # JS bundles (.mjs)
    images/         # all site images
    third-party-assets/  # third-party fonts
    modules/        # icon components
    events/         # events.framer.com scripts
    framer/         # framer.com hosted scripts
worker/
  src/index.js      # Cloudflare Worker
  wrangler.toml     # Worker config
  package.json      # Dependencies
scripts/
  extract.js        # The extraction script
```

### Step 3: Build and Run the Extraction Script

Use the extraction script template at `${CLAUDE_SKILL_DIR}/scripts/extract.js` as a starting point. Customize it for this specific site:

1. Update `SITE_ORIGIN` to the target Framer URL
2. Update `PAGES` array with all discovered pages
3. Run: `node scripts/extract.js`

The script will:
- Fetch each page's HTML
- Extract all CDN asset URLs (fonts, images, JS, modules)
- Decode HTML entities (`&amp;` -> `&`) in URLs before downloading
- Download all assets preserving CDN path structure into `_deps/`
- Scan downloaded JS bundles for additional asset references (images/videos referenced in code)
- Rewrite all CDN URLs to local `/_deps/` paths
- Strip unwanted elements:
  - Framer editor bar scripts/iframe
  - Cloudflare Turnstile scripts
  - Sentry error reporting
  - Framer analytics event tracking
  - "Create a free website with Framer" badge
- Save rewritten HTML as `dist/{page}.html`

### Step 4: Build the Cloudflare Worker

Use the worker template at `${CLAUDE_SKILL_DIR}/templates/worker.js`. Customize the route map for this site's pages.

### Step 5: Test Locally

```bash
cd worker && npm install && npx wrangler dev --port 8787
```

Then use Playwright to:
1. Navigate to `http://localhost:8787`
2. Take a screenshot and compare with the original
3. Check all pages load
4. Verify no external CDN requests in the network tab

### Step 6: Verify Fidelity

Use Playwright to screenshot both the original and mirror at:
- Desktop (1440px width)
- Mobile (390px width)

Compare visually. Check:
- All images load
- Fonts render correctly
- Animations play (scroll effects, hover states)
- Video embeds work
- Navigation between pages works
- No requests to framerusercontent.com or framer.com in network tab

## Key Engineering Decisions

1. **Build-time URL rewriting** (not runtime) — URLs are rewritten in the HTML during extraction, not by the worker. This keeps the worker simple.

2. **Strip the editor bar** — Framer loads ~150 editor chunk files. These are for the in-page edit button and are not needed.

3. **Keep Framer's JS runtime** — The site-specific `.mjs` bundles handle animations, scroll effects, video embedding, responsive behavior. Keep these for 100% fidelity.

4. **Preserve exact CDN path structure** — Mirror paths exactly (`/_deps/sites/{siteId}/react.xxx.mjs`) so relative imports within JS bundles still resolve.

5. **Download base images without query params** — Framer's image CDN uses query params for resizing (`?width=1024&height=768`). Download the base image (no params) and rewrite HTML to point to it. The browser handles display sizing via CSS.

## Common Issues and Fixes

- **400 errors on image downloads**: Usually caused by `&amp;` in URLs (HTML entities). The extraction script decodes these.
- **React hydration errors in console**: Normal — Framer's runtime handles these gracefully with "recoverable error" warnings.
- **Missing images in JS bundles**: The extraction script scans downloaded JS for additional `framerusercontent.com` URLs and downloads them in a second pass.
- **Vimeo/video embeds**: These load from third-party domains (player.vimeo.com) and will still load from the internet. They are not mirrored.
- **Cloudflare Turnstile console noise**: Strip all Turnstile-related scripts to silence this.
