const fs = require('fs');

const pages = [
  'index.html',
  'about/index.html',
  'pricing/index.html',
  'features/index.html',
  'security/index.html',
  'contact/index.html',
  'resources/index.html',
  '404.html'
];

console.log('=== INSPECTING dist/client/ PAGES ===');
for (const p of pages) {
  const html = fs.readFileSync('dist/client/' + p, 'utf8');
  const hasSkip = html.includes('skip-link');
  const hasBreadcrumb = html.includes('sahyak-breadcrumb');
  const hasHeader = html.includes('sahyak-site-header');
  const hasOldBreadcrumb = html.includes('class="breadcrumb-list"');
  
  // Check if skip-link CSS is present either inline or via linked CSS
  const links = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [])
    .map(l => (l.match(/href=["']([^"']+)["']/) || [])[1]);
  
  console.log(`\nPage: ${p}`);
  console.log(`  - Has skip-link: ${hasSkip}`);
  console.log(`  - Has sahyak-breadcrumb: ${hasBreadcrumb}`);
  console.log(`  - Has OLD unstyled breadcrumb-list: ${hasOldBreadcrumb}`);
  console.log(`  - Has sahyak-site-header: ${hasHeader}`);
  console.log(`  - Linked stylesheets:`, links);
}
