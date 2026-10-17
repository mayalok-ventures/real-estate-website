# SAHYAK.COM — FORENSIC SEO AUDIT & TECHNICAL BASELINE REPORT

**Audit Date:** October 17–18, 2026  
**Auditor Roles:** Senior Technical SEO Engineer, Information Architect, Conversion Copywriter & Cloudflare/Astro Systems Auditor  
**Property Audited:** `https://sahyak.com/` (Google Search Console Property: `sc-domain:sahyak.com`)  
**Repository Working Copy:** `c:\Users\Hi\OneDrive\Documents\crm\estate-web-crm`  
**Git Branch / Commit:** `main` (`818b564`)  
**Production Runtime:** Cloudflare Pages with Astro 5 SSR/Static Prerendering  
**Audit Protocol:** Non-destructive investigation, verified source inspection, live HTTP probing, and authenticated GSC API reconciliation.

---

## 1. Executive Summary & Forensic Context

This forensic audit evaluates the technical SEO health, indexation integrity, search intent alignment, and conversion architecture of **Sahyak CRM** (`https://sahyak.com/`).

### Critical Core Finding: The "404 Vacuum" Discovery
A major discrepancy exists between Google Search Console's active crawl inventory and the current Astro codebase:
1. **Google Search Console is actively serving search impressions for 14 retired solution, industry, and tool URLs** (e.g., `/tools/real-estate-crm-roi-calculator` with 41 impressions in 28 days, `/tools/real-estate-crm-migration-checklist` with 9 impressions, `/solutions/real-estate-whatsapp-crm` with 8 impressions).
2. During the recent framework transition from a prior Next.js repository (`crm-website/sahyak-website`) to the current Astro repository (`estate-web-crm`), only 7 primary marketing templates plus legal pages were ported over.
3. **Every single one of these 14 URLs currently returns an HTTP 404 error on live production**, leaking qualified organic impressions and causing Googlebot crawl errors for commercially high-intent queries like *"crm roi calculator"*, *"property developer crm"*, *"whatsapp crm for real estate agents"*, and *"real estate pipeline software"*.

---

## 2. Public Route Inventory & Technical State

### 2.1 Live Implemented Pages (Current Repository)

| Route / Path | Canonical URL | HTTP Status | Indexability | HTML Title | Primary H1 | GSC Clicks (28d) | GSC Imp (28d) | Avg Pos | Primary CTA |
| :--- | :--- | :---: | :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| `/` | `https://sahyak.com/` | 200 OK | Index, Follow | Sahyak CRM — Real Estate CRM for Developers & Brokers in India | The Real Estate CRM Built for Real People. | 3 | 26 | 2.2 | "Start free &rarr;" (Opens modal / app) |
| `/features/` | `https://sahyak.com/features/` | 200 OK | Index, Follow | Real Estate CRM Features — Leads & Site Visits \| Sahyak CRM | Everything your real estate team needs to close more deals. | 0 | 25 | 4.2 | "Explore [feature] &rarr;" (Dumps to `/contact`) |
| `/pricing/` | `https://sahyak.com/pricing/` | 200 OK | Index, Follow | Real Estate CRM Pricing — ₹499 Base Access \| Sahyak CRM | Your team grows. Your CRM scales with you. | 1 | 13 | 3.1 | "Get started with this plan &rarr;" |
| `/about/` | `https://sahyak.com/about/` | 200 OK | Index, Follow | About Sahyak CRM — Built for Modern Real Estate Teams | Built around the people who build real estate. | 1 | 18 | 6.9 | "See who it's for &rarr;" (Dumps to `/pricing`) |
| `/contact/` | `https://sahyak.com/contact/` | 200 OK | Index, Follow | Contact Sahyak CRM — Sales, Enterprise Demos & Support | Let's build a stronger real estate sales engine together. | 1 | 12 | 6.5 | "Send message &rarr;" & WhatsApp Chat |
| `/resources/` | `https://sahyak.com/resources/` | 200 OK | Index, Follow | Real Estate CRM Resources, Guides & Templates \| Sahyak CRM | Learn. Use. Get Results. | 1 | 13 | 6.3 | "Watch Video" (Static unlinked mockup) |
| `/security/` | `https://sahyak.com/security/` | 200 OK | Index, Follow | Real Estate CRM Security & Data Compliance \| Sahyak CRM | Your Data Built for What's Next. | 0 | 13 | 11.6 | "Book Security Vetting Demo" |
| `/privacy/` | `https://sahyak.com/privacy/` | 200 OK | Index, Follow | Privacy Policy \| Sahyak Real Estate CRM | Sahyak CRM Privacy Policy | 0 | 4 | 7.0 | Back to Legal Hub |
| `/terms/` | `https://sahyak.com/terms/` | 200 OK | Index, Follow | Terms & Conditions \| Sahyak Real Estate CRM | Sahyak CRM Terms & Conditions | 0 | 0 | — | Back to Legal Hub |
| `/404` | `https://sahyak.com/404/` | 404 Served | Noindex | Page Not Found (Error 404) \| Sahyak Real Estate CRM | Page Not Found | 0 | 0 | — | "Back to Home" |

