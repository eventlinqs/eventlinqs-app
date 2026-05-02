# EventLinqs - Production Readiness Charter

**Status:** ACTIVE - gates every session from 15 April 2026 onward
**Owner:** Lawal Adams
**Bar:** "Wow our competitors - Ticketmaster, DICE, Resident Advisor, Partiful. Not mediocre."
**Rule:** No session closes until every applicable item on this checklist passes. Before sending the platform to anyone outside the build team, every item must pass.

---

## Section 1 - The Non-Negotiables (zero tolerance)

These are hard gates. One failure = not ready.

- [ ] **Zero 404s.** Every link in the navigation, footer, buttons, cards, and breadcrumbs resolves to a real page. No "coming soon" pages behind primary CTAs.
- [ ] **Zero console errors** in production build on Chrome, Safari, Firefox (desktop) and iOS Safari, Chrome Android (mobile).
- [ ] **Zero unhandled promise rejections** in the server logs during a 10-minute smoke test.
- [ ] **Every form submits cleanly** with a success state *and* an error state that the user actually sees (toast, inline message, or banner - not silent).
- [ ] **Every button has hover, active, focus, and disabled states.** No static buttons. No "dead click" feedback.
- [ ] **Every page renders correctly at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1280px (laptop), 1920px (desktop).**
- [ ] **Every image loads, has alt text, and displays at the correct aspect ratio.** No broken image icons. No stretched or cropped hero images.
- [ ] **SSL certificate valid on `eventlinqs.com` and `www.eventlinqs.com`.** HTTPS everywhere. `www` redirects to apex (or vice versa - one canonical URL).
- [ ] **No placeholder text in production** - no "Lorem ipsum", no "Event Title Here", no `[TODO]`, no `console.log` debug statements visible.

---

## Section 2 - Design Consistency

Every page must feel like the same product.

- [ ] **One design system in use.** All colours from the token file. All spacing on the 4/8px grid. No rogue hex codes inline.
- [ ] **One typographic hierarchy.** H1, H2, H3, body, caption - defined once, applied everywhere.
- [ ] **Alternating section backgrounds** on marketing and discovery pages (Ticketmaster/DICE rhythm pattern - see `docs/design/BUTTON-AND-RHYTHM-SYSTEM.md`).
- [ ] **Consistent card treatment** across homepage, events listing, and detail page. Same corner radius, same shadow, same aspect ratio.
- [ ] **Navigation identical on every page.** Logo left, nav centre/right, auth right. No page-specific nav variations unless deliberate (e.g. checkout).
- [ ] **Footer identical on every page.** Complete, with legal links, social links, and `hello@eventlinqs.com`.
- [ ] **Loading states on everything async.** Skeletons, spinners, or progress - never a blank screen.
- [ ] **Empty states designed** - no "0 events found" with nothing else. Tell the user what to do next.

---

## Section 3 - Content Quality

- [ ] **All imagery is top-tier.** Minimum 1920×1080 for heroes, 2160×1080 for event covers. No stretched, pixelated, or obviously stock-looking photos on primary pages.
- [ ] **All copy is professional.** No typos. No casual apologies. No "we're working on it" in production copy.
- [ ] **All dates display in user's locale** (dd MMM yyyy for AU/UK, MMM dd yyyy for US). No raw ISO timestamps on user-facing pages.
- [ ] **All currency displays with correct symbol and precision** (AUD 25.00, not AUD 25 or $25). No rounding bugs (see Known Bugs log).
- [ ] **All timezone handling correct.** Event times display in the event's local timezone with a clear label (e.g. "7:00 PM AEST").

---

## Section 4 - Functional Integrity

- [ ] **Every user flow completes end-to-end without manual intervention:**
  - [ ] Sign up → email verification → land on dashboard
  - [ ] Sign in → land on dashboard
  - [ ] Create organisation → create event → publish → appears on `/events`
  - [ ] Browse `/events` → filter → click card → land on event detail
  - [ ] Select ticket → checkout → Stripe payment → confirmation email → QR ticket
  - [ ] Organiser sees sale in dashboard → revenue reflects correctly → payout data accurate
- [ ] **Stripe webhook returns 200 (not 307).** Logged in Stripe CLI and in server logs.
- [ ] **Supabase RLS policies verified** - logged-out users cannot read private data, users cannot edit other users' data.
- [ ] **Rate limiting in place** on auth endpoints and checkout.
- [ ] **Redis inventory cache coherent with database** after any sale (spot check: buy 2, DB shows -2, cache shows -2).

---

## Section 5 - Performance

- [ ] **Lighthouse Performance ≥ 85 on mobile** for homepage, events listing, event detail.
- [ ] **Largest Contentful Paint < 2.5s** on 4G simulation.
- [ ] **Hero video lazy-loads on mobile** (not blocking FCP on 3G).
- [ ] **Images served via CDN with `next/image` or equivalent.** No 5MB JPEGs in the wild.
- [ ] **No layout shift** (CLS < 0.1) during page load.

---

## Section 6 - Trust & Safety Signals

- [ ] **Privacy Policy page live** (`/legal/privacy`).
- [ ] **Terms of Service page live** (`/legal/terms`).
- [ ] **Refund Policy page live** (`/legal/refunds`).
- [ ] **Contact page live** with `hello@eventlinqs.com` and a real response expectation ("We reply within 24 hours, Mon-Fri").
- [ ] **About page live** with honest founder framing.
- [ ] **All legal pages linked from footer.**
- [ ] **Stripe test-mode banner visible** on any page where payments occur, until we switch to live mode.

---

## Section 7 - Known Bugs Log (must be empty before friends test)

Keep this list brutally honest. Move items to "FIXED" only after verified in production.

### Open
- [ ] Stripe webhook returning 307 instead of 200
- [ ] Revenue card rounding bug (AUD 4 displayed vs AUD 3.76 actual)
- [ ] Supabase auth-token lock `unhandledRejection` warnings in terminal
- [ ] Upstash Redis in N. Virginia - migrate to Sydney region before launch
- [ ] Verify M3 (Checkout & Payments) fixes survived M4 refactors

### Fixed (keep history - do not delete)
_Nothing yet._

---

## Section 8 - Session Close Protocol

At the end of every build session, before committing:

1. Run `npm run build` locally. Must succeed with zero errors.
2. Run `npm run lint`. Zero errors, warnings triaged.
3. Spot-check three random pages at three random widths.
4. Test one full purchase flow in Stripe test mode.
5. Check Vercel deployment log for errors.
6. Update this checklist - tick what's now passing, add any newly discovered items.
7. Commit message must reference the session goal.

---

## Section 9 - "Send to Friends" Gate

Before inviting anyone outside the build team:

- [ ] Every item in Sections 1-6 passes.
- [ ] Section 7 "Open" list is empty.
- [ ] Homepage, `/events`, one event detail page, signup, signin, and checkout have been tested by Lawal on a phone he didn't build on.
- [ ] A throwaway test account has completed a full purchase on production.
- [ ] `hello@eventlinqs.com` is monitored - feedback from friends will land there.
- [ ] A written list of "known limitations we're aware of" is prepared so friends aren't reporting things we already know.

---

**This document is the source of truth. If something matters for production and isn't here, add it. If something is here and doesn't matter, remove it with a commit message explaining why.**
