# SAHYAK CRM — UI REFINEMENT & TECHNICAL AUDIT
**Date:** October 18, 2026  
**Auditor:** Senior Frontend Engineer & Technical SEO Specialist  
**Repository:** `estate-web-crm`  
**Status:** Pre-Fix Forensic Inspection Complete

---

## EXECUTIVE SUMMARY

A systematic forensic audit of the Sahyak CRM codebase was conducted across all newly created solution, industry, comparison, tool, and buyer-guide routes, as well as the existing core pages. 

The audit identified **5 confirmed technical defects and design gaps**:
1. **Critical CSS Color Token Absence (`bg-cream`)**: Used 54 times in new templates but absent from `tailwind.config.cjs` and compiled `tailwind.css`, resulting in silent CSS failure (transparent backgrounds and lost section hierarchy).
2. **Complete Absence of Real Product Imagery on New Routes (0 `<img>` tags across 12 routes)**: New pages currently rely on pure text and simulated CSS mockup containers, failing to leverage the approved, high-resolution WebP artwork in `public/images/`.
3. **Bandwidth Inefficiency & Aspect-Ratio Mismatch on Core Pages**: Core pages (`features.astro`, `index.astro`, `resources.astro`, `pricing.astro`, etc.) still reference heavy `.png` assets (400KB–900KB) when optimized `.webp` versions (80KB–260KB) exist in the repository, and several image tags have distorted native aspect ratio dimensions.
4. **Grid Card Height & Vertical Alignment Imbalances**: Metric cards and comparison boxes lack `flex flex-col justify-between h-full`, causing ragged bottoms on tablet and desktop screens.
5. **Interactive Controls & Mobile Layout Hardening**: Interactive calculators and checklists require robust touch targets and sticky positioning behavior to prevent layout overlap on viewports under 1024px.

---

## CONFIRMED BUGS & DEFECT REGISTER

### Bug 1: Missing `bg-cream` Tailwind Utility Token
- **Severity:** High (Visual Hierarchy & Theming Defect)
- **Confirmed Instances:** 54 occurrences across 12 pages (`solutions/*`, `industry/*`, `tools/*`, `compare/*`, `resources/*`).
- **Affected Routes:**
  - `src/pages/solutions/property-inventory-management.astro`
  - `src/pages/solutions/real-estate-lead-management.astro`
  - `src/pages/solutions/real-estate-sales-pipeline.astro`
  - `src/pages/solutions/real-estate-whatsapp-crm.astro`
  - `src/pages/solutions/site-visit-management.astro`
  - `src/pages/industry/property-developers.astro`
  - `src/pages/industry/real-estate-brokers.astro`
  - `src/pages/tools/lead-response-time-calculator.astro`
  - `src/pages/tools/real-estate-crm-migration-checklist.astro`
  - `src/pages/tools/real-estate-crm-roi-calculator.astro`
  - `src/pages/compare/real-estate-crm-vs-excel.astro`
  - `src/pages/resources/best-real-estate-crm-india.astro`
- **Root Cause:**
  `tailwind.config.cjs` defines `darkGreen`, `lightBg: '#F4F6F4'`, `brandGreen`, and `textDark`, but does **not** define `cream`. When Tailwind v3 processes files, any class starting with `bg-cream` produces no CSS rule. The compiled stylesheet `public/css/tailwind.css` contains `false` for `.bg-cream`. Consequently, alternating cream sections render as transparent/white, flattening page depth and eliminating visual contrast against white cards.
- **Proposed Minimal Fix:**
  1. Add `cream: '#F4F6F4'` (and alias `brand.cream: '#F4F6F4'`) to `tailwind.config.cjs`.
  2. Add `neon: '#4ADE80'` and `brand.surface: '#0E271F'` to resolve scoped utility classes in `security.astro` and `resources.astro`.
  3. Rebuild `public/css/tailwind.css` using the project's build pipeline.
