// tests/navigation-skip-link.test.mjs
// Regression Test Suite: Header Navigation Layout & Accessible Skip-Link Rules

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PREVIEW_BASE = 'http://127.0.0.1:8788';
const DIST_DIR = path.resolve(process.cwd(), '.vercel/output/static');

const pages = [
  { route: '/', file: 'index.html', title: 'Home' },
  { route: '/about/', file: 'about/index.html', title: 'About' },
  { route: '/pricing/', file: 'pricing/index.html', title: 'Pricing' },
  { route: '/features/', file: 'features/index.html', title: 'Features' },
  { route: '/security/', file: 'security/index.html', title: 'Security' },
  { route: '/contact/', file: 'contact/index.html', title: 'Contact' },
  { route: '/resources/', file: 'resources/index.html', title: 'Resources' },
  { route: '/404.html', file: '404.html', title: '404' }
];

test('1. Skip Link: visually hidden off-screen by default across all pages', () => {
  // Read Navbar CSS bundle
  const astroDir = path.join(DIST_DIR, '_astro');
  const cssFiles = fs.readdirSync(astroDir).filter(f => f.startsWith('Navbar.') && f.endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'Navbar CSS bundle must exist in output');
  
  const navbarCss = fs.readFileSync(path.join(astroDir, cssFiles[0]), 'utf8');
  
  // Verify standard accessible clip rect rule
  assert.match(navbarCss, /\.skip-link:not\(:focus\):not\(:focus-visible\)/, 'Must have :not(:focus) selector');
  assert.match(navbarCss, /clip:rect\(0,\s*0,\s*0,\s*0\)!important/, 'Must clip to 0x0 off-screen');
  assert.match(navbarCss, /width:1px!important/, 'Must be 1px width');
  assert.match(navbarCss, /height:1px!important/, 'Must be 1px height');
  assert.match(navbarCss, /overflow:hidden!important/, 'Must have overflow hidden');
  assert.match(navbarCss, /position:absolute!important/, 'Must have position absolute');
});

test('2. Skip Link: becomes prominently visible and styled upon keyboard focus', () => {
  const astroDir = path.join(DIST_DIR, '_astro');
  const cssFiles = fs.readdirSync(astroDir).filter(f => f.startsWith('Navbar.') && f.endsWith('.css'));
  const navbarCss = fs.readFileSync(path.join(astroDir, cssFiles[0]), 'utf8');

  assert.match(navbarCss, /\.skip-link:focus,\.skip-link:focus-visible/, 'Must style focus and focus-visible');
  assert.match(navbarCss, /clip:auto!important/, 'Must unclip upon focus');
  assert.match(navbarCss, /position:fixed!important/, 'Must fix position at top upon focus');
  assert.match(navbarCss, /z-index:1000000!important/, 'Must have high z-index above header');
  assert.match(navbarCss, /background:#4ade80!important/, 'Must have brand green background');
  assert.match(navbarCss, /color:#0a1c16!important/, 'Must have high contrast dark text');
});

test('3. Skip Link: target #main-content exists on every page', () => {
  for (const p of pages) {
    const filePath = path.join(DIST_DIR, p.file);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    
    assert.ok(html.includes('href="#main-content"'), `Page ${p.title} must have skip link pointing to #main-content`);
    assert.ok(html.includes('id="main-content"'), `Page ${p.title} must have target element with id="main-content"`);
  }
});

test('4. Breadcrumb: lists are styled flex-row with NO decimal numbering or bullets', () => {
  for (const p of pages) {
    const filePath = path.join(DIST_DIR, p.file);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Check for legacy unstyled breadcrumb list
    assert.ok(!html.includes('class="breadcrumb-list"'), `Page ${p.title} must not contain legacy unstyled breadcrumb-list`);
    
    if (html.includes('sahyak-breadcrumb-list')) {
      // Must contain global flex & list-style reset
      assert.ok(html.includes('list-style:none!important'), `Page ${p.title} must enforce list-style: none !important on breadcrumb`);
      assert.ok(html.includes('display:flex!important'), `Page ${p.title} must enforce display: flex !important on breadcrumb`);
    }
  }
});

test('5. Header Navigation: desktop flex layout and mobile responsive hamburger', () => {
  const astroDir = path.join(DIST_DIR, '_astro');
  const cssFiles = fs.readdirSync(astroDir).filter(f => f.startsWith('Navbar.') && f.endsWith('.css'));
  const navbarCss = fs.readFileSync(path.join(astroDir, cssFiles[0]), 'utf8');

  // Verify desktop navigation display
  assert.match(navbarCss, /@media\s*\((min-width:\s*980px|width\s*>=\s*980px)\)/, 'Must have 980px desktop breakpoint');
  assert.match(navbarCss, /\.sahyak-site-nav.*display:\s*none/, 'Must hide desktop nav on mobile by default');
  assert.match(navbarCss, /\.sahyak-mobile-hamburger.*display:\s*flex/, 'Must display hamburger button on mobile');
  assert.match(navbarCss, /\.sahyak-mobile-nav-drawer.*\.open.*display:\s*flex/, 'Drawer must open as flex container');
});

test('6. Shared Stylesheets: every page links /css/tailwind.css and Navbar CSS bundle', () => {
  for (const p of pages) {
    const filePath = path.join(DIST_DIR, p.file);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');

    assert.ok(html.includes('href="/css/tailwind.css"'), `Page ${p.title} must link /css/tailwind.css`);
    assert.match(html, /href="\/_astro\/Navbar\.[A-Za-z0-9_-]+\.css"/, `Page ${p.title} must link Navbar CSS`);
  }
});

test('7. Preview Server Integration: all routes and stylesheets return 200 OK', async () => {
  for (const p of pages) {
    if (p.file === '404.html') continue;
    const res = await fetch(`${PREVIEW_BASE}${p.route}`);
    assert.strictEqual(res.status, 200, `Preview server must serve ${p.route} with 200 OK`);
    
    // Check that linked stylesheets also return 200
    const html = await res.text();
    const links = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [])
      .map(l => (l.match(/href=["']([^"']+)["']/) || [])[1])
      .filter(Boolean);

    for (const link of links) {
      if (link.startsWith('/')) {
        const cssRes = await fetch(`${PREVIEW_BASE}${link}`);
        assert.strictEqual(cssRes.status, 200, `Stylesheet ${link} must return 200 on preview server`);
      }
    }
  }
});
