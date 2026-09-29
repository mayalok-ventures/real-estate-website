const routes = ['/', '/features/', '/about/', '/pricing/', '/resources/', '/security/', '/contact/'];

async function run() {
  for (const route of routes) {
    const url = 'https://sahyak.com' + route;
    try {
      const res = await fetch(url);
      const text = await res.text();
      const hasTailwind = text.includes('/css/tailwind.css');
      const hasBreadcrumbList = text.includes('breadcrumb-list');
      const hasSahyakBreadcrumb = text.includes('sahyak-breadcrumb');
      const hasSkipLink = text.includes('skip-link');
      const cssMatches = Array.from(text.matchAll(/href="([^"]+\.css[^"]*)"/g)).map(m => m[1]);
      console.log(`\nURL: ${url}`);
      console.log(`- hasTailwind (/css/tailwind.css): ${hasTailwind}`);
      console.log(`- hasBreadcrumbList: ${hasBreadcrumbList}`);
      console.log(`- hasSahyakBreadcrumb: ${hasSahyakBreadcrumb}`);
      console.log(`- hasSkipLink: ${hasSkipLink}`);
      console.log(`- cssMatches:`, cssMatches);
    } catch (e) {
      console.error(url, e.message);
    }
  }
}

run();