- **Verification Method:**
  Run automated script checking `.bg-cream` in `public/css/tailwind.css` and visually inspect background contrast in browser.

---

### Bug 2: Zero Image Visual Storytelling Across All 12 Newly Created Pages
- **Severity:** High (UI/UX Storytelling & Engagement Defect)
- **Confirmed Instances:** Exactly 0 `<img>` tags found across all 12 newly created pages (`src/pages/solutions/`, `src/pages/industry/`, `src/pages/tools/`, `src/pages/compare/`, `src/pages/resources/best-real-estate-crm-india.astro`).
- **Root Cause:**
  The new pages were scaffolded with text copy and CSS box containers. While structurally clean, they fail to incorporate the approved real estate illustrations and UI screenshots that already exist in `public/images/features/`, `public/images/homepage/`, and `public/images/resources/`. Real estate brokers and developers need immediate visual evidence of the software workflows.
- **Approved Asset Mapping:**
  - `real-estate-lead-management.astro` &rarr; `/images/features/2.webp` (1402×1122, Lead pipeline & multi-channel capture) & `/images/homepage/2.webp` (1672×941, Spreadsheet chaos problem).
  - `real-estate-whatsapp-crm.astro` &rarr; `/images/features/6.webp` (1122×1402, WhatsApp Cloud API chat interface) & `/images/homepage/3.webp` (862×861, Mobile scheduling).
  - `property-inventory-management.astro` &rarr; `/images/features/3.webp` (1122×1402, Towers, floor plans & unit matrix) & `/images/features/1.webp` (1122×1402, Project development).
  - `site-visit-management.astro` &rarr; `/images/features/4.webp` (1402×1122, Site visit tracking & scheduling) & `/images/homepage/3.webp` (862×861, Mobile client booking).
  - `real-estate-sales-pipeline.astro` &rarr; `/images/features/7.webp` (1402×1122, Deal conversion & sales analytics) & `/images/homepage/1.webp` (799×1422, Mobile pipeline).
  - `industry/real-estate-brokers.astro` &rarr; `/images/homepage/5.webp` (1672×941, Broker scaling sales) & `/images/homepage/1.webp` (799×1422, Mobile CRM app).
  - `industry/property-developers.astro` &rarr; `/images/features/1.webp` (1122×1402, Master project development) & `/images/features/5.webp` (1402×1122, Team collaboration).
  - `compare/real-estate-crm-vs-excel.astro` &rarr; `/images/homepage/2.webp` (1672×941, Spreadsheet chaos problem) & `/images/features/2.webp` (1402×1122, Sahyak pipeline solution).
  - `resources/best-real-estate-crm-india.astro` &rarr; `/images/homepage/4.webp` (1672×924, 3D CRM ecosystem) & `/images/homepage/1.webp` (799×1422, Mobile-first workflow).
  - `tools/real-estate-crm-roi-calculator.astro` &rarr; `/images/features/7.webp` (1402×1122, Revenue analytics).
  - `tools/lead-response-time-calculator.astro` &rarr; `/images/homepage/2.webp` (1672×941, Lead decay).
  - `tools/real-estate-crm-migration-checklist.astro` &rarr; `/images/resources/5.webp` (1672×941, Migration playbooks & checklists).
- **Proposed Minimal Fix:**
  Embed these approved WebP assets into the respective hero, problem, and feature sections with explicit native `width` and `height`, responsive wrapper classes (`rounded-2xl`, `drop-shadow-xl`, `object-contain`/`object-cover`), `loading="lazy"` (or `eager` for above-the-fold hero), `decoding="async"`, and descriptive alt text.
- **Verification Method:**
  DOM inspection verifying HTTP 200 on all images, zero broken links, and visual confirmation in browser.

---

