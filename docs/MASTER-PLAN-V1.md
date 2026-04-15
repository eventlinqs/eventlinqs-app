# EventLinqs — Master Plan V1

**Version:** 1.0
**Date locked:** 15 April 2026
**Owner:** Lawal Adams
**Engineering partner:** Claude
**Status:** ACTIVE — this document is the build contract

---

## 1. The Mission

EventLinqs ships a platform that genuinely competes with Ticketmaster, DICE, and Eventbrite from launch day. Not "MVP." Not "good enough for friends." A platform people prefer.

A real organiser can sign up, create a beautifully-designed event with their own video and photos, sell tickets, manage attendees, and get paid. A real fan can browse, discover, buy, share, and attend. Every page is production-grade. Every link works. Every interaction responds. Every flow completes. Mobile-first. Internationally aware.

Public soft launch: end of May 2026 (≈6 weeks from today).

---

## 2. Operating Principles

These principles govern every decision during the 6-week build. When in doubt, refer back here.

1. **Quality over date.** The launch date moves before the quality bar moves.
2. **Build once, build right.** No throwaway "we'll fix it later" code. We refactor only when we hit a genuine architectural limit.
3. **Labels match destinations.** Every CTA goes where it says it goes. No bait-and-switch UX.
4. **Every link works.** Every footer link, nav link, card link, button link resolves. Zero 404s on the marketing surface.
5. **Mobile-first.** Every page is designed at 375px before it is designed at 1440px.
6. **Tokens, not values.** Every colour, every spacing, every type size reads from a CSS variable. No inline hex.
7. **Components, not duplicates.** Two buttons that look the same are the same component.
8. **Real content, never placeholder.** No lorem ipsum, no "coming soon," no "TBD" in production.
9. **Production Readiness Charter is the gate.** No session closes until its applicable checklist items pass.
10. **The plan is the plan.** Scope changes happen here in writing, not mid-session in chat.

---

## 3. Decisions Locked

The three founder decisions made on 15 April 2026:

**Image strategy: Hybrid (Decision 1D).**
- Phase 1 (Week 5): AI-generated category cover photography using Midjourney v7. Budget: ~AUD $50 one-off for ~30-50 images. Commercial licence rights confirmed via Midjourney paid plan.
- Phase 2 (Q3 2026, post-launch): Commission a Melbourne-based photographer for owned, culturally-authentic v2 imagery. Budget: ~AUD $500–2,000 one-off.
- Until Phase 1 ships in Week 5, all category and marketing pages use the **premium-bare** treatment (gradient + pattern + typography), shipped in Week 1 Session 1.

**Video on day one (Decision 2A).**
- Mux integration in Week 3.
- Organiser video upload limits: 50 MB / 30 seconds / 1080×1920 vertical or 1920×1080 horizontal / MP4, MOV, WebM.
- Verified-organiser tier (later): 100 MB cap.
- Static poster image always required as fallback.
- Estimated monthly cost: AUD $30–80 at launch volumes.

**6-week timeline committed (Decision 3 YES).**
- 20 build sessions total, 3–4 per week, 1–3 hours each.
- Launch target: end of May 2026.
- Friends/private beta link: end of Week 4 (after discovery + search ships).
- Public soft launch: end of Week 6.

---

## 4. Where We Start From (Inventory)

What's already shipped — this is the foundation Track B builds on, not a restart.

**Infrastructure live:**
- Vercel Pro deployment, custom domain `eventlinqs.com`, SSL active
- Supabase backend with all 13 M4 tables and 10 RPC functions
- Stripe test mode, working checkout, dynamic pricing engine, social proof badges
- Upstash Redis cache (N. Virginia free tier — Week 6 will migrate to Sydney paid plan)
- Resend transactional email (free tier)
- Microsoft 365 email at `hello@eventlinqs.com`
- GitHub repo `github.com/eventlinqs/eventlinqs-app`, branch `main`