---

### 2.2 Retired / Orphaned Pages Generating Active Google Search Impressions (Confirmed 404s)

These URLs exist in Google's index and Search Console logs from the prior architecture, but return `404 Not Found` in the current build:

| Target URL | Live HTTP | GSC Clicks (28d) | GSC Imp (28d) | Avg Pos | Matched Search Queries | Status / Recommended Action |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| `/tools/real-estate-crm-roi-calculator` | **404** | 0 | **41** | 31.8 | *"crm roi calculator"*, *"real estate crm roi"* | **Critical.** Highest impression asset on site. Rebuild as genuinely interactive, working calculator. |
| `/tools/real-estate-crm-migration-checklist` | **404** | 0 | **9** | 22.3 | *"crm migration checklist"*, *"checklista crm migrering"* | **High.** Rebuild as interactive, printable migration checklist. |
| `/tools/lead-response-time-calculator` | **404** | 0 | **8** | 27.3 | *"real estate lead response time"*, *"speed to lead calculator"* | **High.** Rebuild as speed-to-lead decay calculator. |
| `/solutions/real-estate-whatsapp-crm` | **404** | 0 | **8** | 15.0 | *"whatsapp crm for real estate agents"*, *"whatsapp crm real estate"* | **Critical.** High commercial intent. Deploy dedicated workflow page. |
| `/solutions/property-inventory-management` | **404** | 0 | **7** | 9.0 | *"property inventory"*, *"inventory tracking real estate"* | **High.** Page ranks #9 (Google Page 1!). Rebuild dedicated solution page immediately. |
| `/solutions/real-estate-lead-management` | **404** | 0 | **7** | 31.9 | *"real estate lead management"*, *"portal lead ingress"* | **High.** Primary CRM use case. Rebuild dedicated solution page. |
| `/industry/property-developers` | **404** | 0 | **6** | 14.2 | *"property developer crm"*, *"builder sales crm"* | **High.** Ranks #14. High ACV ICP. Rebuild industry landing page. |
| `/industry/real-estate-brokers` | **404** | 0 | **6** | 13.5 | *"real estate channel partner crm"*, *"crm for brokers"* | **High.** Ranks #13.5. Rebuild industry landing page. |
| `/solutions/real-estate-sales-pipeline` | **404** | 0 | **6** | 18.0 | *"real estate pipeline software"*, *"deal pipeline crm"* | **High.** Striking distance query (#18). Rebuild solution page. |
| `/solutions/real-estate-lead-follow-up` | **404** | 0 | **4** | 15.5 | *"real estate lead follow-up"* | **Consolidate.** 301 redirect to `/solutions/real-estate-lead-management/` to avoid cannibalization. |
| `/solutions/site-visit-management` | **404** | 0 | **3** | 11.0 | *"site visit tracking software"*, *"show flat attendance"* | **High.** Ranks #11. Rebuild solution page. |
| `/resources/real-estate-crm-migration` | **404** | 0 | **3** | 15.0 | *"crm migration real estate"* | **Consolidate.** 301 redirect to `/tools/real-estate-crm-migration-checklist/`. |
| `/compare/real-estate-crm-vs-excel` | **404** | 0 | **2** | 93.0 | *"excel vs cre software"*, *"crm vs excel"* | **Medium.** Rebuild objective comparison guide with Excel template. |
| `/tools/real-estate-lead-leakage-calculator` | **404** | 0 | **1** | 11.0 | *"lead leakage calculator"* | **Consolidate.** 301 redirect to `/tools/lead-response-time-calculator/`. |

---

## 3. Google Search Console Reconciliation & Forensic Analysis

### 3.1 Reconciliation of CSV Exports & Reporting Period
The 7 exported CSVs dated `2026-10-17` were reconciled against the live GSC API connection via service account authentication for property `sc-domain:sahyak.com`:
* **Reporting Period:** `2026-09-17` to `2026-10-15` (28 days).
* **Site-Level Totals (Dimensionless `dimensions: []`):**
  * Total Organic Clicks: **5**
  * Total Google Impressions: **116**
  * Site Average CTR: **4.3%**
  * Site Average Position: **21.5**

### 3.2 Resolution of Discrepancies Between Clicks
The audit resolved why site-level clicks (5), page-level clicks (7), and query-level clicks (1) differ:
1. **Query-Level Clicks (1 click):** Google Search Console applies privacy filtering to the `query` dimension. Individual search queries made by very few users are categorized as anonymized queries and omitted from the `query` table. Only *"magicbricks"* (1 click, 1 impression, pos 59) met Google's privacy threshold. The remaining 4 clicks came from anonymized search queries.
2. **Page-Level Clicks (7 clicks):** 
   - `https://sahyak.com/`: 3 clicks
   - `https://sahyak.com/about`: 1 click
   - `https://sahyak.com/contact`: 1 click
   - `https://sahyak.com/pricing`: 1 click
   - `https://sahyak.com/resources`: 1 click  
   *Reason for discrepancy:* In Search Console, clicks are attributed to each page that a searcher clicked in a search session. Furthermore, trailing-slash variations (`/about` vs `/about/`) and multi-result listings create multiple page-level click events for a single user search session.
3. **Property-Level Totals (5 clicks):** Direct dimensionless query (`dimensions: []`) reflects Google's de-duplicated organic search sessions across the entire domain.

### 3.3 Status of Cluster & Audit CSVs
* **`sahyak_gsc_clusters_2026-10-17.csv`:** Search volume is recorded as `0`. Forensic trace of `src/lib/googleSearchConsole.ts` confirms that this cluster export is generated from an internal static architectural schema (`generateEnterpriseGSCModules`), **not** third-party keyword search volume API data.
* **`sahyak_gsc_audit_2026-10-17.csv`:** The 9 checks claiming "100% Passed (7/7 Pages)" are hardcoded static data in `generateEnterpriseGSCModules` representing internal targets, not a dynamic live crawler output.

---

## 4. Competitive Intelligence & SERP Patterns

### 4.1 Real Estate CRM Landscape in India
| Competitor | Primary Target Segment | Strengths | Weaknesses / Differentiating Gaps | Pricing Model |
| :--- | :--- | :--- | :--- | :--- |
| **Sell.Do** | Large property builders & developers | Deep pre-sales to post-sales workflows, channel partner portal, ERP connections. | Expensive enterprise contracts, heavy desk-bound UI, complex setup. | Custom enterprise quotes (typically ₹15,000–₹50,000+/mo). |
| **LeadSquared** | High-velocity call centers & brokerages | Powerful automation engine, complex multi-branch routing, wide integrations. | High cost per user, steep learning curve, not tailored out-of-the-box for solo brokers. | Tiered per-user SaaS starting at ~$25–$100/user/mo billed annually. |
| **TeleCRM** | Telecalling broker teams & call centers | SIM-based calling, call recording, basic WhatsApp sequences. | Lacks multi-tower inventory matrices, no unit locks, weak developer staging. | ~₹600–₹1,000/user/month. |
| **Leadrat** | Local property brokers & small agencies | Portal lead capture (99acres, Magicbricks), simple mobile app. | Basic pipeline views, limited developer-grade unit inventory management. | Starting ~₹500–₹800/user/month. |
| **Zoho CRM** | Generic B2B / Small businesses | High customizability, global reputation, low cost base. | Not native to Indian real estate; requires custom configurations for portals & WhatsApp. | Free (3 users), Standard ₹800/mo, Professional ₹1,400/mo, Enterprise ₹2,400/mo. |

### 4.2 Differentiating Content & Product Opportunities for Sahyak
1. **Clear, Transparent Entry Pricing:** Unlike Sell.Do and LeadSquared which hide pricing behind sales demos, Sahyak's transparent **Free Starter (20 leads, 1 seat, 10 WhatsApp actions, 3 properties)** and **₹499 Base Access** is a massive hook for independent brokers and channel partners.
2. **True Mobile-First Field Operating System:** Real estate deals in India are closed in cars, tea stalls, and show flats, not at desktop desks. Sahyak's 1-tap WhatsApp brochure dispatch without saving phone numbers directly addresses a severe daily broker pain point.
3. **Multi-Tower Unit Lock Workflow:** Small and mid-size builders constantly suffer from double-booking units across external channel partners. A 48-hour temporary unit lock with token slip upload solves a verified operational crisis.

---

## 5. Technical SEO Defect Register (Severity Ranked)

| Issue ID | Severity | Category | Affected URLs | Defect Description | SEO & Business Impact |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **TECH-01** | **P0** | Crawl/Indexation | 14 URLs (`/tools/*`, `/solutions/*`, `/industry/*`, `/compare/*`) | **404 Errors on Active Search Console Landing Pages.** 14 URLs actively indexed and receiving impressions return HTTP 404 on live production. | Complete loss of organic search traffic; negative quality signals to Googlebot; broken user entry journeys. |
| **TECH-02** | **P1** | Crawl/Redirects | All public pages | **Trailing Slash 308 Redirect Inconsistencies.** Internal links and canonical tags must strictly match Cloudflare Pages' trailing slash convention (`/path/`). | Triggers unnecessary 308 redirects, adds latency, and strips URL fragment anchors (`#hero`, `#features`). |
| **TECH-03** | **P1** | Indexation | `/sitemap.xml`, `/sitemap-0.xml` | **Sitemap Incompleteness.** Current sitemaps only list 9 URLs, omitting all industry, solution, tool, and comparison routes. | Hinders discovery, crawl budget prioritization, and re-indexing of high-value solution pages. |
| **TECH-04** | **P2** | On-Page / Copy | `/` (Homepage) | **Consumer Headline Positioning Crisis.** H1 reads *"The Real Estate CRM Built for Real People"*, failing to identify commercial B2B real estate operators. | Low keyword relevance for "real estate CRM", high bounce rates from brokers and developers. |
| **TECH-05** | **P2** | On-Page / CRO | `/features/` | **Bait-and-Switch Feature Navigation.** All 6 feature module exploration CTAs dump users onto `/contact` rather than providing actual deep dives. | Frustrates prospective buyers, causes high exit rates on the contact form, and provides zero contextual internal linking. |
| **TECH-06** | **P2** | Schema / Quality | `/resources/` | **Deceptive VideoObject Schema.** Schema defines a video object with upload dates and durations, while on-page content is a static CSS mockup. | Google Search Central rich-result penalty risk for misleading structured data. |
| **TECH-07** | **P2** | Content / Trust | `/about/`, `/contact/` | **Unsubstantiated International Office Claims & Anonymous Bios.** Contact claims hubs in London, SF, Dubai; leadership is listed anonymously. | Destroys credibility with enterprise real estate firms who demand verified corporate compliance (Mayalok Ventures / BKC Mumbai). |
| **TECH-08** | **P3** | Internal Linking | Global | **Shallow Internal Link Topology.** Solutions and industry personas are completely isolated from navbar, footer, and contextual in-content link graphs. | Topic authority is trapped; PageRank does not flow to sub-pages. |

---

## 6. Route-by-Route Remediation Plan

| Route | Recommended Action | Target Intent | Primary Target Keyword | Justification |
| :--- | :--- | :--- | :--- | :--- |
| `/` | **Optimize** | Commercial | Real estate CRM software | Align H1 to commercial real estate buyers; refine metadata; link to solutions. |
| `/features/` | **Optimize** | Commercial | Real estate CRM features | Wrap in Layout, fix heading hierarchy, link module cards to dedicated solution URLs. |
| `/pricing/` | **Optimize** | Transactional | Real estate CRM pricing ₹499 | Clarify Free Starter limits (20 leads, 1 seat, 10 WhatsApp actions, 3 properties); clarify Meta WhatsApp billing. |
| `/industry/real-estate-brokers/` | **Create / Restore** | Commercial | CRM for real estate brokers | Recovers 6 GSC impressions; targets brokers, channel partners, and solo agents. |
| `/industry/property-developers/` | **Create / Restore** | Commercial | Property developer CRM | Recovers 6 GSC impressions; targets builders, multi-project inventory, and sales galleries. |
| `/solutions/real-estate-lead-management/` | **Create / Restore** | Commercial | Real estate lead management | Recovers 7 GSC impressions; covers 99acres/Magicbricks webhook ingress & speed-to-lead. |
| `/solutions/real-estate-whatsapp-crm/` | **Create / Restore** | Commercial | WhatsApp CRM for real estate | Recovers 8 GSC impressions; details 1-tap brochure sharing and official Meta Cloud API. |
| `/solutions/real-estate-sales-pipeline/` | **Create / Restore** | Commercial | Real estate pipeline software | Recovers 6 GSC impressions; covers deal stages, token advances, and booking velocity. |
| `/solutions/property-inventory-management/` | **Create / Restore** | Commercial | Property inventory management | Recovers 7 GSC impressions; currently ranks #9 on Google; covers unit matrix & temporary locks. |
| `/solutions/site-visit-management/` | **Create / Restore** | Commercial | Site visit tracking software | Recovers 3 GSC impressions; ranks #11; covers weekend show-flat logistics & GPS logs. |
| `/tools/real-estate-crm-roi-calculator/` | **Create / Restore** | Commercial / Tool | Real estate CRM ROI calculator | Recovers 41 GSC impressions (highest on site); interactive mathematical utility. |
| `/compare/real-estate-crm-vs-excel/` | **Create / Restore** | Educational / Comp | Real estate CRM vs Excel | Recovers 2 GSC impressions; objective workflow comparison with audit checklist. |
| `/resources/` | **Optimize** | Informational | Real estate CRM resources | Remove deceptive VideoObject schema; provide real practical playbooks and checklists. |
| `/security/` | **Optimize** | Trust / Info | Real estate CRM client data safety | Technical specifications on multi-tenancy, DPDPA 2023, encryption, and audit logs. |
| `/about/`, `/contact/`, `/privacy/`, `/terms/` | **Retain & Polish** | Navigational / Trust | Brand / Trust | Eliminate false overseas hub claims; substantiate Mayalok Ventures BKC Mumbai base. |
| `/solutions/real-estate-lead-follow-up` | **301 Redirect** | Commercial | — | Redirect to `/solutions/real-estate-lead-management/` to eliminate keyword cannibalization. |
| `/resources/real-estate-crm-migration` | **301 Redirect** | Educational | — | Redirect to `/tools/real-estate-crm-migration-checklist/`. |
| `/tools/lead-response-time-calculator` | **Create / 301** | Tool | Speed to lead calculator | Rebuild or consolidate into ROI & speed-to-lead tool suite. |
| `/tools/real-estate-lead-leakage-calculator` | **301 Redirect** | Tool | — | Redirect to `/tools/real-estate-crm-roi-calculator/`. |
