// scripts/inspect-prod.cjs
const https = require('https');

async function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  const urls = [
    'https://sahyak.com/',
    'https://sahyak.com/pricing/',
    'https://sahyak.com/security/'
  ];

  for (const u of urls) {
    console.log(`\n========================================`);
    console.log(`FETCHING: ${u}`);
    console.log(`========================================`);
    try {
      const res = await get(u);
      console.log('Status:', res.status);
      console.log('Content Length:', res.body.length);
      console.log('CF-Ray:', res.headers['cf-ray']);
      console.log('Age:', res.headers['age']);
      
      // Look for stylesheets
      const linkMatches = res.body.match(/<link[^>]+>/gi) || [];
      const cssLinks = linkMatches.filter(l => l.includes('stylesheet') || l.includes('.css'));
      console.log('CSS Links in HTML:');
      for (const cl of cssLinks) console.log('  ', cl);

      // Check if CSS link returns 200 or 404
      for (const cl of cssLinks) {
        const hrefMatch = cl.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          let cssUrl = hrefMatch[1];
          if (cssUrl.startsWith('/')) cssUrl = 'https://sahyak.com' + cssUrl;
          if (cssUrl.startsWith('http')) {
            const cssRes = await get(cssUrl);
            console.log(`  -> Checked CSS: ${cssUrl} -> Status: ${cssRes.status}, Size: ${cssRes.body.length} bytes`);
          }
        }
      }

      // Check skip-link
      const skipMatch = res.body.match(/<a[^>]+class=["'][^"']*skip[^"']*["'][^>]*>[\s\S]*?<\/a>/gi);
      console.log('Skip link matches:', skipMatch);

      // Check nav / header / list
      const navMatches = res.body.match(/<header[\s\S]*?<\/header>/gi) || [];
      console.log('Header match length:', navMatches.length);
      if (navMatches[0]) {
        console.log('Header sample (first 400 chars):');
        console.log(navMatches[0].slice(0, 400));
      }

      // Check for <ol> or <ul> in nav
      const olMatches = res.body.match(/<ol[\s\S]*?<\/ol>/gi) || [];
      console.log('OL tags count:', olMatches.length);
      for (const ol of olMatches) {
        console.log('  OL sample:', ol.slice(0, 200));
      }

    } catch (e) {
      console.error('Error fetching:', e.message);
    }
  }
}

run();
