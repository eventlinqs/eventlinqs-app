# HANDOVER — EventLinqs Session 2a

**Date:** 19 April 2026
**Branch state at handover:** main, up to date with origin
**Last commit:** aeef124 feat(polish): Session 1 v2 polish — help content, ButtonPair, CTA collapse, dash sweep

---

## PROJECT CONTEXT

EventLinqs. Diaspora-first event ticketing platform. Self-serve like Eventbrite. Open to the world, marketed to the African diaspora.

**Stack:** Next.js 16.2.2 (Turbopack), Supabase, TypeScript, Tailwind, Stripe, Resend, Upstash Redis.
**Repo:** github.com/eventlinqs/eventlinqs-app
**Local:** `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app`
**Supabase project:** cqwdlimwlnyaaowwcyzp
**Domain:** eventlinqs.com (Vercel Pro, SSL active)

**Founder:** Lawal Adams. Geelong/Melbourne Australia. Sole trader, ABN.

**Claude Code environment:** Opus 4.7, xhigh effort. Version 2.1.112.

---

## POSITIONING DECISIONS LOCKED (NON-NEGOTIABLE)

### Decision A — Self-serve organiser model (like Eventbrite, NOT like DICE)

- Anyone signs up as an organiser in 5 minutes.
- No approval gate on the person.
- Events are reviewed for policy compliance within 24–48 hours after submission, not before the organiser can sign up.
- Returning organisers with clean track records get faster reviews over time.
- No mandatory onboarding calls. Ever. Replace any reference to "onboarding call" in the codebase with "in-product guidance and email support."

### Decision B — "Built for culture" brand positioning

- Platform is open to everyone. Nigerian mate's birthday party, white Australian's wedding, Indian cultural festival — all welcome.
- African diaspora is the MARKETING focus and the brand's cultural soul.
- African diaspora is NOT a USAGE restriction.
- Category pages (Afrobeats, Amapiano, Gospel, Owambe, Caribbean, Heritage, Business) signal who we serve best, but nothing on the platform says "you must be diaspora to use this."
- Tagline stays: "The ticketing platform built for Africa, its diaspora, and every community that knows how to celebrate." (This line is already inclusive. Keep it.)
- Hero copy, help content, category copy must not read as exclusive to diaspora.

### Decision C — Fee model

- No upfront fees for organisers.
- Free events: zero platform fees, permanently.
- Paid events: percentage booking fee, split between EventLinqs and organiser.
- Fee caps protect buyer trust.
- All-in pricing at checkout. No surprise fees at final step.

---

## SESSION 2a SCOPE

**Goal:** Every link works. Every page that is linked to, exists. All positioning contradictions removed. Platform is demo-ready for showing to friends and early partners.

**NOT in scope for 2a (goes to 2b):**
- Full auth flow (/auth/signup, /auth/signin, password reset, email verification)
- Seat selector rebuild and sold-out UX
- Seat selector twitching bug fix
- Pillar card hover consistency full pass
- Nav hover state extension (gold-on-hover on Browse Events, For Organisers, Sign in)
- Logo refinement concepts
- Organiser dashboard polish
- Checkout flow polish

---

## SCOPE MANIFEST

### AUTHORISED TO MODIFY

- `src/lib/help-content.ts` (major rewrite to reflect Decisions A and B)
- `src/app/help/page.tsx` (help hub — fix any slug mismatches in the topic grid links)
- `src/app/help/[slug]/page.tsx` (verify slug routing still works after content rewrite)
- `src/app/page.tsx` (homepage hero and feature bullets, reframe for Decision B)
- `src/components/layout/site-header.tsx` or wherever "For Organisers" nav link lives
- `src/lib/hero-categories.ts` (category copy sweep for Decision B tone)
- `src/components/templates/CategoryLandingPage.tsx` (organiser CTA copy)
- `src/app/contact/page.tsx` (any "organiser" references that reference vetting)

### AUTHORISED TO CREATE

