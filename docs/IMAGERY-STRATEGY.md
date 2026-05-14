# EventLinqs Imagery Strategy

**Status:** Locked 2026-05-09
**Authority:** Founder + CTO. References `docs/MEDIA-ARCHITECTURE.md` for component contracts.
**Position:** Pre-launch strategic doc. Imagery foundation work feeds into Batch 10 final QA, sourcing happens in parallel during 9.1.1 / 9.2 / 10 cycle.

---

## 1. The verdict

Pexels (current placeholder source) is acceptable for development but does not survive at launch. To surpass Ticketmaster, DICE, Eventbrite, and Airbnb on hero treatment, EventLinqs combines premium-curated photography for the brand spine with mid-tier subscription stock for volume, and applies a platform-wide brand duotone and grain treatment so every image reads as on-brand regardless of source.

The "anti-stock" techniques (duotone, grain, half-page heroes) are not optional polish. They are how every modern e-commerce platform launches in 2026 without paying for 100+ custom photoshoots. Apple, Spotify, Linear, Vercel, Stripe all use these techniques on stock or semi-stock imagery.

---

## 2. Source allocations (locked)

The platform needs approximately 125 to 130 images at launch. Allocations by asset class:

### 2.1 Tier 1 brand spine: 14 culture page heroes

- **Source:** Stocksy United
- **Resolution:** X-Large at 135 USD per image
- **Total:** 14 × 135 = **1,890 USD one-off**
- **Rationale:** These are the most-viewed pages on the platform after the homepage, and they define the brand voice for each cultural community. Stocksy's curation is the only source where the imagery does not read as stock. Editorial, authentic, model-released. The Stocksy royalty-free standard license covers unlimited web use, 500K print copies, and worldwide use for unlimited time, which is more than EventLinqs ever needs at launch scale.

### 2.2 Tier 2 geographic identity: 20 city page heroes

- **Capital cities (8):** Stocksy at Large size, 85 USD each = 680 USD
- **Regional cities (12):** Adobe Stock subscription
- **Subtotal:** **680 USD one-off + Adobe Stock subscription**
- **Rationale:** Capital cities (Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Canberra, Hobart) need recognisable photographic anchors, and Stocksy's quality at Large resolution is the right tier. Regional cities (Newcastle, Wollongong, Geelong, etc.) can come from Adobe Stock standard collection without losing quality after the duotone treatment.

### 2.3 Tier 3 secondary: 24 suburb heroes + 30 event placeholders

- **Source:** Adobe Stock standard subscription (29.99 USD per month for 10 assets per month)
- **Duration:** 2 months of subscription captures all 54 needed images plus headroom
- **Total:** **~60 USD over 2 months**
- **Rationale:** Suburbs and event placeholders are tertiary. They get the duotone treatment and read as on-brand regardless of source. Subscription model is most cost-efficient for this volume.

### 2.4 Tier 4 community placeholders: 20 organiser + 10 venue

- **Source:** Unsplash+ (paid Unsplash with commercial license, ~12 USD per month)
- **Duration:** 1 month captures everything needed
- **Total:** **~12 USD one-off month**
- **Rationale:** Organiser and venue placeholder avatars and cover images are temporary, replaced by user-uploaded content as organisers and venues onboard. Cheap subscription is the right tool. Commercial license avoids the legal grey area of free Unsplash.

### 2.5 Total launch budget

| Source | Use case | Cost |
|---|---|---|
| Stocksy | 14 culture heroes (X-Large) + 8 capital cities (Large) | 2,570 USD one-off |
| Adobe Stock | Standard subscription, 2 months | 60 USD |
| Unsplash+ | 1 month | 12 USD |
| **Total** | | **~2,642 USD one-off** |

### 2.6 Lean alternative if cash-constrained

If the launch budget needs to compress, the lean version is:

- Stocksy 5 X-Large for top cultures only (African, South Asian, Caribbean, Latin, East Asian) = 675 USD
- Adobe Stock 3-month subscription = 90 USD
- Unsplash+ 1 month = 12 USD
- Pexels (free) for the rest
- **Total: ~777 USD**

