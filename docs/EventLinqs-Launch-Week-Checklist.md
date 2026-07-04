# EventLinqs Launch Week: the full checklist and tool stack

Founder: Lawal. Target: national public launch across Australia (Sydney, Melbourne,
Brisbane first). Window: Monday to end of Friday this week (5 days). Today is Monday.

This is the operating plan. It carries to every chat. The repo and this file are the
source of truth, not memory. Dash rule followed (no dashes in prose to Lawal).

Principle on spend: do NOT buy paid tools before launch. Free tiers and what is already
in the stack carry pre-launch. Paid tools earn their place launch week with real traffic.

---

## STATUS TO VERIFY FIRST (do not assume)

The demand engine (who's-going social proof, follow graph, personalised discovery feed,
push notifications) is written into Scope v5 as core, with discovery feed, follow,
trending and social proof marked in-scope and push notifications and SEO flagged as gaps
to add. What is NOT confirmed is how much is wired and tested on the unified line right
now. Settle it with one CC prompt before trusting it in the launch plan:

  "Report honestly on the demand engine on release/launch-line. For each of these state
   BUILT and where, with test coverage, or NOT BUILT, by reading the code, not assuming:
   (1) attendee taste/follow graph, (2) personalised discovery feed, (3) web-push plus
   email alert engine, (4) who's-going social proof, (5) follow organisers. Reference
   docs/MOAT-DEMAND-ENGINE-PLAN.md and docs/EventLinqs_Scope_v5.md. Short factual answer
   per component, then a one-line verdict: is the launch-day demand engine BUILT or not."

Whatever comes back is the truth we plan on. Anything NOT BUILT that is launch-critical
gets built this week; anything genuinely post-launch gets parked honestly.

---

## DAY-BY-DAY (5 days)

### Day 1 (Mon, tonight when home from work): PREVIEW PROOF
- [ ] Set the 5 Vercel PREVIEW env vars (Preview environment only, Production untouched):
      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
      to TEST project values; STRIPE_SECRET_KEY=sk_test, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test.
- [ ] CC deploys fresh preview (adds deploy-only .vercelignore to fix the 2.4GB upload),
      runs STEP 4: Lighthouse 95+ desktop AND mobile, link crawler (zero dead links incl
      /cultures to /communities redirect), axe zero violations, competitive benchmark vs
      Ticketmaster and Eventbrite at 1440 and 390, live organiser-flow walkthrough.
- [ ] Lawal lays eyes on the preview URL: the finished launch candidate.
- [ ] Run the demand-engine verification prompt above. Record the verdict here.

