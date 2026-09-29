async function testStyles() {
  const r = await fetch('http://localhost:4321/security');
  const text = await r.text();
  const cssMatches = Array.from(text.matchAll(/href="([^"]+\.css[^"]*)"/g)).map(m => m[1]);
  console.log('Linked stylesheets:', cssMatches);
  const inlineStyles = text.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  console.log('Inline styles count:', inlineStyles.length);
  for (const s of inlineStyles) {
    if (s.includes('skip-link')) console.log('Found skip-link in inline style:', s);
    if (s.includes('breadcrumb')) console.log('Found breadcrumb in inline style:', s);
  }

  // Also check if /css/tailwind.css is requested or loaded
  for (const cssUrl of cssMatches) {
    const fullUrl = cssUrl.startsWith('http') ? cssUrl : `http://localhost:4321${cssUrl}`;
    const cssRes = await fetch(fullUrl);
    const cssText = await cssRes.text();
    console.log(`CSS ${cssUrl}: status ${cssRes.status}, length ${cssText.length}`);
    if (cssText.includes('.skip-link')) {
      console.log(`  -> contains .skip-link`);
    }
    if (cssText.includes('breadcrumb')) {
      console.log(`  -> contains breadcrumb`);
    }
  }
}
testStyles();