The lean version still gets premium feel on the most-viewed pages, with upgrade path post-launch as GMV justifies. Recommend the full-budget version if cash allows. Lean is acceptable.

### 2.7 Sources NOT recommended

- **iStock Signature:** Adobe owns iStock, and Adobe Stock is the better Adobe property at the same price tier. Skip to avoid duplication.
- **Shutterstock:** Despite massive volume, the curation quality reads "staged" or dated. Adobe Stock at the same price gives better editorial-style results.
- **Free Unsplash:** Limited legal protection. Use Unsplash+ (paid) instead for the modest 12 USD per month upgrade.
- **Getty Images:** Pricing 140 to 500 USD per image with rights-managed complexity. Overkill for EventLinqs at launch.

---

## 3. The anti-stock treatment system

### 3.1 Brand duotone overlay (mandatory, all heroes)

Every hero image platform-wide receives a SVG duotone filter mapping:

- Dark pixels → `#0A1628` navy
- Light pixels → `#D4A437` gold

This is the single most powerful brand-consistency lever EventLinqs has. A Stocksy editorial shot of an African drumming circle, an Adobe Stock photo of the Sydney Harbour Bridge, and an Unsplash image of a venue interior all read as the same brand language after the duotone passes over them.

**Implementation:** SVG `<filter>` element inlined in root layout, CSS `filter: url(#duotone-eventlinqs)` applied to hero images via the `HeroMedia` component.

**Filter spec:**
```html
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <filter id="duotone-eventlinqs">
      <feColorMatrix type="matrix" values="
        0.299 0.587 0.114 0 0
        0.299 0.587 0.114 0 0
        0.299 0.587 0.114 0 0
        0     0     0     1 0
      "/>
      <feComponentTransfer>
        <feFuncR tableValues="0.039 0.831"/>
        <feFuncG tableValues="0.086 0.643"/>
        <feFuncB tableValues="0.157 0.216"/>
      </feComponentTransfer>
    </filter>
  </defs>
</svg>
```

The `feColorMatrix` converts any image to greyscale. The `feComponentTransfer` maps that greyscale to the navy-to-gold gradient. The values `0.039, 0.086, 0.157` are the navy RGB divided by 255. The values `0.831, 0.643, 0.216` are the gold RGB divided by 255.

### 3.2 Duotone variants

- `duotone-strong` (default): full mapping, deep navy shadows, gold highlights. For hero imagery.
- `duotone-subtle`: 60 percent opacity over original. For card thumbnails where photographic detail matters.
- `duotone-none`: opt-out for organiser-uploaded brand assets they want to keep colour-accurate.

### 3.3 Grain texture (recommended, large heroes only)

Subtle SVG noise at 4 to 6 percent opacity adds the gritty live-event feel competitors lack. Applied as a `::after` pseudo-element on hero containers, `mix-blend-mode: multiply` to avoid washing out colour.