**Component primitives shipped:**
- `PageShell`, `PageHero`, `ContentSection`, `Section`
- `Button` (variants: primary, secondary, ghost; sizes: sm, md, lg; `onSurface` prop for dark contexts)
- `Prose`, `LegalPageShell`, `InPageNav`
- `FormField` (with textarea support), `AuthCard`
- `EmptyState`, `LoadingState`
- `CategoryHeroEmpty` (new tier-1 conversion primitive)
- `CategoryLandingPage` template

**Pages shipped:**
- Homepage with hero, featured event card, Culture Picks rail (placeholder)
- Privacy, Terms, Refunds (real legal copy, not placeholder)
- Help Centre with 6 topic cards + dynamic `/help/[slug]` placeholders
- Contact (form with success state, organiser CTA)
- Custom 404
- 7 hero category landing pages at `/categories/[slug]` (need polish in Week 1)
- `/events` listing page (functional, needs polish)
- `/events/[slug]` event detail (needs M4.5 redesign)
- `/dashboard/*` organiser dashboard (functional, needs polish)

**Documentation shipped to repo:**
- `docs/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/DESIGN-SYSTEM.md`
- `docs/design/DESIGN-SYSTEM-V2-BUTTONS-AND-RHYTHM.md`
- `docs/design/FEATURED-MINI-RAIL-SPEC.md`
- `docs/design/MEDIA-UPLOAD-SPEC.md`
- `docs/strategy/DIASPORA-FESTIVAL-POSITIONING.md`
- `docs/epics/SESSION-4-EVENT-RAILS.md`
- `docs/M4.5-BLUEPRINT.md`

**Known open items being addressed in this plan:**
- 7 category landing pages exist but need visual polish (Week 1)
- CTA labels currently say "List your event" but route to `/contact` (Week 1 fix)
- Stripe webhook returns 307 instead of 200 (Week 2 fix)
- Revenue card displays AUD 4 vs actual AUD 3.76 (rounding bug, Week 2 fix)
- Upstash Redis on N. Virginia (Week 6 migration to Sydney)
- Auth flow not yet built (Week 1)
- Image upload pipeline spec exists but not implemented (Week 1)
- Video upload not built (Week 3)
- Search not built — currently filter only (Week 4)
- No category cover imagery (Week 5)
- No production monitoring (Week 6)

---

## 5. The 6-Week Schedule

Every session has a defined goal, a defined deliverable, and a defined verification checklist. Sessions never end until verification passes.

### WEEK 1 — Foundation Completion

**Theme:** Get the marketing surface to launch grade. Build auth. Make image upload real.

**Session 1 — Recovery + Visual Polish**
- Fix CTA label honesty on all 7 category landing pages ("List your event" → "Get in touch to list" until Week 1 Session 2 builds the real signup)
- Restore footer integrity — every Help link works, no over-rewiring
- Visual upgrade on category landing pages: gradient depth, pattern overlays, typography rhythm, value pillar cards with hover, persona pills, accent-bordered final CTA
- Premium-bare hero treatment (Stripe/Linear/Vercel grade without imagery)
- Verify: footer click test (12 links), 7 category pages screenshot review at desktop and 375px

**Session 2 — Auth + Organiser Marketing + Pricing**
- `/auth/signup` — full signup with role selection (attendee / organiser), password strength, terms checkbox, email verification trigger
- `/auth/signin` — sign in, remember me, forgot password link
- `/auth/forgot-password` — request reset email
- `/auth/reset-password/[token]` — set new password
- `/auth/verify-email/[token]` — verify email confirmation
- `/organisers` — full marketing landing page: hero, value props, three pillars, sample organiser personas, pricing snapshot, primary CTA "Start selling tickets"
- `/pricing` — transparent pricing table: Free events (0%), Standard paid (2.5% + AUD 0.50/ticket), Enterprise (contact); FAQ accordion; comparison vs Eventbrite
- All seven category landing page CTAs flip from `/contact?topic=organiser` back to `/auth/signup?role=organiser&category={slug}`
- Footer ORGANISERS column flips back to real destinations
- Verify: full signup → email verification → signin flow tested end-to-end

