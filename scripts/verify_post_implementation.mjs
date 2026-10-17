import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const staticDir = path.join(rootDir, '.vercel', 'output', 'static');

console.log('================================================================');
console.log('SAHYAK CRM — INDEPENDENT POST-IMPLEMENTATION VERIFICATION SUITE');
console.log('================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✓ ${message}`);
  } else {
    failedChecks++;
    failures.push(message);
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// 21 Canonical URLs expected from SEO_KEYWORD_PAGE_MAP.md
const expectedCanonicalUrls = [
  'https://sahyak.com/',
  'https://sahyak.com/features/',
  'https://sahyak.com/pricing/',
  'https://sahyak.com/solutions/real-estate-lead-management/',
  'https://sahyak.com/solutions/real-estate-whatsapp-crm/',
  'https://sahyak.com/solutions/real-estate-sales-pipeline/',
  'https://sahyak.com/solutions/property-inventory-management/',
  'https://sahyak.com/solutions/site-visit-management/',
  'https://sahyak.com/industry/real-estate-brokers/',
  'https://sahyak.com/industry/property-developers/',
  'https://sahyak.com/tools/real-estate-crm-roi-calculator/',
  'https://sahyak.com/tools/lead-response-time-calculator/',
  'https://sahyak.com/tools/real-estate-crm-migration-checklist/',
  'https://sahyak.com/compare/real-estate-crm-vs-excel/',
  'https://sahyak.com/resources/best-real-estate-crm-india/',
  'https://sahyak.com/resources/',
  'https://sahyak.com/security/',
  'https://sahyak.com/about/',
  'https://sahyak.com/contact/',
  'https://sahyak.com/privacy/',
  'https://sahyak.com/terms/'
];

// Helper to convert canonical URL to expected HTML file path in .vercel/output/static
function canonicalToHtmlPath(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/') return path.join(staticDir, 'index.html');
  const clean = pathname.replace(/^\/|\/$/g, '');
  return path.join(staticDir, clean, 'index.html');
}

// 1. VERIFY PRERENDERED HTML ARTIFACTS
console.log('[1/5] Verifying 21 Prerendered HTML Artifacts in .vercel/output/static...');
assert(fs.existsSync(staticDir), '.vercel/output/static directory exists');

const observedTitles = new Map();
const observedDescriptions = new Map();
const allInternalLinks = new Set();
const pageData = [];

for (const url of expectedCanonicalUrls) {
  const htmlPath = canonicalToHtmlPath(url);
  const exists = fs.existsSync(htmlPath);
  assert(exists, `HTML artifact exists: ${path.relative(rootDir, htmlPath)}`);

  if (exists) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const fileSize = fs.statSync(htmlPath).size;
    assert(fileSize > 1000, `HTML artifact has substantial content (${fileSize} bytes)`);

    // Title tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    assert(title !== null && title.length > 15, `Title present for ${url} ("${title ? title.slice(0, 50) : ''}...")`);
    if (title) {
      if (observedTitles.has(title)) {
        assert(false, `Duplicate title detected: "${title}" across ${url} and ${observedTitles.get(title)}`);
      } else {
        observedTitles.set(title, url);
      }
    }

    // Meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    const desc = descMatch ? descMatch[1].trim() : null;
    assert(desc !== null && desc.length >= 40, `Meta description present for ${url} (${desc ? desc.length : 0} chars)`);
    if (desc) {
      if (observedDescriptions.has(desc)) {
        assert(false, `Duplicate description across ${url} and ${observedDescriptions.get(desc)}`);
      } else {
        observedDescriptions.set(desc, url);
      }
    }

    // Canonical tag
    const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    const canonical = canonicalMatch ? canonicalMatch[1].trim() : null;
    assert(canonical === url, `Canonical tag strictly matches URL: expected "${url}", got "${canonical}"`);

    // H1 check
    const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
    assert(h1Matches.length === 1, `Single H1 tag present on ${url} (found ${h1Matches.length})`);

    // Robots meta tag
    const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
    const robotsContent = robotsMatch ? robotsMatch[1].toLowerCase() : '';
    assert(robotsContent.includes('index') && robotsContent.includes('follow'), `Robots permits index, follow on ${url}`);

    // Structured data JSON-LD parse check
    const jsonLdBlocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    assert(jsonLdBlocks.length > 0, `Structured data JSON-LD present on ${url} (${jsonLdBlocks.length} block(s))`);

    for (const [_, jsonStr] of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(jsonStr.trim());
        assert(parsed !== null, `JSON-LD parses cleanly as valid JSON on ${url}`);
        
        // Assert no deceptive fake aggregateRating schema
        const stringified = JSON.stringify(parsed);
        assert(!stringified.includes('aggregateRating'), `Zero deceptive aggregateRating schema in ${url}`);
      } catch (err) {
        assert(false, `JSON-LD parse error on ${url}: ${err.message}`);
      }
    }

    // Extract all internal links from HTML for site-wide crawl validation
    const linkMatches = [...html.matchAll(/<a\s+[^>]*href=["']([^"'#]+)(#[^"']*)?["']/gi)];
    for (const [_, href] of linkMatches) {
      if (href.startsWith('/') && !href.startsWith('//')) {
        allInternalLinks.add(href);
      }
    }

    pageData.push({ url, title, desc, fileSize, h1Count: h1Matches.length });
  }
}

// 2. VERIFY INTERNAL LINK CRAWL PATHS (ZERO BROKEN LINKS)
console.log('\n[2/5] Crawling All Extracted Internal Links Across Prerendered HTML...');
console.log(`  Found ${allInternalLinks.size} unique internal link paths across the 21 prerendered pages.`);

// Read _redirects to resolve legitimate redirect targets
const redirectsPath = path.join(staticDir, '_redirects');
assert(fs.existsSync(redirectsPath), '.vercel/output/static/_redirects exists');
const redirectsMap = new Map();

if (fs.existsSync(redirectsPath)) {
  const lines = fs.readFileSync(redirectsPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [from, to] = trimmed.split(/\s+/);
      redirectsMap.set(from, to);
    }
  }
}