**Spec:**
```css
.hero-grain::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,...fractalNoise...");
  opacity: 0.05;
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

Not applied to card thumbnails (would compound visual noise at small sizes). Not applied to organiser/venue avatars.

### 3.4 Half-page split heroes

Already in Batch 9.2 scope as the "2-column split-state hero". Validates the research recommendation. The pattern:
- Left column 50 percent: hero image with duotone and grain
- Right column 50 percent: solid navy block with H1, subtitle, primary CTA

Better readability than full-width heroes, more modern, and the solid colour block carries the brand without competing with the photography.

---

## 4. Implementation plan

### 4.1 Phase 1: Technical foundation (CC work, ~2 hours)

A small dedicated batch building the duotone and grain components. Suggested batch label: **Batch 10 Imagery Foundation** (folded into Batch 10 final QA scope, since both are pre-launch polish).

Deliverables:
- `<DuotoneFilterDefs />` component mounted in root layout, exposes the SVG filter
- `<HeroMedia>` component updated to accept a `duotone="strong | subtle | none"` prop, defaults to `strong`
- `.hero-grain` CSS utility added to globals
- Documentation update in `docs/MEDIA-ARCHITECTURE.md`
- Visual verification at all 3 viewports across 4 representative hero pages

### 4.2 Phase 2: Founder sourcing (parallel, ~3 to 5 hours founder time)

Founder personally sources images from Stocksy, Adobe Stock, and Unsplash+ per the allocations in Section 2. Saves to a local folder structure mirroring the platform (e.g. `imagery/cultures/african-1.jpg`, `imagery/cities/sydney-1.jpg`).

Each downloaded image filed with:
- Source platform
- License type (royalty-free standard, royalty-free extended, etc.)
- Asset URL
- Cost paid
- Date acquired

Maintained in a simple spreadsheet or markdown file at `docs/imagery-license-audit.md`. This is the compliance audit trail in case any rights questions surface post-launch.

### 4.3 Phase 3: Drop-in replacement (CC work, ~30 minutes)

CC replaces Pexels-sourced placeholders with founder-sourced premium imagery via the existing `HeroMedia` component contract. No code changes needed if Phase 1 is solid. Just file replacements in `/public/imagery/`.

### 4.4 Phase 4: Lighthouse and quality verification (CC work, ~30 minutes)

Confirm AVIF conversion, file sizes under 200KB for hero images, LCP under 2.2s on mobile, no layout shift introduced.

---

## 5. Sequencing against build roadmap

| Batch | What ships | Imagery work |
|---|---|---|
| 9.1 (shipped) | Glassmorphism nav, search overlay shell | Pexels placeholders (current) |
| 9.1.1 (next) | Cultures + Cities index pages, avatar shell, search a11y | Pexels placeholders (current), use existing component contracts |
| 9.2 | Homepage polish, bento grids, split-state hero | Pexels placeholders (current) |
| 10 | Final QA + cross-link audit + sitemap + **Imagery Foundation (Phase 1)** | Build duotone and grain components |
| Pre-launch sprint | Logo, social profiles, infrastructure | **Phase 2 founder sourcing** + Phase 3 drop-in replacement + Phase 4 verification |

The technical foundation lands in Batch 10. The image sourcing is a parallel founder track. The drop-in replacement is the last step before public launch.

---

## 6. License compliance

Critical for a commercial platform:

- **Stocksy royalty-free standard license:** covers unlimited web use, up to 500K print copies, worldwide, unlimited time. Sufficient for EventLinqs at launch and well into scale. Extended licenses only needed if the platform sells branded merchandise using a Stocksy image.
- **Adobe Stock standard license:** unlimited web use, 500K print copies, worldwide. Same coverage as Stocksy standard.
- **Unsplash+ commercial license:** unlimited use, no attribution required, commercial use permitted.
- **Free Unsplash and Pexels:** legal grey area for commercial platforms. Migrate away from these for any public-facing imagery before launch.

All licensing data captured in `docs/imagery-license-audit.md` per Phase 2 above.

---

## 7. Post-launch upgrade path

Imagery is iterative, not one-and-done. Post-launch monitoring:

- Track which culture and city pages drive the most traffic. Upgrade their hero imagery to commissioned shoots once GMV passes a defined threshold.
- Roll out organiser-uploaded imagery as supply grows. Build a moderation queue.
- Refresh hero imagery quarterly to avoid visual fatigue.
- Track Lighthouse scores per hero page to ensure imagery upgrades do not regress performance.

---

## 8. Decisions log

- 2026-05-09: Strategy locked. Stocksy + Adobe Stock + Unsplash+ source mix. Pexels deprecated for public-facing imagery.
- 2026-05-09: Duotone treatment mandated platform-wide. SVG filter approach chosen over CSS filter (better colour accuracy).
- 2026-05-09: Grain texture chosen at 5 percent opacity for hero containers only.
- 2026-05-09: Imagery Foundation (technical components) folded into Batch 10 scope.
- 2026-05-09: Phase 2 founder sourcing runs in parallel during the 9.1.1 / 9.2 / 10 build cycle.

---

**END**
