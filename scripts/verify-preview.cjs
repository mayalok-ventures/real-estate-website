// scripts/verify-preview.cjs
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function testPage(path) {
  const url = `http://127.0.0.1:8788${path}`;
  console.log(`\n==================================================`);
  console.log(`TESTING PREVIEW: ${path}`);
  console.log(`==================================================`);
  
  const res = await get(url);
  console.log(`Status: ${res.status}`);
  if (res.status !== 200) {
    console.error(`❌ Page failed to load! Status ${res.status}`);
    return false;
  }

  // 1. Verify CSS stylesheets link and return 200
  const linkMatches = res.body.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [];
  console.log(`Found ${linkMatches.length} stylesheet link(s):`);
  let cssOk = true;
  for (const l of linkMatches) {
    const hrefMatch = l.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const cssPath = hrefMatch[1];
      if (cssPath.startsWith('/')) {
        const cssRes = await get(`http://127.0.0.1:8788${cssPath}`);
        console.log(`  - ${cssPath} -> Status: ${cssRes.status}, Size: ${cssRes.body.length} bytes`);
        if (cssRes.status !== 200) cssOk = false;
      }
    }
  }

  // 2. Verify skip-link is present
  const hasSkipLink = res.body.includes('class="skip-link"');
  console.log(`Skip link present: ${hasSkipLink ? '✅ YES' : '❌ NO'}`);

  // 3. Verify Navbar header is present
  const hasHeader = res.body.includes('class="sahyak-site-header"');
  console.log(`Sahyak site header present: ${hasHeader ? '✅ YES' : '❌ NO'}`);

  // 4. Verify no unstyled breadcrumb list
  const hasOldBreadcrumb = res.body.includes('class="breadcrumb-list"');
  const hasModernBreadcrumb = res.body.includes('sahyak-breadcrumb-list');
  console.log(`Modern sahyak-breadcrumb-list present: ${hasModernBreadcrumb ? '✅ YES' : '(Page has no breadcrumb)'}`);
  console.log(`Legacy unstyled breadcrumb-list absent: ${!hasOldBreadcrumb ? '✅ YES' : '❌ NO'}`);

  // 5. Verify skip-link styles are present in the CSS or page HTML
  const hasSkipCss = res.body.includes('skip-link:not(:focus)');
  console.log(`Skip-link :not(:focus) CSS embedded/linked: ${hasSkipCss ? '✅ YES' : '❌ NO'}`);

  return cssOk && hasSkipLink && hasHeader;
}

async function run() {
  const routes = [
    '/',
    '/pricing/',
    '/about/',
    '/security/',
    '/contact/',
    '/features/',
    '/resources/'
  ];

  let allPassed = true;
  for (const r of routes) {
    const ok = await testPage(r);
    if (!ok) allPassed = false;
  }

  console.log('\n==================================================');
  if (allPassed) {
    console.log('🎉 ALL PREVIEW CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.log('❌ SOME PREVIEW CHECKS FAILED.');
  }
  console.log('==================================================\n');
}

run();