for (const link of allInternalLinks) {
  // Ignore admin/api/login links that are intentionally dynamic SSR
  if (link.startsWith('/admin') || link.startsWith('/api') || link === '/login') {
    assert(true, `Dynamic/Admin link skipped: ${link}`);
    continue;
  }

  const cleanPath = link.split('?')[0];

  // Check if link exists as static HTML or static asset (e.g. sitemap.xml)
  let staticExists = false;
  if (cleanPath === '/') {
    staticExists = fs.existsSync(path.join(staticDir, 'index.html'));
  } else if (cleanPath.endsWith('/')) {
    staticExists = fs.existsSync(path.join(staticDir, cleanPath.slice(1, -1), 'index.html'));
  } else {
    const directFile = path.join(staticDir, cleanPath.slice(1));
    const directHtml = path.join(staticDir, `${cleanPath.slice(1)}.html`);
    staticExists = fs.existsSync(directFile) || fs.existsSync(directHtml);
  }

  const redirectTarget = redirectsMap.get(cleanPath);
  const isValid = staticExists || (redirectTarget !== undefined);
  assert(isValid, `Internal link target valid: ${link}${redirectTarget ? ` (301 -> ${redirectTarget})` : ''}`);
}

// 3. VERIFY REDIRECT GRAPH INTEGRITY (NO CHAINS, NO LOOPS)
console.log('\n[3/5] Verifying 301 Redirect Graph (Zero Chains, Zero Loops)...');
for (const [from, to] of redirectsMap.entries()) {
  // Ensure target ends with trailing slash
  assert(to.endsWith('/'), `Redirect target has trailing slash: ${from} -> ${to}`);
  
  // Ensure target is NOT itself redirected (no 2-hop chains)
  assert(!redirectsMap.has(to), `Redirect target is final canonical (no multi-hop chains): ${from} -> ${to}`);
  
  // Ensure destination exists in our static directory
  const destHtml = to === '/' 
    ? path.join(staticDir, 'index.html')
    : path.join(staticDir, to.slice(1, -1), 'index.html');
  assert(fs.existsSync(destHtml), `Redirect destination exists in build: ${to}`);
}

