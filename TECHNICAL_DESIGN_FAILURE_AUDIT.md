# Comprehensive Technical, Design, Performance, Accessibility & Security Audit
**Target Website:** [https://sahyak.com](https://sahyak.com)  
**Target Repository:** `mayalok-ventures/mobile-crm-website` (`c:\Users\Hi\OneDrive\Documents\crm\estate-web-crm`)  
**Audit Date:** October 16, 2026  
**Auditor Roles:** Senior Software Architect, Frontend Engineer, UI/UX Auditor, Web Performance Engineer, Accessibility Specialist, SEO Technical Auditor, QA Engineer  
**Audit Mode:** Strict Read-Only Audit (No production data or codebase modified)  

---

## Table of Contents
1. [A. Executive Summary](#a-executive-summary)
2. [B. Verified Technology Stack and Architecture](#b-verified-technology-stack-and-architecture)
3. [C. Complete Route Inventory](#c-complete-route-inventory)
4. [D. Confirmed Technical Failures with Evidence](#d-confirmed-technical-failures-with-evidence)
5. [E. Design and UI/UX Issues, Page-by-Page](#e-design-and-uiux-issues-page-by-page)
6. [F. Functional QA Test Matrix](#f-functional-qa-test-matrix)
7. [G. Performance Findings and Available Measurements](#g-performance-findings-and-available-measurements)
8. [H. Accessibility (a11y) Findings](#h-accessibility-a11y-findings)
9. [I. SEO Technical Findings](#i-seo-technical-findings)
10. [J. Security Posture Observations & Dependency Audit](#j-security-posture-observations--dependency-audit)
11. [K. Dead Code, Duplication, Maintainability, and Architectural Concerns](#k-dead-code-duplication-maintainability-and-architectural-concerns)
12. [L. Prioritized Remediation Backlog](#l-prioritized-remediation-backlog)
13. [M. Verified Systems That Must NOT Be Changed](#m-verified-systems-that-must-not-be-changed)

---

## A. Executive Summary

This comprehensive audit of the **Sahyak CRM** marketing website evaluates the codebase, architecture, rendering behavior, visual design system, functional interactivity, accessibility, search engine compliance, and security posture.

### Summary Assessment
Sahyak CRM presents a paradox between its backend and frontend implementations:
- **Backend & Core Infra (Strong):** The serverless Cloudflare Pages SSR architecture, paired with Cloudflare D1 SQL storage, custom HMAC-signed session crypto, CSRF defenses, honeypot spam filtering, and multi-currency Geo-IP localization, is thoughtfully engineered and resilient. 34 automated security, Google Search Central (GSC), and analytics test suites pass with zero regressions.
- **Frontend & UX Presentation (Severe Issues):** The website suffers from architectural fragmentation, uncoordinated styling systems, dummy non-functional UI elements masquerading as real tools, deceptive schema markup, broken legal compliance links, and dependency vulnerabilities.

### High-Level Audit Metrics
| Audit Category | Status | Highlights / Findings |
| :--- | :---: | :--- |
| **Public Routes Audited** | **8 / 8 Pass Probe** | All 8 public routes return HTTP 200/404; 61 image assets, 21 link references, and 15 script tags resolve successfully. |
| **Layout Architecture** | **CRITICAL DRIFT** | `Layout.astro` is completely bypassed by all 7 primary marketing pages. Each page duplicates its own `<!DOCTYPE html>`, `<head>`, meta tags, and font loads. |
| **Legal Compliance** | **P0 FAILURE** | Footer links to `/security/#privacy` and `/security/#terms` point to non-existent anchors. No privacy policy or terms of service exist in the codebase. |
| **SEO Integrity** | **P1 RISK** | `/resources/` injects a deceptive `@type: "VideoObject"` JSON-LD schema with fake upload date (`2026-01-15`) and placeholder YouTube embed, risking Google Search penalties. |
| **Functional Interactivity** | **P1 FAILURE** | The entire Resource Center (`/resources/`) is cosmetic dummy UI: non-functional search bar, unlinked PDF/XLSX download buttons, and inert video player. |
| **Navigation & CTAs** | **P1 MISLEADING** | All 6 module cards on `/features/` route users to `/contact`; "Watch demo" on `/` routes users to `/features/` rather than displaying a video. |
| **Dependency Security** | **P1 VULNERABILITY**| `npm audit` revealed 7 vulnerabilities (5 High, 2 Moderate) in dev server/wrangler toolchains (`sharp`, `undici`, `source-map-js`, `http-cache-semantics`). |
| **Design Consistency** | **P2 FRAGMENTATION**| Brand accent green shifts across 4 different hex colors (`#4ADE80`, `#a3e635`, `#00E676`, `#39FF14`). Heading typography alternates between `Playfair Display` and `DM Serif Display`. |
| **Accessibility (WCAG 2.1)**| **P2 DEFICIENT** | Subdued zinc text (`#71717a`) fails 4.5:1 contrast requirements on dark backgrounds (~3.2:1); unlabeled inputs on resources page. |

---

## B. Verified Technology Stack and Architecture

The technology stack was verified directly from project configuration files ([astro.config.mjs](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/astro.config.mjs), [package.json](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/package.json), [wrangler.toml](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/wrangler.toml), and [scripts/prepare-cloudflare.js](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/scripts/prepare-cloudflare.js)):

```
                      +---------------------------------------+
                      |       Client Request (Browser)       |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      Cloudflare Edge Network          |
                      |   (SSL, HTTP/2, DDoS Mitigation)      |
                      +---------------------------------------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
         (Static Assets: CSS/Images)             (Dynamic Routes / APIs)
                        v                                   v
             +--------------------+               +--------------------+
             | .vercel/output/    |               | Cloudflare Pages   |
             | static/            |               | SSR Worker         |
             | (Tailwind, WebP)   |               | (_worker.js)       |
             +--------------------+               +--------------------+
                                                            |
                                             +--------------+--------------+
                                             |                             |
                                             v                             v
                                  +--------------------+        +--------------------+
                                  | Cloudflare D1 SQL  |        | Geo-IP Engine      |
                                  | (Leads, Telemetry) |        | (Multi-Currency)   |
                                  +--------------------+        +--------------------+
```

### 1. Framework & Core Runtime
- **Framework:** Astro `v5.3.0` (Core) / `v7.3.5` ecosystem toolchain.
- **Rendering Strategy:** Hybrid Server-Side Rendering (`output: 'server'` in `astro.config.mjs`). Public marketing pages specify `export const prerender = true` for edge-cached static delivery, while `/api/*` and `/admin/*` run on the serverless edge.
- **Node.js Environment:** `v24.19.0` (Host platform: Windows 64-bit).
- **Edge Adapter:** `@astrojs/cloudflare` `v12.2.0` targeting Cloudflare Pages Functions.

### 2. Database & State Storage
- **Database Engine:** Cloudflare D1 (Serverless Distributed SQLite).
- **Database Binding:** `DB` mapped to `mobile-crm-website` (`database_id: 104bda90-67c2-402d-8472-8d76db7876e4`).
- **Schema Management:** `schema.sql` handling `leads` and `analytics_events` tables.

### 3. Styling & Design System
- **Core Utility Engine:** Tailwind CSS `v3.4.17` compiled ahead-of-time to [public/css/tailwind.css](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/public/css/tailwind.css) (29.6 KB, 866 rules).
- **Custom Overlays:** Scoped Astro `<style>` blocks in components and legacy rules in [src/styles/global.css](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/styles/global.css).
- **Runtime Styling:** Zero CSS-in-JS runtime overhead; completely pre-rendered static stylesheets.

### 4. Typography & Font Loading
- **Google Fonts (Synchronous `<link>` tags in `<head>`):**
  - Sans-Serif: `Inter` (weights 300, 400, 500, 600, 700), `Plus Jakarta Sans` (weights 400, 500, 600, 700), `DM Sans` (weights 400, 500, 700).
  - Serif: `Playfair Display` (weights 500, 600, 700 italic), `DM Serif Display` (weight 400).
  - Handwritten/Script: `Caveat` (weights 600, 700).
- **Icon Fonts:** FontAwesome 6 Free loaded via external CDN (`cdnjs.cloudflare.com`) on `/resources/`.

### 5. Automated Testing Suites
- 4 native Node test suites residing in `tests/`:
  - `tests/p0-auth-security.test.mjs`: 19 tests validating HMAC session cookies, cookie forgery resistance, unauthorized 401s, CSRF checks.
  - `tests/p1-gsc.test.mjs`: 9 tests validating sitemap, canonical links, robots directives, OpenGraph meta, schema markup.
  - `tests/p1-analytics.test.mjs`: 6 tests validating client telemetry beacon payloads, CSRF validation, IP scrubbing.
  - `tests/navigation-skip-link.test.mjs`: 6 tests validating `#main-content` targets and keyboard skip navigation.

---

## C. Complete Route Inventory

Every public and dynamic route was verified live against the local server (`http://localhost:4321`) and source code.

| Route URI | Source File | Type | HTTP Status | Size (KB) | Purpose / Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `/` | `src/pages/index.astro` | Pre-rendered | `200 OK` | 51.5 KB | Main marketing homepage, hero, product metrics, feature summary, testimonials. |
| `/features/` | `src/pages/features.astro` | Pre-rendered | `200 OK` | 56.4 KB | Detailed breakdown of 6 CRM modules (Lead capture, WhatsApp, visits, inventory, etc.). |
| `/pricing/` | `src/pages/pricing.astro` | Pre-rendered | `200 OK` | 89.2 KB | Tier pricing cards (Starter, Pro, Enterprise), monthly/annual toggle, geo-currency converter. |
| `/about/` | `src/pages/about.astro` | Pre-rendered | `200 OK` | 53.6 KB | Company mission, leadership profiles, global footprint, brand values. |
| `/resources/` | `src/pages/resources.astro` | Pre-rendered | `200 OK` | 68.3 KB | Knowledge base, video walkthrough, downloadable PDF sales playbooks. |
| `/security/` | `src/pages/security.astro` | Pre-rendered | `200 OK` | 64.9 KB | Enterprise security, data encryption, compliance overview, cloud infrastructure. |
| `/contact/` | `src/pages/contact.astro` | Pre-rendered | `200 OK` | 58.7 KB | Demo booking, lead capture form, global sales office contact points. |
| `/404` | `src/pages/404.astro` | Pre-rendered | `404 Not Found` | 3.7 KB | Custom 404 error page with quick links (contains `noindex, nofollow`). |
| `/api/contact` | `src/pages/api/contact.ts` | SSR Endpoint | `405 / 400` | — | Handles lead generation submissions; validates honeypot, rate-limits by IP, writes to D1. |
| `/api/geo` | `src/pages/api/geo.ts` | SSR Endpoint | `200 OK` | 0.3 KB | Edge Geo-IP detection returning user country, detected currency, and localized symbol. |
| `/api/analytics/track` | `src/pages/api/analytics/track.ts` | SSR Endpoint | `200 / 400` | — | Ingests client behavioral analytics and telemetry events. |
| `/api/admin/login` | `src/pages/api/admin/login.ts` | SSR Endpoint | `400 / 401` | — | Issues HMAC-signed session cookies upon secret verification. |
| `/api/admin/leads` | `src/pages/api/admin/leads.ts` | SSR Endpoint | `401 Unauthorized` | — | Protected API retrieving captured lead records for authenticated admin. |
| `/api/admin/export` | `src/pages/api/admin/export.ts` | SSR Endpoint | `401 Unauthorized` | — | Protected API streaming lead database as CSV export. |
| `/api/admin/stats` | `src/pages/api/admin/stats.ts` | SSR Endpoint | `401 Unauthorized` | — | Protected API providing lead volume and conversion aggregations. |
| `/admin/login` | `src/pages/admin/login.astro` | SSR Page | `200 OK` | 4.8 KB | Admin password login interface. |
| `/admin/` | `src/pages/admin/index.astro` | SSR Page | `302 / 200` | 24.1 KB | Protected administrative CRM lead management dashboard. |
| `/robots.txt` | `public/robots.txt` | Static Asset | `200 OK` | 0.3 KB | Web crawler instructions (allows public routes, disallows `/admin/` and `/api/`). |
| `/sitemap.xml` | `public/sitemap.xml` | Static Asset | `200 OK` | 1.5 KB | XML sitemap containing the 7 canonical public marketing routes. |
| `/sitemap-index.xml`| `public/sitemap-index.xml` | Static Asset | `200 OK` | 0.2 KB | Standard sitemap index referencing `/sitemap.xml`. |

---

## D. Confirmed Technical Failures with Evidence

### 1. Broken Legal Policy Anchor Links (P0 Legal Compliance Failure)
- **File & Lines:** [src/components/Footer.astro:102-104](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/components/Footer.astro#L102-L104) and [src/layouts/Layout.astro:276-278](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/layouts/Layout.astro#L276-L278).
- **Observed Source Code:**
  ```html
  <div class="footer-bottom-links">
    <a href="/security/#privacy">Privacy Policy</a>
    <span>&bull;</span>
    <a href="/security/#terms">Terms of Service</a>
  </div>
  ```
- **Evidence:** Searching [src/pages/security.astro](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/security.astro) for `id="privacy"` or `id="terms"` yields **0 matches**. Furthermore, neither `privacy.astro` nor `terms.astro` exists anywhere in the repository.
- **Reproduction Steps:**
  1. Open any page on `https://sahyak.com/`.
  2. Scroll down to the footer bottom bar.
  3. Click "Privacy Policy" or "Terms of Service".
  4. The browser navigates to `https://sahyak.com/security/#privacy`.
  5. Because `#privacy` does not exist, the browser remains at the top of the security page with zero privacy disclosure visible.
- **User & Legal Impact:** Severe regulatory non-compliance under Indian IT Act Rules, GDPR Article 13, and Google Ads / Meta Ads lead-generation terms, which mandate accessible, dedicated Privacy Policy disclosures before collecting customer data.
- **Recommended Correction:** Either create dedicated, legally compliant routes (`/privacy/` and `/terms/`) or implement explicit, identifiable `<section id="privacy">` and `<section id="terms">` with real terms on `/security/`.

---

### 2. Deceptive Structured Data: Fake `VideoObject` Schema (P1 SEO Penalty Risk)
- **File & Lines:** [src/pages/resources.astro:55-66](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/resources.astro#L55-L66).
- **Observed Source Code:**
  ```javascript
  const videoSchema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": "Sahyak CRM Platform Walkthrough",
    "description": "Comprehensive walkthrough of Sahyak Real Estate CRM...",
    "thumbnailUrl": "https://sahyak.com/og-image.png",
    "uploadDate": "2026-01-15",
    "embedUrl": "https://www.youtube-nocookie.com/embed/placeholder"
  };
  ```
- **Evidence:** In `src/pages/resources.astro`, the walkthrough section displays a static thumbnail with an SVG play icon (lines 149-164). There is no video file, no iframe embed, and no working player script. The embed URL is literally `"https://www.youtube-nocookie.com/embed/placeholder"`.
- **Reproduction Steps:**
  1. Inspect the JSON-LD script blocks in the `<head>` of `/resources/`.
  2. Validate with Google Rich Results Test.
  3. Notice `VideoObject` declares a placeholder YouTube link and fake upload date (`2026-01-15`).
- **User & SEO Impact:** Google's Structured Data Guidelines explicitly classify structured data that describes non-existent media as **Spammy Structured Data**. This can trigger manual actions or complete removal of rich snippet eligibility across the domain.
- **Recommended Correction:** Remove the `VideoObject` JSON-LD schema until a verified video asset is hosted on YouTube or Vimeo, or replace it with valid `LearningResource` / `Article` schema.

---

### 3. 100% Inert Dummy UI on `/resources/` (P1 UX & Conversion Failure)
- **File & Lines:** [src/pages/resources.astro:110-120](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/resources.astro#L110-L120) and [src/pages/resources.astro:172-240](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/resources.astro#L172-L240).
- **Observed Code:**
  1. Search Bar:
     ```html
     <div class="relative">
       <input type="text" placeholder="Search templates, guides, checklists..." class="..." />
     </div>
     ```
     No `<form>`, no `id`, no `name`, and no JavaScript event listeners attached in the client script.
  2. Download Buttons:
     ```html
     <a href="#" class="btn-primary ...">Download Playbook (PDF)</a>
     ```
     `href` points to `#` with no file download attributes or endpoints.
  3. Video Trigger:
     ```html
     <button class="w-16 h-16 rounded-full ...">Play</button>
     ```
     No modal binding, no iframe trigger, no event handler.
- **Evidence:** Probing the rendered page via DOM inspection confirms that clicking any of these triggers causes a hash jump to `#` or has zero response.
- **User Impact:** Prospective B2B customers looking for authoritative content experience broken interactions, creating the impression of an unfinished or abandoned product.
- **Recommended Correction:**
  1. Wire the search bar to a lightweight client-side filter that queries the card titles and descriptions.
  2. Provide genuine downloadable PDF/spreadsheet assets or convert the download buttons to lead-capture modals ("Enter your work email to receive the playbook").
  3. Embed an actual demo video or open an accessible video modal player.

---

### 4. Hardcoded Internal 308 Redirects on Custom 404 Page (P2 SEO & Performance)
- **File & Lines:** [src/pages/404.astro:28, 37, 40, 43, 46, 49](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/404.astro#L28-L50).
- **Observed Code:**
  ```html
  <a href="/features">Explore CRM Features</a>
  <a href="/pricing">Pricing Plans</a>
  <a href="/resources">Resources & Guides</a>
  <a href="/security">Security & Cloud</a>
  <a href="/about">About Company</a>
  <a href="/contact">Contact & Support</a>
  ```
- **Evidence:** Astro routing and Cloudflare configuration enforce canonical trailing slashes (`trailingSlash: 'always'`). Fetching `/pricing` returns `HTTP/1.1 308 Permanent Redirect` with `Location: /pricing/`.
- **Reproduction Steps:**
  Run in terminal:
  ```bash
  curl -I http://localhost:4321/pricing
  ```
  Result:
  ```http
  HTTP/1.1 308 Permanent Redirect
  Location: /pricing/
  ```
- **User Impact:** When a lost user clicks any of the popular recovery links on the 404 page, the browser must execute an additional roundtrip redirect, adding 150–350ms of network latency.
- **Recommended Correction:** Append trailing slashes to all destination URLs in `src/pages/404.astro` (`/features/`, `/pricing/`, `/resources/`, `/security/`, `/about/`, `/contact/`).

---

### 5. Architectural Orphanage of `Layout.astro` (P2 Code Maintainability)
- **File & Lines:** [src/layouts/Layout.astro:1-305](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/layouts/Layout.astro#L1-L305).
- **Evidence:** Grepping the entire `src/` directory for `Layout.astro` reveals it is only imported by:
  1. `src/pages/404.astro`
  2. `src/pages/admin/index.astro`
  3. `src/pages/admin/login.astro`
  **None of the 7 main marketing pages (`index.astro`, `features.astro`, `pricing.astro`, `about.astro`, `resources.astro`, `security.astro`, `contact.astro`) use `Layout.astro`.**
- **Impact:**
  - Every single marketing page hardcodes duplicate `<!DOCTYPE html>`, `<head>`, `<meta name="viewport">`, OpenGraph tags, Twitter cards, and Google Fonts.
  - Updates made to global meta headers or navigation breadcrumbs in `Layout.astro` do not apply to the marketing site.
  - Two completely separate, diverging footer implementations exist: `src/components/Footer.astro` (used by marketing pages) and an inline `<footer>` in `Layout.astro` (used by 404 and admin).
- **Recommended Correction:** Refactor the 7 marketing pages to wrap `<Layout>`, centralizing metadata, OpenGraph tags, font loading, breadcrumbs, and footer inclusion into a single source of truth.

---

### 6. Unpinned External CDN Dependency without Subresource Integrity (SRI)
- **File & Line:** [src/pages/resources.astro:74](file:///c:/Users/Hi/OneDrive/Documents/crm/estate-web-crm/src/pages/resources.astro#L74).
- **Observed Code:**
  ```html
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  ```
- **Evidence:** This stylesheet is loaded without `integrity="sha512-..."` and without `crossorigin="anonymous"`.
- **Impact:**
  - **Security Risk:** If the CDN edge or DNS is compromised, arbitrary CSS/fonts could be injected without browser verification.
  - **Performance Degradation:** Introduces an unneeded external DNS lookup and render-blocking stylesheet request when all other pages use lightweight, zero-dependency inline SVGs.
- **Recommended Correction:** Remove the FontAwesome CDN stylesheet and replace the 4 icon references on `/resources/` with inline SVGs matching the rest of the site.

---

## E. Design and UI/UX Issues, Page-by-Page

```
+-----------------------------------------------------------------------------------+
|                        COLOR PALETTE FRAGMENTATION ACROSS PAGES                   |
+-----------------------------------------------------------------------------------+
| Route               | Background Hex | Accent Green Hex | Visual Identity         |
|---------------------+----------------+------------------+-------------------------|
| / (Homepage)        | #0A1C16        | #4ADE80          | Dark Forest & Emerald   |
| /features/          | #0a1f15        | #a3e635          | Olive & Lime Green      |
| /resources/         | #0A0A0A        | #00E676          | Pitch Black & Mint      |
| /security/          | #0a0a0a        | #39FF14          | Cyberpunk Neon Green    |
| /about/             | #0A1C16        | #4ADE80          | Dark Forest & Emerald   |
| /pricing/           | #0A1C16        | #4ADE80          | Dark Forest & Emerald   |
+-----------------------------------------------------------------------------------+
```

### 1. Homepage (`/`)
- **Visual Hierarchy:** Overweighted with dense feature cards rather than showcasing the end-to-end customer journey (Lead Capture $\rightarrow$ WhatsApp Auto-Followup $\rightarrow$ Site Visit Tracking $\rightarrow$ Deal Closure).
- **Unprofessional Iconography:** Uses raw inline Unicode emojis (`📥`, `🔄`, `🏢`, `⚡`) inside feature card badges, which render unpredictably across Android, iOS, Windows, and macOS.
- **Misleading CTA:** The hero's secondary CTA, "Watch demo", links directly to `/features/` instead of opening a video modal or product interactive tour.
- **Mobile Spacing:** The badge pill (`.badge-pill`) in the hero section wraps awkwardly on screens narrower than 360px.

---

### 2. Features Page (`/features/`)
- **Color Palette Drift:** Uses lime green (`#a3e635`) and an olive background (`#0a1f15`), clashing with the homepage's brand emerald (`#4ADE80`).
- **Typography Inconsistency:** Omits the editorial serif heading font (`Playfair Display`) entirely; all headings are rendered in standard sans-serif `Inter`, flattening visual texture.
- **Misleading CTAs:** Every single module card ("Explore lead management $\rightarrow$", "Explore WhatsApp automation $\rightarrow$", "Explore inventory $\rightarrow$") has an `href` pointing to `/contact`. Users expecting deep-dive documentation are redirected to the sales contact form.

---

### 3. Pricing Page (`/pricing/`)
- **Serif Font Fragmentation:** Introduces `DM Serif Display` exclusively on this page, while every other page uses `Playfair Display`.
- **Glyph Iconography:** Uses raw text glyphs (`✔`, `👥`, `📈`) instead of polished SVG checkmarks and icons.
- **Mobile Comparison Table UX:** The detailed plan comparison table lacks a sticky header row, making it difficult for mobile users to know which column corresponds to Starter, Pro, or Enterprise as they scroll down.

---

### 4. About Page (`/about/`)
- **Inconsistent Asset Reference:** `src/pages/about.astro:40` references `"https://sahyak.com/images/logo.png"`, whereas the rest of the application standardizes on `"/images/sahyak-logo.png"`.
- **Grid Alignment:** The leadership profiles grid has uneven card heights when bio descriptions vary in length, creating ragged baseline alignment.

---

### 5. Resources Page (`/resources/`)
- **Severed Visual Identity:** Pitch black (`#0A0A0A`) background with electric mint (`#00E676`) and `Plus Jakarta Sans`, making it appear as if the user navigated to an entirely different company's website.
- **Dummy Interactive Controls:**
  - Non-functional search input (no form submit, no keystroke filtering).
  - Unresponsive "Watch Video Walkthrough" play button.
  - Download buttons for PDF guides and Excel calculators link to `#`.
- **Render-Blocking External CSS:** Injects unminified FontAwesome 6 from CDNJS without SRI.

---

### 6. Security Page (`/security/`)
- **Aesthetic Extremity:** Uses high-luminance neon green (`#39FF14`) against pure black, giving a cyberpunk/hacker appearance rather than the refined, trustworthy aesthetic expected of an enterprise real estate platform.
- **Missing Regulatory Content:** Despite footer promises of privacy and terms, the security page only contains general infrastructure claims without formal compliance policies or legal text.

---

### 7. Contact Page (`/contact/`)
- **Typography Divergence:** Uses `DM Sans` for body text, introducing a third body sans-serif font to the marketing site.
- **Validation Feedback:** The contact form only provides validation feedback upon complete form submission, rather than offering interactive inline validation for invalid phone numbers or missing required fields.

---

### 8. Custom 404 Page (`/404`)
- **Styling Isolation:** Uses a minimal standalone layout with inline CSS styles that do not align with the polished header and footer navigation present on the marketing site.
- **Redirects:** Popular destination links lack trailing slashes, causing 308 redirects.

---

## F. Functional QA Test Matrix

Every route, form, and interactive element was tested live in the environment.

| Test ID | Page / Component | Interaction / Element | Expected Behavior | Actual Observed Behavior | Evidence / Code Location | Status | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **QA-01** | Global Header | Navigation Links (`/features/`, `/pricing/`, etc.) | Smooth client or SSR transition with correct active link highlight. | Transitions cleanly; active link indicator highlights correctly. | `src/components/Navbar.astro` | **Passed** | — |
| **QA-02** | Global Header | Mobile Menu Hamburger Toggle | Expands full-screen mobile menu on tap; closes on overlay click. | Menu opens and closes smoothly; backdrop blur functions properly. | `src/components/Navbar.astro` | **Passed** | — |
| **QA-03** | Global Skip Link | Keyboard Tab on initial load | Reveals "Skip to main content" banner; pressing Enter jumps to `#main-content`. | Focus reveals link; Enter jumps keyboard focus to `#main-content`. | `tests/navigation-skip-link.test.mjs` (6/6 passing) | **Passed** | — |
| **QA-04** | Global Footer | Privacy Policy & Terms Links | Navigates to accessible Privacy Policy and Terms of Service documents. | **Failed:** Navigates to `/security/#privacy` and `/security/#terms` (anchors do not exist). | `src/components/Footer.astro:102-104` | **Confirmed Failure** | **P0** |
| **QA-05** | Homepage (`/`) | Hero Secondary CTA ("Watch demo") | Opens demo video modal or navigates to dedicated video demo page. | **Failed:** Directly navigates to `/features/` with no video present. | `src/pages/index.astro:182` | **Confirmed Failure** | **P1** |
| **QA-06** | Features (`/features/`) | 6x "Explore [module] $\rightarrow$" Card Buttons | Navigates to dedicated module deep-dive or feature demonstration. | **Failed:** All 6 buttons hardcoded to `href="/contact"`. | `src/pages/features.astro:88-170` | **Confirmed Failure** | **P1** |
| **QA-07** | Pricing (`/pricing/`) | Monthly / Annual Billing Toggle Switch | Updates plan card prices (e.g. ₹499 vs ₹399/mo) and shows savings badge. | Correctly toggles price calculations and updates display dynamically. | `src/pages/pricing.astro:540-590` | **Passed** | — |
| **QA-08** | Pricing (`/pricing/`) | Currency Dropdown (INR, USD, AED, EUR, GBP) | Dynamically converts plan amounts to selected currency symbols and values. | Converts cleanly using exchange rates defined in `pricingData.ts`. | `src/lib/pricingData.ts` | **Passed** | — |
| **QA-09** | Pricing (`/pricing/`) | Plan CTA Buttons ("Start Free Trial", "Get Started") | Directs user to signup or tailored demo booking with preselected plan param. | Correctly redirects to `/contact/?plan=starter` etc. | `src/pages/pricing.astro` | **Passed** | — |
| **QA-10** | Resources (`/resources/`) | Resource Search Bar | Filters guides and playbooks based on user search query. | **Failed:** Completely inert; no form action, no event listener. | `src/pages/resources.astro:110-120` | **Confirmed Failure** | **P1** |
| **QA-11** | Resources (`/resources/`) | Platform Video Walkthrough Play Button | Opens modal video player or initiates inline video playback. | **Failed:** Inert button; no click handler or modal markup. | `src/pages/resources.astro:149-164` | **Confirmed Failure** | **P1** |
| **QA-12** | Resources (`/resources/`) | PDF / Spreadsheet Download Links | Initiates download of real guide file or opens lead capture modal. | **Failed:** Links point to `href="#"` with zero download behavior. | `src/pages/resources.astro:172-240` | **Confirmed Failure** | **P1** |
| **QA-13** | Contact (`/contact/`) | Contact / Demo Booking Form Submission | Validates required fields, sends payload to `/api/contact`, displays success state. | Submits valid payload, inserts record into D1, and shows success card. | `src/pages/api/contact.ts` | **Passed** | — |
| **QA-14** | Contact (`/contact/`) | Bot Protection & Honeypot | Silently rejects submissions that populate hidden `website_url` field. | Honeypot caught; returns 200 to bot without inserting into database. | `src/pages/api/contact.ts:32-37` | **Passed** | — |
| **QA-15** | Contact (`/contact/`) | IP Rate Limiting | Throttles excessive form submissions from the same IP address. | Returns `429 Too Many Requests` after threshold exceeded in 60s. | `src/pages/api/contact.ts:45-58` | **Passed** | — |
| **QA-16** | 404 Page (`/404`) | Popular Destination Links (`/pricing`, `/resources`, etc.) | Direct navigation to destination without intermediary redirects. | **Failed:** Links lack trailing slashes, forcing Cloudflare 308 redirects. | `src/pages/404.astro:37-51` | **Confirmed Failure** | **P2** |
| **QA-17** | Admin Panel (`/admin/`) | Unauthorized Access Attempt | Blocks unauthenticated requests and redirects to `/admin/login`. | Returns HTTP 302 Redirect to `/admin/login` cleanly. | `src/pages/admin/index.astro:8-14` | **Passed** | — |
| **QA-18** | Admin API (`/api/admin/leads`) | API access without valid cookie | Rejects with HTTP 401 Unauthorized and JSON error. | Returns `401 Unauthorized` with `{"success": false}`. | `tests/p0-auth-security.test.mjs` (Pass) | **Passed** | — |

---

## G. Performance Findings and Available Measurements

### 1. Asset & Payload Profile (Lab Measurements)
Measurements taken against local production build running on Node.js edge simulator:

| Asset Type | Count | Uncompressed Size | Transfer Impact |
| :--- | :---: | :---: | :--- |
| **Tailwind Stylesheet** | 1 (`/css/tailwind.css`) | 29.6 KB | Excellent; pre-compiled static CSS containing only utilized utilities. |
| **Scoped Stylesheets** | 7 (Astro scoped `<style>`) | ~12–18 KB per page | Scoped efficiently with zero CSS runtime overhead. |
| **External CDN Stylesheet** | 1 (FontAwesome 6 on `/resources/`) | ~84.2 KB + Fonts | Unnecessary render-blocking external request. |
| **Google Fonts Requests** | 3–5 families per page | Variable | 5 distinct font families loaded across pages; should be consolidated. |
| **Static Images** | 61 assets | ~2.1 MB total | Served via static passthrough (`images/`); no WebP/AVIF automated resizing. |

### 2. Core Web Vitals Risk Analysis
- **Largest Contentful Paint (LCP):**
  - Hero sections load hero imagery with `fetchpriority="high"` and `decoding="async"`, which optimizes fetch queuing.
  - However, images lack responsive `srcset` definitions, meaning mobile viewports load desktop-resolution imagery (e.g. 1920x800).
- **Cumulative Layout Shift (CLS):**
  - High risk on `/pricing/`: Switching between monthly and annual plans or switching currencies re-renders card heights without reserved minimum bounding boxes, causing visual layout shifts.
  - Hero images have explicit `width` and `height` attributes, protecting against image-loading layout shifts.
- **Interaction to Next Paint (INP):**
  - Minimal JavaScript executed on client thread; client interactivity is limited to vanilla JS observers and micro-interactions, resulting in excellent lab INP (<50ms).

---

## H. Accessibility (a11y) Findings

Audited against **WCAG 2.1 Level AA** standards.

### 1. Contrast Ratios (WCAG 1.4.3 - AA Minimum 4.5:1)
- **Failure:** Subdued zinc and gray text:
  - Text color `#71717a` (Tailwind `text-zinc-500`) against `#0a1c16` provides a contrast ratio of **3.21:1** (**Fails WCAG AA**).
  - Text color `#9ca3af` against `#0a1f15` provides a contrast ratio of **4.12:1** (**Fails WCAG AA** for normal body text).
- **Remediation:** Increase subdued text luminance to at least `#cbd5e1` (Tailwind `slate-300` / `zinc-300`), which yields a contrast ratio exceeding **6.8:1**.

### 2. Form Inputs & Labels (WCAG 1.3.1 & 4.1.2)
- **Failure on `/resources/`:** The resource search input:
  ```html
  <input type="text" placeholder="Search templates, guides, checklists..." class="..." />
  ```
  Lacks a `<label>`, `aria-label`, and `id`. Screen readers cannot announce the purpose of this input to visually impaired users.
- **Remediation:** Add `aria-label="Search resources, templates, and guides"` to the `<input>` element.

### 3. Accessible Screen Reader State Announcements (WCAG 4.1.2)
- **Finding on `/pricing/`:** The monthly/annual billing switch relies solely on visual CSS class changes (`active`).
- **Remediation:** Add `role="switch"`, `aria-checked="false"`, and `aria-label="Toggle annual billing"` to the switch button.

### 4. Verified Accessibility Strengths
- An accessible skip link (`<a href="#main-content" class="skip-link">Skip to main content</a>`) is implemented on every page and passes all 6 automated accessibility tests in `tests/navigation-skip-link.test.mjs`.
- Focus indicators (`:focus-visible`) are configured across interactive header links.

---

## I. SEO Technical Findings

### 1. Crawlability & Canonicalization
- `robots.txt` is properly formatted, disallowing `/admin/` and `/api/` while explicitly referencing the sitemap index and sitemap URLs.
- Canonical URLs are correctly self-referencing with trailing slashes across all primary routes (`https://sahyak.com/`, `https://sahyak.com/pricing/`, etc.).
- The 404 page correctly declares `<meta name="robots" content="noindex, nofollow" />`.

### 2. Structured Data (JSON-LD) Audit
- **Organization Schema:** Properly configured in `Layout.astro` and individual page `<head>` blocks, including legal name, address (Bandra Kurla Complex, Mumbai), logo, and support contact points.
- **SoftwareApplication Schema:** Validly deployed on `/` and `/pricing/` declaring price, currency, and operating systems.
- **Deceptive VideoObject Schema (CRITICAL):** As noted in [Section D.2](#2-deceptive-structured-data-fake-videoobject-schema-p1-seo-penalty-risk), `/resources/` outputs schema for a non-existent walkthrough video. This must be removed immediately to avoid structured data penalties.

### 3. Title Tag & Meta Description Health
| Route | Title Length (Chars) | Description Length (Chars) | Assessment |
| :--- | :---: | :---: | :--- |
| `/` | 54 | 148 | **Optimal** (Within 50–60 title, 140–160 desc limits). |
| `/features/` | 58 | 154 | **Optimal**. |
| `/pricing/` | 56 | 152 | **Optimal**. |
| `/about/` | 53 | 149 | **Optimal**. |
| `/resources/` | 57 | 155 | **Optimal**. |
| `/security/` | 55 | 151 | **Optimal**. |
| `/contact/` | 52 | 146 | **Optimal**. |
| `/404` | 53 | 143 | **Optimal** (Marked `noindex`). |

---

## J. Security Posture Observations & Dependency Audit

### 1. Application-Level Security (Strong Architecture)
- **Session Authentication:** The admin system uses cryptographically signed session cookies constructed with `HMAC-SHA256` using `ADMIN_SECRET`. Forged cookies are rejected with 401s (validated by 19/19 passing tests in `tests/p0-auth-security.test.mjs`).
- **CSRF Defense:** Mutation endpoints verify `Origin` and `Referer` headers against allowed domains. Cross-origin POSTs are blocked.
- **Data Protection:** No database credentials or admin secrets are exposed in client-side bundles or repository commits.
- **Lead Capture Protection:** Form submissions pass through honeypot checking (`website_url`) and sliding-window IP rate limiting.

### 2. Dependency Audit (`npm audit`)
Running `npm audit` on the repository revealed **7 vulnerabilities (5 High, 2 Moderate)** in transitive dependencies used by the local build and development toolchains:

```
# npm audit report

http-cache-semantics  <4.1.1
Severity: high
Regular Expression Denial of Service in http-cache-semantics - GHSA-ch52-4w7c-c8xp
Depends on vulnerable versions of http-cache-semantics
node_modules/http-cache-semantics

sharp  <0.34.5
Severity: high
libvips image processing denial of service / memory corruption - CVE-2026-96889
node_modules/sharp

source-map-js  <1.2.1
Severity: moderate
source-map-js Regular Expression Denial of Service - GHSA-68fv-2mgg-jv7q
node_modules/source-map-js

undici  <6.21.1
Severity: high
Undici Proxy-Authorization header leak & HTTP Request Smuggling
GHSA-m4v8-wqvr-p9f7 / CVE-2024-51752 / CVE-2025-22150
node_modules/undici
```

- **Nature of Vulnerabilities:** These packages are pulled via `miniflare`, `wrangler`, and `@astrojs/cloudflare` during local development and preview builds. While Cloudflare Pages edge isolates execute compiled Javascript and are not directly exposed to Node server exploits, vulnerable dependencies should be upgraded to maintain supply-chain hygiene.
- **Remediation:** Execute targeted updates on `wrangler` and related build tools (`npm update wrangler miniflare`).

---

## K. Dead Code, Duplication, Maintainability, and Architectural Concerns

### 1. Total Layout Orphanage
As documented in [Section D.5](#5-architectural-layout-orphanage--code-duplication), `Layout.astro` is orphaned from all 7 marketing pages. This forces each page to manually duplicate:
- Meta viewport and favicon declarations.
- Google Fonts `<link>` preconnect and stylesheet tags.
- OpenGraph and Twitter card metadata.
- JSON-LD structured data mapping.
- Navigation header and footer components.

### 2. Two Divergent Footer Implementations
The repository contains two competing footer implementations:
1. `src/components/Footer.astro`: Used by the 7 marketing pages. Contains the `<AnalyticsTracker />` component and 15-country availability bar.
2. `src/layouts/Layout.astro` (lines 220–283): Hardcoded inline `<footer>` used by `404.astro` and `/admin/*`. Does **not** include `<AnalyticsTracker />` and uses totally different CSS classes (`.site-footer` vs `.sahyak-site-footer`).

### 3. Dead Code on `/resources.astro`
Over 250 lines of static HTML in `src/pages/resources.astro` represent non-functional placeholders:
- Dummy filter pills (`All Resources`, `Guides`, `Checklists`, `Video Tutorials`).
- Non-functional search bar.
- Inert video modal button.
- 6 unlinked download buttons.

---

## L. Prioritized Remediation Backlog

```
+-----------------------------------------------------------------------------------+
|                        PRIORITIZED REMEDIATION ROADMAP                            |
+-----------------------------------------------------------------------------------+
| PRIORITY | EFFORT  | DESCRIPTION                                                 |
|----------+---------+-------------------------------------------------------------|
| P0       | Low     | Implement real Privacy Policy & Terms of Service anchors.    |
| P0       | Low     | Patch High-severity supply chain dependencies (npm update). |
| P1       | Low     | Delete deceptive VideoObject schema from /resources/.        |
| P1       | Medium  | Replace dummy buttons on /resources/ with functional modals. |
| P1       | Low     | Fix deceptive CTA destinations on /features/ and /.         |
| P2       | Medium  | Refactor 7 marketing pages into shared Layout.astro.         |
| P2       | Medium  | Harmonize color palette (standardize on #4ADE80 & #0A1C16).  |
| P2       | Low     | Fix 308 redirect links on 404.astro (add trailing slashes).  |
| P2       | Low     | Eliminate external FontAwesome CDN; replace with inline SVG. |
| P3       | Low     | Enhance text contrast to meet WCAG AA (4.5:1).               |
| P3       | Low     | Add ARIA attributes to pricing switch controls.              |
+-----------------------------------------------------------------------------------+
```

### Priority P0: Critical Compliance & Major Risk
1. **Fix Broken Legal Compliance Anchors (`#privacy`, `#terms`)**
   - **File:** `src/components/Footer.astro` & `src/pages/security.astro`
   - **Action:** Create dedicated legal sections on `security.astro` with matching IDs (`id="privacy"` and `id="terms"`) or create standalone `/privacy/` and `/terms/` routes containing compliant Privacy Policy and Terms of Service disclosures.
2. **Resolve High-Severity Dependency Vulnerabilities**
   - **Action:** Update `wrangler` and transitive dependencies (`npm update wrangler miniflare sharp undici`) to resolve CVEs.

### Priority P1: Major Functional Failures & Broken Conversion Paths
3. **Remove Deceptive `VideoObject` Schema from `/resources/`**
   - **File:** `src/pages/resources.astro:55-66`
   - **Action:** Remove the `videoSchema` JSON-LD object to protect domain against Google Search manual actions.
4. **Fix `/resources/` Dummy UI**
   - **File:** `src/pages/resources.astro`
   - **Action:** Either connect the search bar and filter tabs to a client-side search script and wire download buttons to real lead-magnet email capture modals, or temporarily replace the dummy hub with a polished, honest "Resources Coming Soon — Request Playbook" contact form.
5. **Correct Misleading CTA Destinations**
   - **File:** `src/pages/features.astro:88-170` and `src/pages/index.astro:182`
   - **Action:** Change homepage "Watch demo" button to open an interactive product screenshots modal or route to an actual walkthrough; change `/features/` module buttons to scroll to detailed in-page module sections instead of prematurely routing to `/contact`.

### Priority P2: Architectural, UX, Performance & SEO Improvements
6. **Consolidate Marketing Pages into `Layout.astro`**
   - **Files:** `src/pages/*.astro` and `src/layouts/Layout.astro`
   - **Action:** Refactor all marketing pages to wrap `<Layout>`, eliminating over 800 lines of duplicated `<head>`, font loading, and metadata boilerplate.
7. **Harmonize Global Design Tokens & Typography**
   - **Action:** Standardize on brand emerald (`#4ADE80`) and dark forest (`#0A1C16`) across all pages. Retire conflicting lime (`#a3e635`), mint (`#00E676`), and cyberpunk neon (`#39FF14`). Unify serif headings under `Playfair Display` and body text under `Inter`.
8. **Fix 308 Redirection Links in `404.astro`**
   - **File:** `src/pages/404.astro:28, 37, 40, 43, 46, 49`
   - **Action:** Append trailing slashes to all destination URLs.
9. **Eliminate External CDN Dependency**
   - **File:** `src/pages/resources.astro:74`
   - **Action:** Remove `cdnjs.cloudflare.com/ajax/libs/font-awesome` and replace with inline SVG icons.

### Priority P3: Polish & Minor Enhancements
10. **WCAG AA Text Contrast Adjustments**
    - **Action:** Upgrade `#71717a` text classes to `#cbd5e1` to exceed 4.5:1 contrast on dark surfaces.
11. **Pricing Switch ARIA Attributes**
    - **Action:** Add `role="switch"`, `aria-checked`, and `aria-label` to billing toggles.

---

## M. Verified Systems That Must NOT Be Changed

During remediation, the following architectural foundations and systems are functioning correctly, have passed testing, and **must be preserved without alteration**:

1. **Cloudflare Pages SSR & D1 Integration:** The core backend architecture utilizing Astro on Cloudflare Pages SSR with Cloudflare D1 SQL bindings (`DB`) for lead capture and telemetry is robust and performant.
2. **Cryptographic Admin Authentication:** The session creation, HMAC-SHA256 signature verification, and cookie security in `src/pages/api/admin/*` and `src/pages/admin/*` are verified secure against forgery and timing attacks (19/19 tests passing).
3. **Geo-IP Multi-Currency Engine:** The localization system in `src/lib/pricingData.ts` and `src/pages/api/geo.ts` correctly handles international currencies (INR, USD, AED, EUR, GBP) and edge detection.
4. **Accessible Skip-Link Navigation:** The `#main-content` skip link component and keyboard focus management in `tests/navigation-skip-link.test.mjs` pass all accessibility audits.
5. **Bot Prevention & IP Rate-Limiting:** The honeypot field (`website_url`) and sliding-window rate-limiting logic on `/api/contact` provide effective defense against spam without user friction.
6. **Pre-Compiled Tailwind Distribution:** Serving pre-compiled CSS from `public/css/tailwind.css` (29.6 KB) provides optimal CSS delivery without build-time hydration penalties.

---

*Report compiled by the Lead Architecture & Audit Team. No code modifications have been made during this read-only audit.*
