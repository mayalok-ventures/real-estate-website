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

console.log('--- CSS LINKS IN dist/client/ ---');
for (const p of pages) {
  const filePath = 'dist/client/' + p;
  if (fs.existsSync(filePath)) {
    const html = fs.readFileSync(filePath, 'utf8');
    const links = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [])
      .map(l => (l.match(/href=["']([^"']+)["']/) || [])[1]);
    console.log(p.padEnd(25), '->', links);
  }
}