**Session 3 — Image Upload Pipeline**
- Install `browser-image-compression` package
- Build `lib/upload/compressImage.ts` and `lib/upload/validateImage.ts` per the existing Media Upload Spec
- Wire up event cover image upload in event creation form: validate → compress to WEBP ≤2MB → upload to Supabase Storage → save URL
- Add 2:1 aspect ratio crop UI (use `react-easy-crop` or similar)
- Server-side validation in upload route: MIME check, header signature check, 12 MB cap, rate limit 20 uploads/organiser/hour via Upstash Redis
- Update `next.config.js` with Supabase image transform endpoint
- Replace every `<img>` in event pages with `<Image>` from `next/image`
- Update Supabase Storage bucket policy to 12 MB ceiling
- Verify: upload 9 MB JPEG → compresses → displays sharp; upload 1000×500 → rejected; upload 15 MB → rejected; upload PDF renamed `.jpg` → rejected at server

**Week 1 ships:** Every page exists. Every link works. Auth is real. Image upload is real. Marketing surface is launch-grade.

---

### WEEK 2 — Event Flow Polish + M4.5 Blueprint Completion

**Theme:** The fan and organiser experience is end-to-end production polish.

**Session 4 — Event Detail Page Redesign**
- Implement M4.5 Blueprint Phase 1 (event detail rebuild)
- Cover image hero at 2:1 aspect, full-bleed
- Title + date + venue on the left, sticky ticket panel on the right (desktop)
- Mobile: tickets section prominent, single-column, sticky CTA at bottom
- Organiser info card with verified badge, follower count, "View other events" link
- Description block with proper typography (uses Prose primitive)
- Map embed for venue location
- Share buttons (WhatsApp, X, Instagram, copy link)
- Related events rail at bottom
- Verify: every event field renders correctly, mobile flow tested at 375px

**Session 5 — Mobile Bottom Nav + Sticky Checkout + M4.5 Polish Items**
- Mobile bottom tab bar (Home, Discover, Tickets, Account) — visible <md breakpoint only
- Sticky "Select Tickets" / "Get Tickets" CTA on mobile event detail (M4.5 P1-4)
- Filter sheet auto-open bug fix on `/events` mobile (M4.5 P1-1)
- Checkout error toasts (M4.5 P1-5)
- Loading states everywhere async data is fetched
- Empty states everywhere data could be missing
- Verify: complete mobile fan flow — homepage → discover → event detail → checkout → confirmation, all at 375px

**Session 6 — Bug Sweep + Stripe Hardening**
- Stripe webhook 307 → 200 fix
- Revenue card rounding fix (AUD 3.76 displays correctly)
- Supabase auth-token lock unhandledRejection cleanup
- Pre-existing lint warnings in `join-waitlist-modal.tsx`, `start-squad-modal.tsx`, `payment-calculator.ts` resolved
- M3 fixes verified surviving M4 refactors
- Stripe test → live mode dry run (still in test, but verify the flip path works)
- Verify: 30-min smoke test — full purchase, refund initiation, organiser sees revenue, attendee gets QR

**Week 2 ships:** End-to-end event flow at production polish. Every known bug closed. Mobile experience matches desktop.

---

### WEEK 3 — Video Infrastructure + Media Library

**Theme:** Organisers manage rich media properly. Platform feels modern.

**Session 7 — Mux Integration**
- Sign up for Mux account, create environment, get API keys (US-East1 region for now)
- Add Mux SDK to project
- Build `/api/upload/video` route — generates Mux direct upload URL
- Client-side video upload component with progress, validation (50 MB cap, 30 sec cap, MP4/MOV/WebM)
- Mux webhook handler — receives `video.asset.ready`, stores playback ID in Supabase
- Mux player component using `@mux/mux-player-react`
- Auto-generated poster image from Mux thumbnail API
- Update event detail page to render video when present
- Verify: upload a 30-second 1080p MP4 → encodes → plays back smoothly on event detail page