// 4. VERIFY SITEMAP & ROBOTS.TXT
console.log('\n[4/5] Verifying sitemap.xml & robots.txt Alignment...');
const sitemapPath = path.join(staticDir, 'sitemap.xml');
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists in output');

const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const sitemapUrls = [...sitemapContent.matchAll(/<loc>(https:\/\/sahyak\.com[^<]+)<\/loc>/g)].map(m => m[1]);

assert(sitemapUrls.length === 21, `sitemap.xml contains exact 21 indexable URLs (found ${sitemapUrls.length})`);

for (const expected of expectedCanonicalUrls) {
  assert(sitemapUrls.includes(expected), `sitemap.xml includes expected canonical: ${expected}`);
}

// Ensure no admin or api routes leaked into sitemap
const hasPrivateRoutes = sitemapUrls.some(u => u.includes('/admin') || u.includes('/api'));
assert(!hasPrivateRoutes, 'sitemap.xml contains zero private/admin/api routes');

// Robots.txt
const robotsPath = path.join(staticDir, 'robots.txt');
assert(fs.existsSync(robotsPath), 'robots.txt exists in output');
const robotsContent = fs.readFileSync(robotsPath, 'utf8');
assert(robotsContent.includes('Disallow: /admin/'), 'robots.txt disallows /admin/');
assert(robotsContent.includes('Disallow: /api/'), 'robots.txt disallows /api/');
assert(robotsContent.includes('Sitemap: https://sahyak.com/sitemap.xml'), 'robots.txt references sitemap.xml');

// 5. LIVE WEBSITE READ-ONLY CHECK & RECONCILIATION
console.log('\n[5/5] Performing Safe Read-Only Verification of Current Live Website...');
try {
  const liveRes = await fetch('https://sahyak.com/', { method: 'HEAD', redirect: 'manual' });
  console.log(`  Live https://sahyak.com/ HEAD HTTP status: ${liveRes.status}`);
  console.log(`  Live Cloudflare server header: ${liveRes.headers.get('server') || 'N/A'}`);
  console.log(`  Live Content-Type: ${liveRes.headers.get('content-type') || 'N/A'}`);
  assert(liveRes.status === 200 || liveRes.status === 301, 'Live root responds with HTTP 200 or 301');

  // Test live status of one restored route to document pre-deployment vs local build difference
  const testRestoredUrl = 'https://sahyak.com/tools/real-estate-crm-roi-calculator/';
  const restoredRes = await fetch(testRestoredUrl, { method: 'HEAD', redirect: 'manual' });
  console.log(`  Live ${testRestoredUrl} status: ${restoredRes.status} (Pre-deployment state on remote edge)`);
} catch (fetchErr) {
  console.log(`  Live check note (offline or network restricted): ${fetchErr.message}`);
}

console.log('\n================================================================');
console.log(`POST-IMPLEMENTATION AUDIT SUMMARY:`);
console.log(`Total Checks Executed : ${totalChecks}`);
console.log(`Checks Passed         : ${passedChecks}`);
console.log(`Checks Failed         : ${failedChecks}`);
console.log('================================================================\n');

if (failedChecks > 0) {
  console.error('FAILURES DETECTED:');
  failures.forEach(f => console.error(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('✓ POST-IMPLEMENTATION VERIFICATION FULLY PASSED WITH 0 FAILURES!\n');
  process.exitCode = 0;
}
