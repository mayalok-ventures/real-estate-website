// tests/navbar-active-state.test.mjs
// Verification Suite: Navbar Active-State Indicator, Trailing Slashes, Parent/Nested Routes & A11y

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), '.vercel/output/static');

function readHtml(relPath) {
  const filePath = path.join(DIST_DIR, relPath);
  assert.ok(fs.existsSync(filePath), `HTML file must exist: ${relPath}`);
  return fs.readFileSync(filePath, 'utf8');
}

test('1. Homepage: Home link is active with aria-current="page", others inactive', () => {
  const html = readHtml('index.html');
  
  // Desktop Home
  assert.match(html, /<a[^>]+href="\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"/);
  // Desktop Features must NOT be active
  assert.doesNotMatch(html, /<a[^>]+href="\/features\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active/);
  // Mobile Home
  assert.match(html, /<a[^>]+href="\/"[^>]+class="[^"]*sahyak-drawer-link[^"]*active[^"]*"[^>]*aria-current="page"/);
});

test('2. Core Pages: Features, Pricing, About, Contact, Resources, Security have active state and aria-current="page"', () => {
  const coreCases = [
    { file: 'features/index.html', href: '/features/', cat: 'features' },
    { file: 'pricing/index.html', href: '/pricing/', cat: 'pricing' },
    { file: 'about/index.html', href: '/about/', cat: 'about' },
    { file: 'contact/index.html', href: '/contact/', cat: 'contact' },
    { file: 'resources/index.html', href: '/resources/', cat: 'resources' },
    { file: 'security/index.html', href: '/security/', cat: 'security' },
  ];

  for (const c of coreCases) {
    const html = readHtml(c.file);
    
    // Check that target nav link has active class and aria-current="page"
    const activeRegex = new RegExp(`<a[^>]+href="${c.href}"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"`);
    assert.match(html, activeRegex, `${c.cat} page must have active desktop link with aria-current="page"`);

    // Check mobile drawer link has active and aria-current="page"
    const mobileRegex = new RegExp(`<a[^>]+href="${c.href}"[^>]+class="[^"]*sahyak-drawer-link[^"]*active[^"]*"[^>]*aria-current="page"`);
    assert.match(html, mobileRegex, `${c.cat} page must have active mobile link with aria-current="page"`);

    // Check Home is NOT active
    assert.doesNotMatch(html, /<a[^>]+href="\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active/, `Home must not be active on ${c.cat}`);
  }
});

test('3. Nested Solutions Routes: activate Solutions parent on desktop and specific sub-link on drawer', () => {
  const solutionRoutes = [
    { file: 'solutions/real-estate-lead-management/index.html', href: '/solutions/real-estate-lead-management/' },
    { file: 'solutions/real-estate-whatsapp-crm/index.html', href: '/solutions/real-estate-whatsapp-crm/' },
    { file: 'solutions/real-estate-sales-pipeline/index.html', href: '/solutions/real-estate-sales-pipeline/' },
    { file: 'solutions/property-inventory-management/index.html', href: '/solutions/property-inventory-management/' },
    { file: 'solutions/site-visit-management/index.html', href: '/solutions/site-visit-management/' },
    { file: 'industry/real-estate-brokers/index.html', href: '/industry/real-estate-brokers/' },
    { file: 'industry/property-developers/index.html', href: '/industry/property-developers/' }
  ];

  for (const s of solutionRoutes) {
    const html = readHtml(s.file);

    // Desktop parent Solutions link MUST have active class
    assert.match(
      html, 
      /<a[^>]+href="\/solutions\/real-estate-lead-management\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"/, 
      `Solutions parent must be active on ${s.href}`
    );

    // If it's NOT the exact destination of the parent link, parent must NOT have aria-current="page"
    if (s.href !== '/solutions/real-estate-lead-management/') {
      assert.doesNotMatch(
        html,
        /<a[^>]+href="\/solutions\/real-estate-lead-management\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"/,
        `Solutions parent must not have aria-current="page" when on child ${s.href}`
      );
    } else {
      // Exact match for lead management parent
      assert.match(
        html,
        /<a[^>]+href="\/solutions\/real-estate-lead-management\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"/,
        `Solutions parent must have aria-current="page" when on lead-management exact page`
      );
    }

    // Exact sub-link in mobile drawer MUST have active class and aria-current="page"
    const sublinkRegex = new RegExp(`<a[^>]+href="${s.href}"[^>]+class="[^"]*sahyak-drawer-sublink[^"]*active[^"]*"[^>]*aria-current="page"`);
    assert.match(html, sublinkRegex, `Drawer sublink ${s.href} must be active with aria-current="page"`);
  }
});

test('4. Nested Tools & Comparisons Routes: activate Free Tools parent on desktop and specific sub-link on drawer', () => {
  const toolRoutes = [
    { file: 'tools/real-estate-crm-roi-calculator/index.html', href: '/tools/real-estate-crm-roi-calculator/' },
    { file: 'tools/lead-response-time-calculator/index.html', href: '/tools/lead-response-time-calculator/' },
    { file: 'tools/real-estate-crm-migration-checklist/index.html', href: '/tools/real-estate-crm-migration-checklist/' },
    { file: 'compare/real-estate-crm-vs-excel/index.html', href: '/compare/real-estate-crm-vs-excel/' },
  ];

  for (const t of toolRoutes) {
    const html = readHtml(t.file);

    // Desktop parent Free Tools link MUST have active class
    assert.match(
      html, 
      /<a[^>]+href="\/tools\/real-estate-crm-roi-calculator\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"/, 
      `Free Tools parent must be active on ${t.href}`
    );

    // If it's NOT the exact destination of the parent link, parent must NOT have aria-current="page"
    if (t.href !== '/tools/real-estate-crm-roi-calculator/') {
      assert.doesNotMatch(
        html,
        /<a[^>]+href="\/tools\/real-estate-crm-roi-calculator\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"/,
        `Free Tools parent must not have aria-current="page" when on child ${t.href}`
      );
    } else {
      assert.match(
        html,
        /<a[^>]+href="\/tools\/real-estate-crm-roi-calculator\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active[^"]*"[^>]*aria-current="page"/,
        `Free Tools parent must have aria-current="page" when on roi-calculator exact page`
      );
    }

    // Exact sub-link in mobile drawer MUST have active class and aria-current="page"
    const sublinkRegex = new RegExp(`<a[^>]+href="${t.href}"[^>]+class="[^"]*sahyak-drawer-sublink[^"]*active[^"]*"[^>]*aria-current="page"`);
    assert.match(html, sublinkRegex, `Drawer sublink ${t.href} must be active with aria-current="page"`);
  }
});

test('5. Non-nav Pages (Privacy, Terms): no false positive active state on any nav link', () => {
  const nonNavFiles = ['privacy/index.html', 'terms/index.html'];

  for (const file of nonNavFiles) {
    const html = readHtml(file);
    // Home should NOT be active
    assert.doesNotMatch(html, /<a[^>]+href="\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active/, `Home must not be active on ${file}`);
    assert.doesNotMatch(html, /<a[^>]+href="\/features\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active/, `Features must not be active on ${file}`);
    assert.doesNotMatch(html, /<a[^>]+href="\/pricing\/"[^>]+class="[^"]*sahyak-site-nav-link[^"]*active/, `Pricing must not be active on ${file}`);
    // No aria-current="page" on primary links
    assert.doesNotMatch(html, /sahyak-site-nav-link[^"]*"[^>]*aria-current="page"/, `No desktop nav link should have aria-current on ${file}`);
  }
});

test('6. Client Navigation Accessibility: keyboard navigation, Escape key handler, and mobile drawer controls', () => {
  const html = readHtml('index.html');
  // Dropdown keyboard accessibility
  assert.ok(html.includes("dropdown.addEventListener('keydown'"), 'Dropdown must have keydown listener for keyboard navigation');
  assert.ok(html.includes("e.key === 'Escape'"), 'Escape key must be handled for accessibility');
  // Mobile drawer accessibility attributes
  assert.ok(html.includes('role="dialog"'), 'Mobile drawer must have role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Mobile drawer must have aria-modal="true"');
  assert.ok(html.includes('aria-expanded='), 'Hamburger must have aria-expanded attribute');
  assert.ok(html.includes('aria-controls="sahyak-mobile-drawer"'), 'Hamburger must reference drawer via aria-controls');
});