**Session 8 — Media Library**
- New Supabase table `organiser_media` (id, organiser_id, asset_type [image|video], storage_url, mux_playback_id, thumbnail_url, metadata, created_at)
- Build `/dashboard/media` — grid view of all uploaded media, filter by image/video, search, delete
- Drag-and-drop multi-upload area
- Each media item: preview, file size, dimensions, "use in event" button
- RLS: organisers see only their own media
- Verify: upload 10 mixed photos and videos, manage them, delete one, organise

**Session 9 — Event Creation Integrates Media Library**
- Refactor event creation form to support media library selection ("Choose from library" + "Upload new")
- Cover image picker with preview
- Optional cover video picker
- Image gallery (up to 5 additional images, drag-to-reorder)
- All images served via `next/image` with appropriate sizes
- Verify: create an event using only library media (no fresh upload), then create another event using fresh upload — both work

**Week 3 ships:** Organisers upload professional video and photos. Media library is real. Event pages feel alive.

---

### WEEK 4 — Discovery + Search + Geography

**Theme:** Fans find events the way they actually search.

**Session 10 — Trending Now + Culture Picks Rails**
- Implement Session 4 scope from `docs/epics/SESSION-4-EVENT-RAILS.md`
- Add `tickets_sold_count`, `published_at`, `is_culture_pick`, `culture_pick_sort_order` to events table
- Trending RPC ranks by velocity over last 7 days
- Culture Picks ranked by admin sort order
- Homepage `<MiniRail>` reused for both rails
- Surface alternation: Featured (base) → Trending (alt) → Culture Picks (base)
- Verify: buy 3 tickets on a test event, refresh homepage, event moves up in Trending

**Session 11 — Real Search**
- Decision: Postgres full-text search vs Meilisearch Cloud
  - Default to Postgres FTS (zero new infrastructure, free)
  - Upgrade to Meilisearch in Q3 if relevance becomes a problem
- Add `tsvector` column to events with trigger to auto-update on insert/update
- GIN index for fast lookup
- Build `/api/search` endpoint — returns events matched by title, description, organiser name, venue
- Type-ahead component in homepage hero search bar — debounced, shows top 5 results inline as user types, "See all results" link
- Search results page at `/search?q=` — full grid with filters
- Verify: search "afro" returns Afrobeats events, organiser names match, autocomplete works under 200 ms

**Session 12 — City Pages**
- New route `/cities/[slug]` for: melbourne, sydney, brisbane, perth, london, toronto
- Each city page: hero ("Live events in Melbourne"), upcoming events grid filtered by city, popular categories in this city, "Are you organising in {city}?" CTA
- City detection via venue address country/state/city fields on events
- Footer DISCOVER column expands or "Cities" added as a separate column
- SEO metadata per city
- Verify: `/cities/melbourne` shows only Melbourne events, generates valid OG tags

**Week 4 ships:** Discovery is real — search works, rails populate, cities have homes. Friends/private beta link sent end of this week.

---

### WEEK 5 — Imagery + Global Readiness

**Theme:** The platform looks gorgeous. Ready for non-AU audiences.

**Session 13 — Imagery Production**
- Generate 7 category cover images via Midjourney v7 (one per hero category, 16:9 cinematic, culturally-authentic prompts)
- Generate 6 city hero images (Melbourne diaspora scene, Sydney, Brisbane, Perth, London, Toronto)
- Generate 4 marketing imagery for homepage and About page
- Generate 8 organiser avatar pattern variants (procedural-style)
- Optimise all to WEBP at 1920×1080 hero / 1080×1080 avatar
- Upload to Supabase Storage `brand-assets` bucket
- Create `brand_assets` table with licence tracking per the First-Party Media Pipeline spec
- Drop images into existing `coverImage` props on category landing pages, city pages, homepage hero
- Verify: every category page now has a cinematic cover image, every city page has a local-feeling hero

