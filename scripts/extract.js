#!/usr/bin/env node

/**
 * Framer Site Mirror — Extraction Script
 *
 * Usage: node extract.js <framer-url> [--pages /path1,/path2,...]
 *
 * Downloads all pages + CDN assets from a live Framer site,
 * rewrites URLs to local paths, strips editor/analytics cruft,
 * and outputs a self-contained static site in dist/.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

// ─── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SITE_ORIGIN = args.find(a => a.startsWith('http'));

if (!SITE_ORIGIN) {
  console.error('Usage: node extract.js <framer-url> [--pages /path1,/path2,...]');
  console.error('Example: node extract.js https://my-site.framer.app --pages /,/about,/contact');
  process.exit(1);
}

// Parse --pages flag or default to just /
const pagesIdx = args.indexOf('--pages');
let pagePaths = ['/'];
if (pagesIdx !== -1 && args[pagesIdx + 1]) {
  pagePaths = args[pagesIdx + 1].split(',').map(p => p.trim());
}

// Convert page paths to {path, file} pairs
const PAGES = pagePaths.map(p => ({
  path: p,
  file: p === '/' ? 'index.html' : p.replace(/^\//, '').replace(/\//g, '-') + '.html',
}));

console.log(`Site: ${SITE_ORIGIN}`);
console.log(`Pages: ${PAGES.map(p => p.path).join(', ')}`);

// ─── Patterns to strip ──────────────────────────────────────────────────────

const STRIP_PATTERNS = [
  // Framer editor bar init script
  /\s*<script>[^<]*localStorage\.get\("__framer_force_showing_editorbar_since"\)[^<]*<\/script>\s*/g,
  // Framer editor bar iframe/scripts
  /\s*<script[^>]*src="https:\/\/framer\.com\/edit[^"]*"[^>]*><\/script>\s*/g,
  // app.framerstatic.com (editor bar chunks)
  /\s*<link[^>]*href="https:\/\/app\.framerstatic\.com[^"]*"[^>]*>\s*/g,
  /\s*<script[^>]*src="https:\/\/app\.framerstatic\.com[^"]*"[^>]*><\/script>\s*/g,
  // Cloudflare Turnstile
  /\s*<script[^>]*src="https:\/\/challenges\.cloudflare\.com[^"]*"[^>]*><\/script>\s*/g,
  /\s*<div[^>]*id="__framer-badge-container"[^>]*>[\s\S]*?<\/div>\s*/g,
  // Sentry
  /\s*<script[^>]*sentry[^>]*><\/script>\s*/g,
  // Framer analytics event POST
  /\s*<script[^>]*>[\s\S]*?events\.framer\.com\/anonymous[\s\S]*?<\/script>\s*/g,
];

// Track all unique asset URLs
const assetUrls = new Set();

// ─── URL extraction ──────────────────────────────────────────────────────────

