// scripts/sync-secrets.cjs
// Securely uploads configured credentials from .env to Cloudflare Secrets
// Handles multiline RSA private keys safely via stdin without exposing values.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('==========================================================');
console.log('  Sahyak CRM — Cloudflare Secrets Synchronizer');
console.log('==========================================================');

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('\n❌ Error: .env file not found.');
  process.exit(1);
}

// 1. Check Wrangler authentication
console.log('\n[1/2] Checking Wrangler authentication...');
const whoami = spawnSync('npx', ['wrangler', 'whoami'], {
  shell: true,
  encoding: 'utf8'
});

if (whoami.stdout && whoami.stdout.includes('You are not authenticated')) {
  console.log('Wrangler is not authenticated. Please log in:');
  spawnSync('npx', ['wrangler', 'login'], { shell: true, stdio: 'inherit' });
} else {
  console.log('✓ Wrangler is authenticated.');
}

// 2. Parse .env safely (handling multiline quoted values like RSA private keys)
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split(/\r?\n/);
const envVars = {};
let currentKey = null;
let currentVal = '';
let inQuotes = false;
let quoteChar = '';

for (const line of lines) {
  if (!inQuotes) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (val.startsWith('"') || val.startsWith("'")) {
        quoteChar = val[0];
        if (val.endsWith(quoteChar) && val.length > 1) {
          envVars[key] = val.slice(1, -1);
        } else {
          inQuotes = true;
          currentKey = key;
          currentVal = val.slice(1) + '\n';
        }
      } else {
        envVars[key] = val;
      }
    }
  } else {
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(quoteChar)) {
      currentVal += trimmed.slice(0, -1);
      if (currentKey) envVars[currentKey] = currentVal;
      inQuotes = false;
      currentKey = null;
      currentVal = '';
    } else {
      currentVal += line + '\n';
    }
  }
}

// Target secrets to synchronize
const targetSecrets = [
  'ADMIN_SECRET',
  'ADMIN_SESSION_SECRET',
  'ADMIN_EMAILS',
  'GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL',
  'GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY',
  'GOOGLE_SEARCH_CONSOLE_SITE_URL'
];

// Fallback: if ADMIN_SESSION_SECRET is absent, use ADMIN_SECRET
if (!envVars.ADMIN_SESSION_SECRET && envVars.ADMIN_SECRET) {
  envVars.ADMIN_SESSION_SECRET = envVars.ADMIN_SECRET;
}

console.log('\n[2/2] Synchronizing secrets to Cloudflare Pages (mobile-crm-website)...');

const projectName = 'mobile-crm-website';

for (const secretKey of targetSecrets) {
  const secretValue = envVars[secretKey];
  if (!secretValue) {
    console.log(`  - Skipping ${secretKey} (not configured in .env)`);
    continue;
  }

  process.stdout.write(`  -> Uploading ${secretKey} ... `);

  const res = spawnSync('npx', ['wrangler', 'pages', 'secret', 'put', secretKey, '--project-name', projectName], {
    input: secretValue,
    shell: true,
    encoding: 'utf8'
  });

  if (res.status === 0) {
    console.log('✅ OK');
  } else {
    console.log('❌ FAILED');
    if (res.stderr) console.error('     ' + res.stderr.trim());
  }
}

console.log('\n✨ Cloudflare Secrets synchronization complete!\n');