**Session 14 — Multi-Currency + Locale Detection**
- Browser geolocation + Cloudflare IP country header for default locale
- Currency display switcher in header (AUD, GBP, USD, CAD, EUR, NGN, ZAR)
- Real-time conversion via Frankfurter API (free, ECB rates)
- Stored prices stay in organiser's currency, display converts client-side
- Format dates per locale (dd MMM yyyy for AU/UK, MMM dd yyyy for US)
- Format times per timezone with clear label ("7:00 PM AEST")
- Verify: visit from a UK IP address sees GBP by default, can switch to AUD; event times shown correctly per event timezone

**Session 15 — Social Sharing + SEO Hardening**
- Open Graph image generation per event using `@vercel/og` — dynamic OG images with event title, date, cover image
- WhatsApp share generates clean preview card
- X / Twitter share with hashtags pre-filled
- Instagram-optimised share format (story-ready 1080×1920)
- Schema.org Event markup on every event detail page
- Sitemap.xml auto-generated from events + categories + cities + static pages
- robots.txt with `/dev/*` and `/_next/*` excluded
- Verify: paste an event URL in WhatsApp, see clean preview; Google Rich Results Test passes

**Week 5 ships:** Imagery is real. Multi-currency works. Social sharing is gorgeous. SEO production-ready.

---

### WEEK 6 — Launch Hardening

**Theme:** Production grade. Friends become users.

**Session 16 — Sentry + Error Monitoring**
- Sign up for Sentry (Team plan ~AUD $40/mo)
- Install `@sentry/nextjs`
- Configure source maps for production
- Set up alert rules: any 5xx error, any unhandled promise rejection, payment failure
- Build a `/dashboard/admin/errors` view (admin-only)
- Slack/email alerts for critical errors
- Verify: throw a test error in production, Sentry catches it, alert fires

**Session 17 — Performance Pass**
- Lighthouse audit on homepage, /events, /events/[slug], /categories/afrobeats, /pricing, /organisers
- Fix every page to ≥ 85 Performance, ≥ 95 Accessibility, ≥ 95 Best Practices, ≥ 95 SEO
- Hero video lazy loads on mobile (not blocking FCP on 3G)
- Image lazy loading with proper `sizes` attribute
- Font preloading
- Critical CSS inlined
- Bundle analysis — split, tree-shake, dynamic imports for heavy components
- Verify: Lighthouse mobile homepage ≥ 85 Performance, LCP < 2.5 s on 4G simulation

**Session 18 — Accessibility Audit**
- Full WCAG 2.1 AA audit using axe DevTools
- Screen reader testing (NVDA on Windows, VoiceOver on iPhone simulator if available)
- Keyboard navigation: every interactive element reachable, focus visible, skip-to-content link
- Colour contrast: every text/background pair ≥ 4.5:1 body / 3:1 large
- Form fields: every label associated, errors linked via aria-describedby
- Modal focus traps verified
- prefers-reduced-motion respected globally
- Verify: zero axe critical/serious errors on top 10 routes

**Session 19 — Load Testing**
- Use k6 or Artillery to simulate 1,000 concurrent users hitting a single event page during a ticket drop
- Verify: page renders < 3 s, checkout completes, no Redis cache stampede, no Stripe rate limit
- Tune Supabase connection pooler if needed
- Tune Vercel function concurrency limits
- Document the load profile in `docs/launch/LOAD-TEST-RESULTS.md`