### Bug 3: Heavy PNG File Usage & Mismatched Dimensions in Core Pages
- **Severity:** Medium (Core Web Vitals & Performance Defect)
- **Confirmed Instances:** Multiple core pages (`features.astro`, `index.astro`, `resources.astro`, `pricing.astro`, `contact.astro`, `about.astro`, `security.astro`).
- **Root Cause:**
  Pages still point to `.png` paths (e.g. `/images/features/1.png` at 674KB, `/images/resources/5.png` at 895KB) while identical `.webp` versions exist at a fraction of the weight (187KB and 335KB respectively). Furthermore, some image tags specify hardcoded dimensions (e.g., `width="1920" height="1080"` for an image that is natively 1122×1402), which causes Cumulative Layout Shift (CLS) when CSS overrides apply.
- **Proposed Minimal Fix:**
  1. Migrate image references from `.png` to `.webp`.
  2. Set explicit intrinsic `width` and `height` attributes matching the actual image headers.
  3. Ensure hero LCP images have `fetchpriority="high"` and `loading="eager"`, while below-the-fold images have `loading="lazy"` and `decoding="async"`.
- **Verification Method:**
  Measure network transfer savings (>3MB per page) and verify zero aspect ratio distortion.

---

### Bug 4: Card Height Imbalance in Comparison & Solution Grids
- **Severity:** Low-Medium (UI Alignment & Polish)
- **Confirmed Instances:** Feature comparison cards in `solutions/real-estate-lead-management.astro`, `solutions/property-inventory-management.astro`, and `compare/real-estate-crm-vs-excel.astro`.
- **Root Cause:**
  Grid items with varying amounts of text do not stretch equally unless given `h-full` and flex column layout, causing buttons or footer links to misalign vertically across columns on tablet and desktop viewports.
- **Proposed Minimal Fix:**
  Add `h-full flex flex-col justify-between` to all grid card containers.
- **Verification Method:**
  Visual audit at 768px, 1024px, and 1440px viewports.

---

### Bug 5: Mobile Positioning & Sticky Offset in Interactive Tools
- **Severity:** Low-Medium (Mobile UX)
- **Confirmed Instances:** `tools/lead-response-time-calculator.astro` and `tools/real-estate-crm-roi-calculator.astro`.
- **Root Cause:**
  Sticky results cards (`sticky top-28`) can create scroll interference on mobile screens if not scoped to `static lg:sticky`.
- **Proposed Minimal Fix:**
  Change sticky declarations to `static lg:sticky top-28` to keep mobile linear and desktop sticky.
- **Verification Method:**
  Test interactive calculations and scroll behaviour at 360px and 390px widths.

---

## IMPLEMENTATION PLAN

1. **Step 1 — Styling & Design System Foundations:**
   - Update `tailwind.config.cjs` with `cream`, `neon`, and missing `brand` tokens.
   - Update `src/styles/tailwind-input.css`.
   - Recompile `public/css/tailwind.css`.
2. **Step 2 — Core Pages Bandwidth & Image Modernization:**
   - Update `features.astro`, `index.astro`, `resources.astro`, `pricing.astro`, `security.astro`, `about.astro`, `contact.astro` to use `.webp` and exact intrinsic dimensions.
3. **Step 3 — Solution Pages Image & Visual Storytelling Refinement:**
   - Integrate approved WebP illustrations, fix card heights, and ensure clean problem &rarr; visual &rarr; solution narrative across all 5 solution pages.
4. **Step 4 — Industry Pages Visual Refinement:**
   - Integrate approved broker and developer imagery into `industry/real-estate-brokers.astro` and `industry/property-developers.astro`.
5. **Step 5 — Tools & Comparison Pages Refinement:**
   - Integrate visual diagrams, refine interactive controls, and ensure mobile responsiveness across calculators, checklist, and comparison pages.
6. **Step 6 — Responsive & Visual Browser Validation:**
   - Test across 360px, 390px, 768px, 1024px, 1440px.
7. **Step 7 — Technical SEO Re-Audit & Production Build:**
   - Run SEO test suite, verify sitemap/robots/schema, run `npm run build`, and compile `UI_SEO_REPAIR_REPORT.md`.
