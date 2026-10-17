import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

console.log('====================================================');
console.log('SAHYAK CRM - COMPREHENSIVE SEO VALIDATION SUITE');
console.log('====================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✓ ${message}`);
  } else {
    failedChecks++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// 1. Validate sitemap.xml
console.log('[1/5] Validating sitemap.xml & Canonical URL Coverage...');
const sitemapPath = path.join(rootDir, 'public', 'sitemap.xml');
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists');

const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const locMatches = [...sitemapContent.matchAll(/<loc>(https:\/\/sahyak\.com[^<]+)<\/loc>/g)].map(m => m[1]);

console.log(`  Found ${locMatches.length} URLs in sitemap.xml`);
assert(locMatches.length >= 21, `Sitemap has complete indexable coverage (found ${locMatches.length} >= 21 URLs)`);

// Ensure all URLs end with trailing slash (except domain root itself)
locMatches.forEach(url => {
  assert(url.endsWith('/'), `Sitemap URL has trailing slash: ${url}`);
});

// 2. Validate Page Source Files and Metadata Uniqueness
console.log('\n[2/5] Validating Page Templates, Titles, Descriptions & Schemas...');
const titles = new Map();
const descriptions = new Map();
const canonicals = new Map();

// Map sitemap URL path to src/pages file path
function urlToFilePath(url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  if (pathname === '/') return path.join(rootDir, 'src', 'pages', 'index.astro');
  
  const clean = pathname.replace(/^\/|\/$/g, '');
  
  // Try direct .astro file: e.g. features -> src/pages/features.astro
  const directFile = path.join(rootDir, 'src', 'pages', `${clean}.astro`);
  if (fs.existsSync(directFile)) return directFile;
  
  // Try subfolder index or direct: e.g. solutions/real-estate-lead-management -> src/pages/solutions/real-estate-lead-management.astro
  const subFile = path.join(rootDir, 'src', 'pages', `${clean}.astro`);
  if (fs.existsSync(subFile)) return subFile;

  // Try folder/index.astro
  const indexFile = path.join(rootDir, 'src', 'pages', clean, 'index.astro');
  if (fs.existsSync(indexFile)) return indexFile;

  return null;
}

for (const url of locMatches) {
  const filePath = urlToFilePath(url);
  assert(filePath !== null && fs.existsSync(filePath), `Route file exists for URL: ${url}`);

  if (filePath && fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract title (supports title="...", seoTitle = "...", <title>...)
    const titleMatch = content.match(/seoTitle\s*=\s*["'`]([^"'`]+)["'`]/) ||
                       content.match(/title\s*=\s*["'`]([^"'`]+)["'`]/) ||
                       content.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : null;
    assert(title && title.length > 10, `Valid descriptive title present for ${url} ("${title ? title.slice(0, 45) : 'MISSING'}...")`);
    
    if (title) {
      if (titles.has(title)) {
        assert(false, `Duplicate title detected: "${title}" across ${url} and ${titles.get(title)}`);
      } else {
        titles.set(title, url);
      }
    }

    // Extract meta description
    const descMatch = content.match(/seoDesc\s*=\s*["'`]([^"'`]+)["'`]/) ||
                      content.match(/description\s*=\s*["'`]([^"'`]+)["'`]/) ||
                      content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/);
    const desc = descMatch ? descMatch[1].trim() : null;
    assert(desc && desc.length > 30, `Valid descriptive meta description for ${url} (${desc ? desc.length : 0} chars)`);

    if (desc) {
      if (descriptions.has(desc)) {
        assert(false, `Duplicate meta description across ${url} and ${descriptions.get(desc)}`);
      } else {
        descriptions.set(desc, url);
      }
    }

    // Check for deceptive aggregateRating schema
    assert(!content.includes('"aggregateRating"') && !content.includes("'aggregateRating'"), `Zero deceptive aggregateRating schema in ${path.basename(filePath)}`);
  }
}

// 3. Validate Consolidated Redirects
console.log('\n[3/5] Validating 301 Consolidation Redirects...');
const redirectsPath = path.join(rootDir, 'public', '_redirects');
assert(fs.existsSync(redirectsPath), 'public/_redirects exists');

const redirectsContent = fs.readFileSync(redirectsPath, 'utf8');
const redirectLines = redirectsContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));

for (const line of redirectLines) {
  const parts = line.trim().split(/\s+/);
  if (parts.length >= 3 && parts[2] === '301') {
    const [from, to] = parts;
    assert(to.endsWith('/'), `Redirect target has consistent trailing slash: ${from} -> ${to}`);
    
    // Verify target URL exists in our route collection
    const targetUrl = `https://sahyak.com${to}`;
    const targetExists = locMatches.includes(targetUrl);
    assert(targetExists, `Redirect destination exists in sitemap: ${to}`);
  }
}

// 4. Validate robots.txt
console.log('\n[4/5] Validating robots.txt...');
const robotsPath = path.join(rootDir, 'public', 'robots.txt');
assert(fs.existsSync(robotsPath), 'robots.txt exists');
const robotsContent = fs.readFileSync(robotsPath, 'utf8');

assert(robotsContent.includes('Disallow: /admin/'), 'robots.txt protects /admin/');
assert(robotsContent.includes('Disallow: /api/'), 'robots.txt protects /api/');
assert(robotsContent.includes('Sitemap: https://sahyak.com/sitemap.xml'), 'robots.txt references canonical sitemap.xml');

// 5. Layout Schema Audit
console.log('\n[5/5] Auditing Global Layout Schema...');
const layoutPath = path.join(rootDir, 'src', 'layouts', 'Layout.astro');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(!layoutContent.includes('aggregateRating'), 'Layout.astro has zero synthetic aggregateRating schema');
assert(layoutContent.includes('Organization'), 'Layout.astro contains valid Organization schema');

console.log('\n====================================================');
console.log(`VALIDATION RESULT: ${passedChecks} Passed, ${failedChecks} Failed (Total ${totalChecks} Checks)`);
console.log('====================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  console.log('✓ ALL TECHNICAL SEO CHECKS PASSED PERFECTLY!\n');
  process.exit(0);
}