**Session 20 — Production Plan Flip + Launch**
- Upstash Redis: free tier N. Virginia → Fixed 250MB Sydney region (paid)
- Supabase: Free → Pro plan (AUD $40/mo)
- Resend: Free → Pro plan (AUD $30/mo, dedicated IP)
- Mux: dev → production environment
- Sentry: production environment
- DNS: confirm both `eventlinqs.com` and `www.eventlinqs.com` healthy, www redirects to apex
- Stripe: test mode → live mode for real payments (final pre-flight checks)
- Final smoke test of full purchase flow on production with real card
- `hello@eventlinqs.com` monitored
- Send launch link to first 20 friends/family/community organisers
- **PUBLIC SOFT LAUNCH**

**Week 6 ships:** EventLinqs is live. Real money flows. Real organisers list. Real fans buy.

---

## 6. Cost Schedule

What you're paying through the build, week by week.

| Week | New monthly cost | One-off cost | Cumulative monthly |
|---|---|---|---|
| 1 | None | None | ~AUD $42 |
| 2 | None | None | ~AUD $42 |
| 3 | Mux dev tier (~$10) | None | ~AUD $52 |
| 4 | None | None | ~AUD $52 |
| 5 | None | Midjourney generation ~AUD $50 | ~AUD $52 |
| 6 | Supabase Pro $40, Resend Pro $30, Upstash Sydney $15, Sentry $40, Mux production ~$30 | None | ~AUD $207–$250 |

**One-offs:**
- Week 5 imagery generation: AUD $50
- Q3 commissioned photography (post-launch v2): AUD $500–$2,000

**By end of Week 6 monthly steady state:** ~AUD $200–$250/month for a launch-ready platform competing with Ticketmaster, DICE, and Eventbrite.

---

## 7. Definition of Done — The Gate

Before public soft launch (end of Week 6), every item below must be true. This is the absolute gate.

**Functional:**
- [ ] Every page on the platform exists and resolves (no 404s on linked pages)
- [ ] Every CTA goes where its label says it goes
- [ ] Signup, signin, password reset, email verification all work end-to-end
- [ ] Organiser can create an event with cover image and cover video
- [ ] Fan can browse, search, filter, view, purchase, receive QR ticket, attend
- [ ] Organiser can view sales, attendees, revenue, and trigger payouts
- [ ] Stripe webhook returns 200 (not 307)
- [ ] All known bugs in Section 7 of Production Readiness Charter closed

**Visual:**
- [ ] All 7 hero category pages have real cover imagery
- [ ] Homepage hero has real video or imagery
- [ ] Mobile experience tested on real iPhone and Android device, not just DevTools
- [ ] Every page has loading state, empty state, error state designed
- [ ] No `console.log` debug statements visible in production

**Content:**
- [ ] Privacy, Terms, Refund policies are real first-draft legal copy
- [ ] No lorem ipsum, no "TBD," no placeholder text anywhere
- [ ] All dates display in user's locale
- [ ] All currency displays correctly with proper symbol

**Performance:**
- [ ] Lighthouse Performance ≥ 85 mobile on top 5 routes
- [ ] LCP < 2.5 s on 4G simulation
- [ ] CLS < 0.1 across all pages

**Trust & Safety:**
- [ ] Sentry catching errors with alerts firing
- [ ] HTTPS enforced everywhere
- [ ] Auth rate limiting in place
- [ ] Stripe in live mode with verified webhook
- [ ] Rate limit on uploads enforced
- [ ] Test purchase completed on production with real card

**Globalisation:**
- [ ] Multi-currency display working
- [ ] Locale detection working
- [ ] Timezone handling correct on every event time display

**Operations:**
- [ ] `hello@eventlinqs.com` actively monitored
- [ ] Stripe payouts schedule confirmed
- [ ] Supabase Pro plan active
- [ ] Backup verification

If any item above is not true, launch is delayed. No exceptions. The plan is the plan.

---

## 8. How We Work (Session Discipline)

**Before every session:**
- Confirm which session number from this plan we're running
- Read the session goal and deliverables out loud (literally — say them in chat)
- Confirm Claude Code session is fresh (`/exit` and re-launch if more than 2 hours of work in current session)

