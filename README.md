# framer-to-cloudflare

Export your Framer site and self-host it on Cloudflare Workers — for free.

## Why?

Framer charges $15-30/mo just to host your site. Your HTML, CSS, and assets are yours. This tool exports your Framer project and deploys it to Cloudflare Workers in minutes.

## How it works

1. Point the tool at your published Framer site URL
2. It exports the complete frontend — HTML, CSS, JS, images, fonts
3. Deploys to Cloudflare Workers with one command
4. Your site is live on a custom domain or `.workers.dev` subdomain — free forever

## Demo

<video src="https://github.com/user-attachments/assets/307be678-7922-44cf-afea-a824886354f7" controls width="100%"></video>

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- [Chrome DevTools MCP server](https://github.com/anthropics/chrome-devtools-mcp) configured in Claude Code — used for site discovery, screenshot comparison, and verifying the mirror
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- Your published Framer site URL (e.g. `https://your-site.framer.app`)
- Node.js 18+

## Installation

Clone this repo and install the Claude Code skill:

```bash
git clone https://github.com/rakshith48/framer-to-cloudflare.git
cd framer-to-cloudflare
./install.sh
```

This copies the skill into `~/.claude/skills/replicate-framer/` so Claude Code can use it.

## Quickstart

1. Open Claude Code in any directory where you want your mirror project:

```bash
mkdir my-site && cd my-site
claude
```

2. Run the skill with your Framer URL:

```
/replicate-framer https://your-site.framer.app
```

3. Claude will:
   - Navigate to your site and discover all pages
   - Download every page's HTML, all JS bundles, fonts, images, and assets
   - Rewrite all CDN URLs to local paths
   - Strip Framer editor bar, analytics, and bot protection scripts
   - Generate a Cloudflare Worker to serve the static site
   - Test locally with `wrangler dev`

4. Deploy to Cloudflare:

```bash
cd worker
npx wrangler deploy
```

## What gets exported

- Full HTML structure and content
- All CSS styling (inline styles, CSS variables, design tokens)
- JavaScript runtime (animations, scroll effects, hover states, responsive behavior)
- Images, fonts (.woff2), and media assets
- Video embed references (Vimeo/YouTube still load from their CDNs)
- Responsive breakpoints (Desktop, Tablet, Mobile)
- SEO metadata (title, description, OG tags, favicons)
- 404 page

## What this is NOT

This is a tool for exporting and self-hosting **your own** Framer sites. It's for people who want to own their hosting instead of paying monthly fees for static site delivery.

## Output structure

```
your-project/
├── dist/                    # Static site output
│   ├── index.html           # Homepage (URLs rewritten to local paths)
│   ├── about.html           # Each page as a separate HTML file
│   ├── 404.html             # Error page
│   ├── favicon.png
│   ├── og-image.png
│   └── _deps/               # All CDN assets mirrored locally
│       ├── assets/           # Fonts (.woff2)
│       ├── sites/{siteId}/   # JS bundles (.mjs)
│       ├── images/           # All images
│       ├── modules/          # Icon components
│       └── third-party-assets/
├── worker/
│   ├── src/index.js          # Cloudflare Worker
│   ├── wrangler.toml
│   └── package.json
└── scripts/
    └── extract.js            # Extraction script
```

## Limitations

- **Framer CMS**: Dynamic CMS content is exported as static HTML — it won't update automatically
- **Forms**: Framer's built-in form submissions won't work (they hit Framer's backend). You'll need to wire up your own form handler
- **Password-protected pages**: Can't export pages behind Framer's password protection
- **Scheduled publishing**: No equivalent — content is static at the time of export
- **Video embeds**: Vimeo/YouTube videos still load from their respective CDNs (not mirrored)
- **React hydration warnings**: Console may show React "recoverable error" warnings — these are normal and don't affect functionality

## How it works (technical)

Framer sites are React apps using Framer Motion, served from CDN. The extraction:

1. **Fetches each page's HTML** from the live site
2. **Extracts all CDN asset URLs** from HTML (fonts, images, JS bundles, modules)
3. **Downloads assets** preserving CDN path structure into `_deps/`
4. **Scans JS bundles** for additional asset references (images/videos referenced in code)
5. **Rewrites URLs** — replaces `framerusercontent.com` origins with local `/_deps/` paths
6. **Strips cruft** — editor bar, Cloudflare Turnstile, Sentry, analytics, "Made with Framer" badge
7. **Generates a Cloudflare Worker** with route mapping for all pages

## Coming soon

- [ ] WordPress export support
- [ ] Webflow export support
- [ ] Auto-setup custom domains
- [ ] CI/CD for re-exports when your Framer site changes
- [ ] Cloudflare Pages support (in addition to Workers)

## Contributing

PRs welcome. If you find a Framer site that doesn't export correctly, open an issue with the URL.

## License

MIT