- `src/app/organisers/page.tsx` (new /organisers landing page — the page "For Organisers" nav currently 404s to)
- `src/app/pricing/page.tsx` (new /pricing page — currently linked to but doesn't exist, produces 404)
- `src/app/organisers/signup/page.tsx` (placeholder page — "Coming soon in Session 2b. Meanwhile, join the waitlist or contact us." Links to /contact?topic=organiser)
- `src/components/templates/OrganisersLandingPage.tsx` (layout component for /organisers)
- `src/components/templates/PricingPage.tsx` (layout component for /pricing)

### DO NOT TOUCH

- Any file in `src/app/api/`
- Any Stripe, Supabase, Resend, Upstash integration files
- Any M4 ticketing engine files (seat-selector.tsx, ticket-selector.tsx, waitlist, squads, checkout)
- Any auth files (/auth/ routes, NextAuth config)
- package.json, tsconfig, next.config, tailwind.config
- Database migrations
- Queue room (`src/app/queue/[slug]/queue-room.tsx`)
- Organiser dashboard under `src/app/(organiser)/`

---

## TASK 1 — Fix all broken links and 404s

### Step 1.1: Help hub slug mismatches

Inspect `src/app/help/page.tsx` and confirm that every topic link points to a slug that EXISTS in `src/lib/help-content.ts`.

Current help-content.ts slugs:
- `getting-started`
- `buying-tickets`
- `selling-tickets`
- `payments-and-payouts`
- `account-and-privacy`
- `contact-us`

Reported 404s on `/help/account` and `/help/payments-and-payouts`.

**Fix:** every link on /help hub must match one of the six slugs above exactly. If the help hub uses "account" instead of "account-and-privacy", fix the link. If it uses "payments" instead of "payments-and-payouts", fix the link. Grep for any occurrence of `/help/{something}` across the codebase and verify every one resolves to a real slug.

### Step 1.2: /organiser 404

The "For Organisers" nav link currently goes to `/organiser` and 404s. See Task 3 (new /organisers page). Update the nav link href to `/organisers` (plural, matches new page route).

### Step 1.3: /pricing 404

The "View pricing" button on the homepage and the "Pricing" link in the footer currently 404. See Task 4 (new /pricing page).

### Step 1.4: Homepage Culture Picks category filter pills

Afrobeats, Amapiano, Gospel, Comedy, Owambe, Business filter pills on the homepage are clickable but go nowhere.

**Fix:** Each pill should link to `/categories/{slug}`. Use the existing slugs in hero-categories.ts. If "All" is selected, no redirect needed — it stays on homepage showing all categories. When a specific category is clicked, navigate to the category landing page.

Confirm EVERY link on the homepage, help hub, footer, and main nav resolves to a real page. No 404s. If a link can't be resolved because the destination page doesn't exist yet in 2a, either remove the link entirely OR change it to a working alternative (e.g. /contact).

---

## TASK 2 — Rewrite help content for Decisions A and B

**File:** `src/lib/help-content.ts`

Apply these changes across all 6 topics. Rewrite affected answers completely — do not patch-edit.

### Rewrite rules

**1.** Every answer that currently says "EventLinqs is a curated platform" or "not open signup" or "we review applications" must be rewritten to reflect self-serve signup.

OLD pattern: "EventLinqs is a curated platform. We do not offer open signup for organisers. New organisers apply through our website, and we review each application before granting access to list events."

NEW pattern: "EventLinqs is open to all organisers. Create your organiser account in minutes and start building your first event straight away. Every event is reviewed against our content and safety policy within 24 to 48 hours of being submitted for publishing. Most events are approved the same business day."

**2.** Every reference to "mandatory onboarding call" or "before your first event goes on sale we schedule a call" must be removed. Replace with in-product guidance language.

OLD pattern: "Approved organisers are scheduled for a short onboarding call with our team."

NEW pattern: Remove this Q&A entirely OR replace with: "New organisers get step-by-step guidance during the event creation flow in the platform itself. If you need help, our support team replies within 1 business day via the contact form."

**3.** Every reference to "vetting" or "approval of the organiser" must be rewritten to refer to EVENT review, not ORGANISER review.

OLD pattern: "We review your application details... We are looking for genuine event organisers with real events to list, not ticket resellers."

NEW pattern: "Every event submitted for publishing is reviewed against our content and safety policy. Most are approved the same business day. Reviews focus on event details, pricing legitimacy, and policy alignment. We don't gatekeep organisers; we make sure events meet our standards."

**4.** Every reference to "built for diaspora" that implies USAGE restriction must be softened. It's fine to say "EventLinqs was built with African culture and diaspora communities in mind" or "Our platform celebrates African culture." It's NOT fine to say "EventLinqs is for African people" or anything that reads as gating by ethnicity.

Keep: "Our audience is African people and the African diaspora worldwide" in the context of who the brand serves culturally.

Add: "Anyone can organise any kind of event on EventLinqs. We welcome organisers and buyers from every community."

**5.** The "I am an organiser based in Africa" Q&A in Getting Started and Contact Us topics stays as-is (it's a welcoming message), but soften the "we are actively building toward Africa launch" line to "we are expanding to support events across Africa, and we want to hear from you."

### Specific Q&As to rewrite in full

**A.** Getting Started > "How do I list an event on EventLinqs?"

New answer: "Sign up as an organiser in minutes. Go to 'For Organisers' at the top of any page and click 'Start selling tickets.' Create your account, build your first event, and submit it for publishing. Every event is reviewed against our content and safety policy within 24 to 48 hours, and most are approved the same business day. No approval gate on organisers, only on events."

**B.** Selling Tickets > "Can anyone sell tickets on EventLinqs?"

New answer: "Yes. Anyone can create an organiser account and start building events straight away. We welcome organisers from every community and for every kind of event, from concerts and cultural festivals to birthday parties, weddings, and corporate events. Every event goes through a content and safety review before it publishes, usually within 24 to 48 hours."

**C.** Selling Tickets > "How do I apply to become an organiser?"

Rename to: "How do I become an organiser?"

New answer: "Sign up for an EventLinqs account, then click 'Become an organiser' from your dashboard. You'll be asked for your organisation or artist name, a contact email, and a payout account for when your events earn revenue. That's it. You can start building your first event immediately."

**D.** Selling Tickets > "What does the vetting process involve?"

Rename to: "How does event review work?"

New answer: "Every event you submit for publishing is reviewed against our content and safety policy. We check that event details are accurate, that pricing is fair, and that the event complies with our platform terms. Most reviews are completed the same business day. Once approved, your event goes live immediately on the platform. For returning organisers with a clean track record, reviews become faster over time."

**E.** Selling Tickets > "What happens after I am approved?"

DELETE this Q&A entirely. It's redundant once we're self-serve.

**F.** Contact Us > "I am an organiser or venue based in Africa. Can I work with EventLinqs?"

Keep, but soften the second paragraph per rule 5 above.

**G.** Audit EVERY other Q&A for references to vetting, approval, curated platform, onboarding calls, and exclusivity to diaspora. Fix each one to match Decisions A and B.

Voice rules remain: no dashes, no exclamation marks, Australian English, plain English, confident tone, no corporate fluff.

---

## TASK 3 — Build /organisers landing page

Create `src/app/organisers/page.tsx` and `src/components/templates/OrganisersLandingPage.tsx`.

### Structure

**1. Hero section** (dark background, matching category page aesthetic)
- Eyebrow: "FOR EVENT ORGANISERS"
- Headline: "Sell tickets. Keep more."
- Subheadline: "Transparent fees, real-time analytics, squad booking, and a checkout your fans will actually complete. Built for organisers who take their events seriously."
- Primary CTA: "Start selling tickets" → /organisers/signup
- Secondary CTA: "View pricing" → /pricing
- Use the existing ButtonPair component for the coupled hover effect

**2. Three value pillars section** (reuse pillar card component, use the existing 2px lift + gold border hover):
- Pillar 1: "All-in pricing" — "What the buyer sees at checkout is what they pay. No surprise fees at the final step. Fee caps protect buyer trust."
- Pillar 2: "Real-time tools" — "Sales dashboard, guest list, check-in scan app, payment integration. Everything you need to run the event day."
- Pillar 3: "Self-serve from day one" — "Sign up in minutes. Build your event. Submit for review. Go live. Most events are approved the same business day."

**3. How it works section** (4-step, numbered):
1. Create your organiser account (1 minute)
2. Build your event with our event creation flow (5 to 15 minutes depending on complexity)
3. Submit for review (reviewed within 24 to 48 hours, most same business day)
4. Go live and sell tickets

**4. Who can use EventLinqs section:**
- Headline: "Open to every community"
- Body: "EventLinqs was built with African culture and diaspora communities in mind, and that shows in everything we do. But our platform is open to every organiser and every community. Weddings, birthday parties, cultural festivals, concerts, corporate events, conferences, faith events. If it brings people together, it belongs here."

**5. FAQ section** with 4–6 common organiser questions (pull from help-content.ts selling-tickets topic, show as accordion)

**6. Final CTA band** (dark, single CTA):
- "Ready to sell tickets?"
- Single button: "Start selling tickets" → /organisers/signup

All copy must honour Decisions A and B. No mentions of vetting. No mandatory onboarding calls. No exclusive-to-diaspora framing.

---

## TASK 4 — Build /pricing page

Create `src/app/pricing/page.tsx` and `src/components/templates/PricingPage.tsx`.

### Structure

**1. Hero section:**
- Eyebrow: "PRICING"
- Headline: "Simple. Transparent. Fair."
- Subheadline: "No upfront fees. No surprise charges. Pay only when you sell paid tickets."

**2. Three pricing tiers** (card layout, pillar card styling):

**Tier 1 — Free Events**
- Price: "Free forever"
- Description: "Host any free event at zero cost. No platform fees. No hidden charges. Keep every dollar you collect."
- Bullet list:
  - Unlimited free events
  - Unlimited tickets
  - All platform features included
  - Real-time sales dashboard and scan app
- No CTA (or a subtle "Get started" link)

**Tier 2 — Paid Events** (the main tier, visually emphasised)
- Price: "From 2.9% + AUD 0.59 per paid ticket"
- Description: "Industry-leading rates. Split transparently between EventLinqs and your payment processor. Pass the fee to buyers or absorb it into your ticket price, your choice."
- Bullet list:
  - All features from Free tier
  - Squad booking and group ticketing
  - Discount codes and tiered pricing
  - Advanced sales analytics
  - Dedicated payout support
- CTA: "Start selling tickets" → /organisers/signup

**Tier 3 — Enterprise**
- Price: "Custom"
- Description: "For venues, festivals, and high-volume organisers. Custom rates, dedicated support, and white-label options available."
- Bullet list:
  - Custom pricing for high volume
  - Dedicated account manager
  - White-label event pages (optional)
  - Custom integrations and reporting
- CTA: "Contact us" → /contact?topic=partnership

**NOTE ON FEE NUMBERS:** If the actual fee rate is set elsewhere (database config or a constants file), reference that source. If no fee is configured yet, use "2.9% + AUD 0.59" as a placeholder and add a code comment noting this needs to be made configurable by Lawal before launch. DO NOT hardcode fees anywhere; all fees must be admin-configurable per the master plan.

**3. FAQ section** with 5–6 pricing-specific questions (draw from help-content.ts payments-and-payouts topic):
- What counts as a "paid ticket"?
- Who pays the booking fee, me or the buyer?
- What currencies do you support?
- When do I get paid after my event?
- What payment methods do buyers use?
- Do you charge for refunds?

**4. Final CTA band:**
- "Ready to see it in action?"
- Primary CTA: "Start selling tickets" → /organisers/signup
- Secondary CTA: "Talk to us" → /contact?topic=organiser

---

## TASK 5 — Build /organisers/signup placeholder

Create `src/app/organisers/signup/page.tsx`.

This is a PLACEHOLDER for 2b. Purpose: avoid 404s when users click "Start selling tickets" CTAs we just added.

**Content:**
- Hero-style page, dark background matching category aesthetic
- Headline: "Organiser signup is almost ready."
- Subheadline: "We're putting the final touches on the organiser signup flow. In the meantime, join the waitlist and we'll notify you the moment it's live, usually within a few days."
- Primary CTA: "Join the waitlist" → /contact?topic=organiser (or a dedicated waitlist form if easier)
- Secondary CTA: "Learn more about selling tickets" → /organisers

NO form submission. NO Stripe onboarding. NO Supabase user creation. This is a landing placeholder only.

Include a small note at the bottom: "Already an approved organiser? Contact us at hello@eventlinqs.com and we'll help you get set up."

---

## TASK 6 — Homepage hero and copy reframe

**File:** `src/app/page.tsx`

Current hero copy bullets include "Africa-ready: mobile money, WhatsApp sharing" which is great and stays.

Reframe any copy that reads as exclusive to diaspora. Audit the hero section, feature bullets, and all section copy.

**Specific changes:**
- Keep the "FOR EVENT ORGANISERS / Sell tickets. Keep more." block exactly as shown in the live screenshots.
- Add a small bullet before "Africa-ready": something like "Built for every community" or "Open to every culture and every event type". Something that signals the platform is open.
- Audit any hero subtitles or section headers for accidental exclusivity.

---

## TASK 7 — Category page organiser CTA audit

**File:** `src/components/templates/CategoryLandingPage.tsx` and `src/lib/hero-categories.ts`.

Audit the copy across all 7 category pages for references to "approved organisers", "vetted promoters", or "curated platform" that imply gatekeeping. Rewrite to match Decision A.

The final CTA band button ("Talk to us about your event") stays. The destination stays (/contact?topic=organiser&interest={slug}).

Update the copy around the CTA to feel welcoming to anyone, not exclusive.

---

## TASK 8 — Contact page sweep

**File:** `src/app/contact/page.tsx` and `src/components/features/contact/ContactForm.tsx`.

Audit contact topic options. Ensure there's a topic option called "Organiser enquiry" or "Become an organiser". The existing /contact?topic=organiser query param should pre-select this topic.

Ensure no copy on the contact page references vetting or approval gates.

---

## BUILD + VERIFICATION

After all tasks:

1. Run: `npm run build`
   Must: zero errors, zero new warnings

2. Run: `git status`, `git diff --stat`
   Confirm only the authorised files are modified or created.

3. Click-through verification (Lawal does this manually after CC reports):
   - Homepage → every nav link, every CTA, every footer link resolves
   - Help hub → all 6 topic cards work
   - Every help topic page loads and expands Q&As
   - /organisers loads and all CTAs resolve
   - /pricing loads and all CTAs resolve
   - /organisers/signup loads (placeholder)
   - /contact loads, topic pre-selection works
   - All 7 category pages load and final CTA resolves
   - Homepage Culture Picks filter pills each navigate to the correct category page

4. Commit message: `feat(session-2a): all links resolve, /organisers + /pricing pages, help content rewrite for self-serve signup, positioning fixes`

5. DO NOT PUSH. Report back for review. After Lawal reviews and confirms, he pushes in Tab 4 manually.

---

## RULES OF ENGAGEMENT

- Do not modify any file outside the authorised list.
- Do not install new dependencies.
- Do not introduce new design tokens. Use existing semantic tokens from globals.css.
- Do not refactor unrelated code that you notice along the way. Flag it as an observation but do not fix it.
- If a task conflicts with existing implementation in a way the spec doesn't cover, STOP and report rather than guessing.
- If help-content.ts changes would require changes to help/[slug]/page.tsx rendering logic, STOP and confirm before modifying the render logic.
- Maintain the no-dashes voice rule across ALL new content.
- Print full diffs for help-content.ts, /organisers page, /pricing page, /organisers/signup placeholder before committing. These are the high-stakes content artefacts.

**END OF HANDOVER.**