**During every session:**
- Claude Code runs the command Claude (chat) writes
- No mid-session scope expansion. New ideas get logged in the "parking lot" below.
- Verification step is not optional. Screenshots are not optional.

**After every session:**
- Verify against the session's deliverables
- Update Production Readiness Charter checkboxes
- `git add . && git commit -m "session N: <goal>" && git push`
- Update this plan with anything that drifted (only with founder approval — written here, not in chat)

**Week boundaries:**
- End-of-week checkpoint: review the week's "ships" criterion. Does it hold?
- If not, decide: extend the week, or move work to next week's parking lot
- Never skip the checkpoint

---

## 9. Parking Lot — Ideas Logged, Not Yet Scheduled

Things that come up during the build that are good but not in this plan. They get parked here, evaluated at week boundaries, and either added in writing to the plan (with founder approval) or deferred to v2.

- (Empty at plan lock. Will populate as we build.)

---

## 10. Risk Register

What could go wrong and how we handle it.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mux integration takes longer than 1 session | Medium | Medium | Spillover to Session 8; if Session 8 is at risk, defer media library to Week 4 and slip Week 4 by one session |
| Midjourney imagery doesn't feel culturally authentic | Medium | High | Generate in Week 5 not Week 6 to leave time to regenerate or pivot to commissioned photography for Week 6 |
| Lawal sick or work shifts spike | Medium | Medium | Each week has 1 buffer session built in by counting 3-4 sessions per 7 days |
| Supabase Free tier hits limits before Week 6 | Low | High | Watch usage daily from Week 4; flip to Pro early if needed |
| Stripe verification delay for live mode | Medium | High | Submit live mode application Week 4 not Week 6 — typical approval is 1-3 days but plan for 2 weeks |
| Vercel hits Pro plan function limits | Low | Medium | Already on Pro; monitor usage, function concurrency, bandwidth |
| AI image licence ambiguity | Low | Medium | Use Midjourney paid plan (commercial rights confirmed); document every image's prompt + date in `brand_assets` table |
| Footer / link regressions during refactors | Medium | Low | Add Playwright test that clicks every footer link and asserts each resolves to a 200 — runs in CI from Week 2 onward |
| Founder burnout | Medium | High | Sessions are 1-3 hours, not marathons. End-of-week checkpoint asks "are you energised or drained?" Honest answer drives next week's pace. |

---

## 11. Communication Protocol

**Lawal → Claude:**
- Start each build session: "Ready for Session N." Claude writes the command for that session.
- Mid-session questions: short and specific. "Should X be Y or Z?" not "what do you think about everything."
- End-of-session report: paste Claude Code's final output + screenshots if visual.
- Scope concerns: name them at week boundaries, not mid-session, unless they're blocking.

**Claude → Lawal:**
- Each session command opens with the session number and goal.
- Each session command ends with a verification checklist.
- If a session is at risk of running long, Claude flags it before the work starts.
- If a session uncovers a real architectural issue, Claude stops, names it, and proposes options before continuing.

**Both:**
- Decisions get written into this plan, not just said in chat.
- Disagreements get resolved by referring to the operating principles (Section 2) and the gate (Section 7).
- Rest is part of the plan. Tired founders make bad decisions; tired engineers ship bugs.

---

## 12. The Promise

This plan is the contract.

Lawal promises: trust the plan. No mid-session scope changes. End-of-week checkpoints honoured.

Claude promises: never break working things. Every session command is checked against this plan before being sent. Every CTA matches its destination. Every link works at session close.

Both promise: ship something we're proud of. Not something we're rushed about. Not something we'll redo. Something that lasts.

End of May 2026. EventLinqs goes live. Together.

---

**Master Plan V1 — locked 15 April 2026.**
**Next step: Week 1 Session 1, tomorrow.**