function extractAssetUrls(html) {
  const urlRegex = /https:\/\/(framerusercontent\.com|events\.framer\.com|framer\.com)\/([\w\-\/\.@,]+(?:\?[^"'\s)}<]*)?)/g;
  let match;
  while ((match = urlRegex.exec(html)) !== null) {
    const fullUrl = match[0].replace(/&amp;/g, '&');
    if (fullUrl.includes('framer.com/edit')) continue;
    if (fullUrl.includes('app.framerstatic.com')) continue;
    assetUrls.add(fullUrl);
  }
}

function cdnUrlToLocalPath(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const pathname = parsed.pathname;

    if (host === 'framerusercontent.com') return `/_deps${pathname}`;
    if (host === 'events.framer.com') return `/_deps/events${pathname}`;
    if (host === 'framer.com') return `/_deps/framer${pathname}`;
  } catch { return null; }
  return null;
}

// ─── URL rewriting ───────────────────────────────────────────────────────────

function rewriteUrls(html) {
  // framerusercontent.com (strip query params for local path)
  html = html.replace(
    /https:\/\/framerusercontent\.com\/([\w\-\/\.@,]+(?:\?[^"'\s)}<]*)?)/g,
    (match, path) => `/_deps/${path.split('?')[0]}`
  );

  // events.framer.com
  html = html.replace(
    /https:\/\/events\.framer\.com\/([\w\-\/\.@?=&]*)/g,
    (match, path) => `/_deps/events/${path.split('?')[0]}`
  );

  // framer.com/m/ (phosphor icons etc.) but NOT framer.com/edit
  html = html.replace(
    /https:\/\/framer\.com\/m\/([\w\-\/\.@,]+)/g,
    (match, path) => `/_deps/framer/m/${path}`
  );

  return html;
}

// ─── HTML cleanup ────────────────────────────────────────────────────────────

function stripCruft(html) {
  for (const pattern of STRIP_PATTERNS) {
    html = html.replace(pattern, '');
  }

  // Editor bar modulepreload
  html = html.replace(/\s*<link[^>]*href="https:\/\/framer\.com\/edit\/init\.mjs"[^>]*>\s*/g, '');

  // data-redirect-timezone
  html = html.replace(/ data-redirect-timezone="[^"]*"/, '');

  // Cloudflare Turnstile inline scripts
  html = html.replace(/\s*<script[^>]*turnstile[^>]*>[^<]*<\/script>\s*/gi, '');
  html = html.replace(/\s*<script[^>]*>[\s\S]*?turnstileLoad[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/\s*<script[^>]*>[\s\S]*?challenges\.cloudflare\.com[\s\S]*?<\/script>\s*/g, '');

  // Framer badge
  html = html.replace(/\s*<p[^>]*>Create a free website with Framer[^<]*<\/p>\s*/g, '');

  // framer.com/edit init script and iframe
  html = html.replace(/\s*<script[^>]*>[\s\S]*?framer\.com\/edit[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/\s*<iframe[^>]*framer\.com\/edit[^>]*>[\s\S]*?<\/iframe>\s*/g, '');

  return html;
}

// ─── Asset download ──────────────────────────────────────────────────────────

async function downloadAsset(url, localPath) {
  const fullPath = join(DIST, localPath);
  if (existsSync(fullPath)) return;

  mkdirSync(dirname(fullPath), { recursive: true });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    if (!res.ok) {
      console.warn(`  ⚠ ${res.status} for ${url}`);
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(fullPath, buffer);
    console.log(`  ✓ ${localPath} (${(buffer.length / 1024).toFixed(1)}KB)`);
  } catch (err) {
    console.warn(`  ⚠ Failed: ${url} — ${err.message}`);
  }
}

async function downloadCdnAsset(url) {
  const localPath = cdnUrlToLocalPath(url);
  if (!localPath) return;
  await downloadAsset(url, localPath);
}

function scanJsBundlesForAssets() {
  const jsUrls = [...assetUrls].filter(u => u.endsWith('.mjs') || u.endsWith('.js'));
  for (const url of jsUrls) {
    const localPath = cdnUrlToLocalPath(url);
    if (!localPath) continue;
    const fullPath = join(DIST, localPath);
    if (!existsSync(fullPath)) continue;
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const urlRegex = /https:\/\/framerusercontent\.com\/([\w\-\/\.@,]+)/g;
      let match;
      while ((match = urlRegex.exec(content)) !== null) {
        assetUrls.add(match[0]);
      }
    } catch { /* skip */ }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧 Framer Site Mirror — Extraction\n');
  console.log(`Output: ${DIST}\n`);

  mkdirSync(DIST, { recursive: true });

  // Step 1: Fetch all pages
  console.log('📄 Fetching pages...');
  const pageHtmls = new Map();

  for (const page of PAGES) {
    const url = `${SITE_ORIGIN}${page.path}`;
    console.log(`  Fetching ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
      });
      if (!res.ok) {
        console.warn(`  ⚠ ${res.status} for ${url}`);
        continue;
      }
      const html = await res.text();
      pageHtmls.set(page.file, html);
      console.log(`  ✓ ${page.file} (${(html.length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.warn(`  ⚠ Failed: ${url} — ${err.message}`);
    }
  }

  // Try to get 404 page
  console.log('  Fetching 404 page...');
  try {
    const res404 = await fetch(`${SITE_ORIGIN}/this-page-does-not-exist-404`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      redirect: 'manual'
    });
    if (res404.status === 200 || res404.status === 404) {
      const html404 = await res404.text();
      pageHtmls.set('404.html', html404);
      console.log(`  ✓ 404.html (${(html404.length / 1024).toFixed(0)}KB)`);
    }
  } catch { /* skip */ }

  // Step 2: Extract asset URLs
  console.log('\n🔍 Extracting asset URLs...');
  for (const [, html] of pageHtmls) {
    extractAssetUrls(html);
  }
  console.log(`  Found ${assetUrls.size} unique asset URLs`);

  // Step 3: Download all assets (batches of 10)
  console.log('\n📦 Downloading assets...');
  const urls = [...assetUrls];
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    await Promise.all(batch.map(downloadCdnAsset));
  }

  // Step 3b: Scan JS bundles for additional assets
  console.log('\n🔍 Scanning JS bundles for additional assets...');
  const beforeCount = assetUrls.size;
  scanJsBundlesForAssets();
  const newUrls = [...assetUrls].slice(beforeCount);
  if (newUrls.length > 0) {
    console.log(`  Found ${newUrls.length} additional assets in JS bundles`);
    for (let i = 0; i < newUrls.length; i += 10) {
      const batch = newUrls.slice(i, i + 10);
      await Promise.all(batch.map(downloadCdnAsset));
    }
  } else {
    console.log('  No additional assets found');
  }

  // Step 4: Download favicon and OG images
  console.log('\n🖼️  Downloading favicon & OG images...');
  const firstHtml = [...pageHtmls.values()][0] || '';
  const faviconMatch = firstHtml.match(/rel="icon"[^>]*href="([^"]+)"/);
  const ogMatch = firstHtml.match(/property="og:image"[^>]*content="([^"]+)"/);

  if (faviconMatch) {
    await downloadAsset(faviconMatch[1].replace(/&amp;/g, '&'), '/favicon.png');
  }
  if (ogMatch) {
    await downloadAsset(ogMatch[1].replace(/&amp;/g, '&'), '/og-image.png');
  }

  // Step 5: Rewrite and save HTML
  console.log('\n✏️  Rewriting HTML...');
  for (const [file, html] of pageHtmls) {
    let processed = stripCruft(html);
    processed = rewriteUrls(processed);

    const outPath = join(DIST, file);
    writeFileSync(outPath, processed, 'utf-8');
    console.log(`  ✓ ${file} (${(processed.length / 1024).toFixed(0)}KB)`);
  }

  // Summary
  console.log(`\n✅ Done!`);
  console.log(`   ${pageHtmls.size} HTML pages`);
  console.log(`   ${assetUrls.size} assets downloaded`);
  console.log(`   Output: ${DIST}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
