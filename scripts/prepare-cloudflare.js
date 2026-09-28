import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const distClient = path.join(rootDir, 'dist', 'client');
const distServer = path.join(rootDir, 'dist', 'server');
const vercelStatic = path.join(rootDir, '.vercel', 'output', 'static');

console.log('[prepare-cloudflare] Synchronizing build output for Cloudflare Pages...');

// Ensure target directory exists
fs.mkdirSync(vercelStatic, { recursive: true });

// Copy all static client assets into .vercel/output/static
if (fs.existsSync(distClient)) {
  fs.cpSync(distClient, vercelStatic, { recursive: true });
  console.log('[prepare-cloudflare] Copied dist/client -> .vercel/output/static');
}

// Copy server entrypoint and chunks so Cloudflare Pages SSR functions execute
if (fs.existsSync(distServer)) {
  const entryPath = path.join(distServer, 'entry.mjs');
  const chunksPath = path.join(distServer, 'chunks');

  // Copy chunks directory
  if (fs.existsSync(chunksPath)) {
    fs.cpSync(chunksPath, path.join(vercelStatic, 'chunks'), { recursive: true });
    // Also copy inside _worker.js directory structure for compatibility
    fs.mkdirSync(path.join(vercelStatic, '_worker.js'), { recursive: true });
    fs.cpSync(chunksPath, path.join(vercelStatic, '_worker.js', 'chunks'), { recursive: true });
  }

  // Create _worker.js at root of output
  if (fs.existsSync(entryPath)) {
    fs.copyFileSync(entryPath, path.join(vercelStatic, '_worker.js', 'index.js'));
    // Also copy as standalone _worker.js
    fs.copyFileSync(entryPath, path.join(vercelStatic, '_worker.js.entry.js'));
  }

  console.log('[prepare-cloudflare] Configured _worker.js for Cloudflare Pages SSR');
}

console.log('[prepare-cloudflare] Output directory .vercel/output/static is ready!');