### Day 2 (Tue): CLOSE PRE-LAUNCH HARDENING
- [ ] Supabase Auth Site URL = https://www.eventlinqs.com (verify in dashboard).
- [ ] Resend SMTP in Supabase Auth so auth emails send from noreply@eventlinqs.com.
- [ ] Resend domain DNS verified (SPF, DKIM) so mail does not spam-folder.
- [ ] Mapbox public token URL-restricted to eventlinqs.com and www.eventlinqs.com.
- [ ] Upstash Redis migrated N. Virginia free tier to Sydney Fixed 250MB.
- [ ] supabase.auth.getSession() replaced with getUser() where identity trusted server-side.
- [ ] Missing /public/cities/*.svg assets fixed (no 404s on homepage).
- [ ] Stripe revenue card rounding display bug fixed.
- [ ] Migration reconcile: npx supabase migration list --linked, all reconciled.
- [ ] Em-dash scrub pass on seed data and components.
- [ ] Anything the demand-engine verification marked NOT BUILT and launch-critical: build it.

### Day 3 (Wed): FOUNDER RUNBOOK (production secrets, one block per service)
- [ ] Stripe LIVE activation: business details approved, live keys, live webhook endpoint.
- [ ] Production env vars set in Vercel PRODUCTION: live Supabase (Sydney prod), live Stripe.
- [ ] Credential rotation: Sydney DB password, Google Maps API key, PSI key.
- [ ] Google Maps Places API key restricted to your domains.
- [ ] Confirm all production env present and correct (one block per service, no gaps).

### Day 4 (Thu): PRODUCTION DEPLOY + FIRST REAL PURCHASE
- [ ] Apply the 6 new migrations to PRODUCTION Supabase (culture to community + funds-holding).
- [ ] Deploy unified line (release/launch-line) to PRODUCTION.
- [ ] First REAL card purchase end to end on the live site (you buy a ticket to a real test
      event with a real card, confirm funds held, ticket issued, receipt sent).
- [ ] Smoke test live: sign-up, create event, upload image, publish, buy, refund path.
- [ ] Confirm push and email alerts fire on the live site (if demand engine verified built).

### Day 5 (Fri): LAUNCH
- [ ] Seed the launch events across Sydney, Melbourne, Brisbane (real events, no placeholder).
- [ ] Concierge the first organisers personally (the locked GTM: first 10 by hand).
- [ ] Announce across the 5 socials (LinkedIn, Facebook, Instagram, X, TikTok).
- [ ] Monitor Sentry, Plausible, Stripe dashboard live through launch day.
- [ ] LIVE. National. Public.

---

## THE TOOL STACK (what to set up, by stage, with the honest spend call)

### Already in your stack: keep, do not replace
- Resend: transactional email (receipts, auth). Already wired. KEEP.
- Plausible: privacy-clean web analytics, Australia-friendly. Already referenced. KEEP.
- Web push (native PWA): you are a PWA, so push is native, no vendor for the basics.
- Sentry: error monitoring, working in prod. KEEP.
- Stripe Connect: payments, funds-holding proven. KEEP.

### Launch week (free or near-free; set up now)
- Resend Broadcasts OR Loops: marketing and lifecycle email (launch announcement, weekly
  "events in your city" newsletter). Loops is cleaner for a founder. NOT Mailchimp.
- PostHog (free tier): product analytics and funnels. Shows where event-goers drop in
  checkout, which is your highest-value insight at launch. Add alongside Plausible.
- Google Search Console (free): submit sitemap, watch indexing for SEO from day one.
- Buffer (free tier): schedule posts across the 5 socials so you are not posting manually.

### Week two to month two (paid, only once traffic justifies)
- Semrush OR Ahrefs: keyword and competitor SEO research. Ahrefs has slightly better
  backlink data; Semrush is the broader suite. Start with ONE paid month when you attack
  programmatic SEO on your scene-city pages, not before. (The "forkline" tool Lawal saw on
  YouTube: get the name when he shares the video, research it against Semrush/Ahrefs, give
  evidence, let him decide. Do not adopt on a YouTuber's say-so.)
- OneSignal (free tier, paid as you scale): web push scheduling and segmentation if you
  want it managed rather than hand-built.
- Instantly: cold email sequencing to organisers when you start outbound. Later, not launch.

### The YouTube build-in-public kit (he wants to start NEXT WEEK)
Get ready this week so he can record next week:
- Screen + camera capture: OBS Studio (free) for screen recording, or the built-in
  recorder. A decent USB mic matters more than the camera; a phone camera is fine to start.
- Editing: CapCut (free, fast for shorts and longform) or DaVinci Resolve (free, more
  powerful). Start with CapCut for speed.
- Thumbnails and brand visuals: Canva (free tier, already connected as a tool) using the
  navy/gold EventLinqs brand assets just built.
- Creative engine (parked, post-launch, his pick): Higgsfield for hero images, launch
  videos, social ads, branded creative in navy/gold with hook framing. Build the
  EventLinqs-branded creative skill set after launch.
- Scripting loop: the established Hook, Point, Proof, Punch framework. He describes what he
  shipped, it gets distilled to four beats, he speaks from anchors. Full script only for
  high-stakes takes.
- Cadence: one build-in-public video per shipped feature or milestone, repurposed into
  shorts for the 5 socials via Buffer.

---

## POST-LAUNCH (parked, do not forget, build on the LIVE earning platform)

### The agentic growth engine + AI operating system (the NEXT major workstream)
Built AFTER launch, on real traffic and data, never before:
- Lead-generation funnels: organisers AND event-goers (landing page + form into DB to
  start; Framer for pages if a builder is wanted).
- Marketing agents and super-agent automation: sales/marketing automation, the AI
  operating system that governs the whole growth machine.
- Organic/SEO engine: programmatic SEO for every scene-city combination (this is where the
  one paid Semrush/Ahrefs month earns out).
- Web-push + email lifecycle: the alert engine sharpened with real behaviour data; the AI
  tuning layer (lookalike, predictive demand, campaign autopilot, fill-gap) sharpens as
  data arrives.
- Higgsfield creative skill set: branded creative at scale.
Ties to docs/MOAT-DEMAND-ENGINE-PLAN.md and .claude/skills/event-demand-engine/SKILL.md.

### The global community-support footer statement (parked, substance first)
Build the real audited donation/partnership programme (Humanitix model) FIRST, then make
the claim. Understated, footer only, never bold, never in the design. An unsubstantiated
claim risks Australian consumer-law scrutiny.

### Accountant
Confirm the limited-agent GST posture (organiser stays GST seller of ticket, EventLinqs
remits GST on its fee only) with an accountant post-launch.

---

## CLAUDE'S STANDING JOB (so Lawal does not have to remember or ask)
At each stage, Claude proactively says: "Lawal, before launch we need X. For this stage
the right tools are Y, here is why, here is the free vs paid call." Research the current
best tools with evidence, the same way design is benchmarked against competitors, and let
Lawal decide. Never wait to be asked. Never adopt a tool on hype. Never overpay pre-launch.
