async function run() {
  const url = 'https://15da5be8.mobile-crm-website.pages.dev/security/';
  const r = await fetch(url);
  const text = await r.text();
  const cssMatches = Array.from(text.matchAll(/href="([^"]+\.css[^"]*)"/g)).map(m => m[1]);
  console.log('CSS Matches on Cloudflare Preview:', cssMatches);
  for (const c of cssMatches) {
    const full = c.startsWith('http') ? c : 'https://15da5be8.mobile-crm-website.pages.dev' + c;
    const res = await fetch(full);
    const cssText = await res.text();
    console.log(`\nURL: ${c} (status ${res.status}, length ${cssText.length})`);
    if (cssText.includes('skip-link')) {
      console.log('  -> HAS skip-link rules:');
      const idx = cssText.indexOf('.skip-link');
      console.log('     ', cssText.slice(idx, idx + 400));
    }
    if (cssText.includes('breadcrumb')) {
      console.log('  -> HAS breadcrumb rules:');
      const idx = cssText.indexOf('breadcrumb');
      console.log('     ', cssText.slice(idx, idx + 400));
    }
  }
}
run();
