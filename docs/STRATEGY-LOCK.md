# EVENTLINQS STRATEGY LOCK - Pre-Launch

**Date:** 2026-05-09
**Locked by:** Lawal Adams (Founder/CEO)
**Status:** Authoritative reference for all pre-launch decisions
**Context:** Strategic alignment after analysis of competitor benchmarks (Ticketmaster, Eventbrite, DICE, Humanitix) and external AI advice. This document captures what we ARE building, what we are NOT building, and the implementation sequence before merge to main and friends-launch.

---

## 1. CORE POSITIONING (PERMANENTLY LOCKED)

**EventLinqs is a community-first operating system that happens to sell tickets.**

- "Where the culture gathers" - tagline locked
- Cultural communities first, mainstream events second
- Ticketing is the entry point, not the product
- Community building is the product

We do NOT compete with Ticketmaster on:
- Stadium tours
- Major artist exclusive deals
- Ticket fee race-to-the-bottom

We DO compete with Ticketmaster on:
- Cultural community ownership of their data and audience
- Mid-size festival market (1,000 to 10,000 capacity)
- Cultural sensitivity and language localisation
- Community hub functionality (organisers as media properties, not just merchants)

---

## 2. PRICING (PERMANENTLY LOCKED FOR LAUNCH)

**Free Tier only at launch.** Single transparent pricing model for all organisers.

- **Per-ticket fee:** 2% + 50c AUD (or equivalent local currency)
- **Monthly cost:** $0
- **Buyer pays:** transparent fee shown at checkout, no hidden charges
- **Organiser pays:** nothing monthly, nothing for setup, nothing for tools

**No Pro tier at launch.** Pro tier scoping happens after we have 50+ organisers giving real feedback on what they would pay for. We do not assume what features deserve a Pro tier.

**No price negotiation.** Same fee for all organisers. No "cheap deal to get them in" because that contradicts our quality positioning.

---

## 3. ONBOARDING MODEL (CORRECTED FROM EARLIER DISCUSSION)

**Platform completes 100% before any organiser is approached.** No partial product onboarding. No "we are still building this part."

**First 10 organisers** receive personal concierge from founder:
- Walk-through of complete finished platform
- Help setting up first event
- Direct support during their first sale
- Case study collection in writing

**Organiser 11 onward** is self-serve:
- Standard signup flow
- Self-service event creation
- Knowledge base + email support

This protects founder time and forces the platform to actually be self-serve quality.

---

## 4. LAUNCH GEOGRAPHY (HYPER-TARGETED)

**Friends-launch:** 5 cultural communities × 3 cities = 15 combinations

Cultures (Tier 1 priority, all already in the 14-culture taxonomy):
1. African
2. South Asian  
3. Caribbean
4. Latin
5. Pacific

Cities (Tier 1 priority):
1. Sydney
2. Melbourne
3. Brisbane

This gives us 15 culture-city combinations to win narrow before going wide. Once these 15 are humming, we expand to all 14 cultures × all 20 cities + 24 suburbs.

**Public launch** opens registration to all 14 cultures × 44 cities, but our focused growth efforts stay on the 15 priority combinations until they reach 100+ events each.

---

## 5. DAY-ONE FEATURES (MUST SHIP BEFORE MERGE TO MAIN)

These are non-negotiable launch blockers. The platform is incomplete without them.

### 5.1 Community Hubs (in scope, verify completion)

- ✅ Organiser profile pages with bio, mission, follower count, upcoming events
- ✅ Follow primitive: users follow organisers, get notifications of new events
- ✅ Email follower notifications when organiser publishes a new event
- ✅ Saved events and saved organisers (M5 Phase 1, already shipped)
- ⏳ Organiser dashboard surface for managing their followers list

### 5.2 Data Sovereignty (must surface as a feature)

- ⏳ One-click CSV export of attendee data per event (free tier, no gating)
- ⏳ One-click CSV export of all-time follower list per organiser
- ⏳ "You own your audience" messaging on organiser onboarding flow
- ⏳ Privacy policy explicitly states organiser owns the data they collect

### 5.3 Cultural Calendar Awareness (NET-NEW)

This is part of the 40% the AI advice missed. This is what makes us uncopyable.

- ⏳ Database table `cultural_dates` with major cultural and religious dates (Ramadan, Eid al-Fitr, Eid al-Adha, Diwali, Lunar New Year, Holi, Reconciliation Week, Pride, etc.)
- ⏳ Calendar UI on event creation showing "this date conflicts with X" warnings
- ⏳ Public-facing "Cultural Moments" calendar showing what is coming up
- ⏳ Already partially shipped in 9.2 homepage Cultural Moments bento, expand to dedicated `/calendar` page

### 5.4 Multi-Language Event Listings (NET-NEW)

- ⏳ Event title and description support a native-language alternative field
- ⏳ Frontend toggle to switch between English and native language on event pages
- ⏳ Native language stored as `description_native` and `title_native` text columns on events table
- ⏳ Search indexing across both fields

### 5.5 Cultural Sensitivity Markers (NET-NEW)

Event detail pages must surface these as filterable, scannable badges:

- ⏳ Halal certified / Halal-friendly food
- ⏳ Family-friendly (under 12 welcome)
- ⏳ Wheelchair accessible
- ⏳ Hearing loop / sign language interpreter available
- ⏳ Quiet hour / sensory-friendly
- ⏳ Modesty-respectful (relevant for some cultural events)
- ⏳ Alcohol-free option
- ⏳ Prayer area available

Stored as boolean array on events table. Filterable on browse pages.

### 5.6 Cultural Organisation Partnership Badges (NET-NEW)

- ⏳ Database table `partner_organisations` with name, logo, verified status
- ⏳ Events can display "Endorsed by [Partner Org]" badge if their organiser is partnered
- ⏳ Partner organisation directory page at `/partners`
- ⏳ Founder personally onboards 5 cultural organisations as launch partners (Polish Cultural Foundation, Mahrajan committee, Pasifika council, etc.)

### 5.7 Marketing Copy + Pitch Pages (NET-NEW)

- ⏳ Homepage hero copy emphasises community-first, "where the culture gathers"
- ⏳ "Why EventLinqs" page targeting organisers with the data sovereignty + community ownership pitch
- ⏳ "For Organisers" page with case studies, fee transparency, feature list
- ⏳ "For Communities" page emphasising cultural pride and authentic representation
- ⏳ Press kit page with logos, founder bio, statistics

### 5.8 Operational Polish (HARD launch blockers from prior decisions)

- ⏳ Branded storage domain (Track 2 from earlier - in progress)
- ⏳ All ~50 event covers replaced with real images via imagery backfill
- ⏳ Constraint validation migration applied
- ⏳ Vercel preview Lighthouse Performance 95+ verified
- ⏳ axe-core sweep 0 violations
- ⏳ Logo from Fiverr Pro
- ⏳ Stripe Live KYC complete
- ⏳ All credentials rotated
- ⏳ ABN inserted in legal pages
- ⏳ Plausible analytics live with friends-launch tracking

---

## 6. DEFERRED FEATURES (POST-LAUNCH)

These are valuable but NOT launch blockers. Build after we have organiser feedback.

- Pro tier subscription model (no decision until 50+ organiser signal)
- White-label checkout
- Sponsor matching marketplace
- Full CRM (basic email follower notifications ship at launch; full CRM is post-launch)
- ROI dashboard
- Multi-currency processing (display only at launch, processing later)
- Mobile native apps (web-first; apps at launch+12 months)
- API for third-party integrations

---

## 7. LAUNCH MARKETING (PARALLEL TO BUILD)

These run in parallel with the build sprint.

### 7.1 Cultural Organisation Outreach (Founder action - 4 weeks of effort)

Approach 5 cultural organisations with a written partnership proposal:
- Polish Cultural Foundation Australia
- African Australian Foundation
- Mahrajan committee Sydney
- Pasifika Council Australia
- Latin American Cultural Association

Partnership ask:
- Their logo on our partner directory
- "Endorsed by [Org]" badge available to their member organisers
- Joint press release at launch
- They become our channel partner for organiser referrals

In return:
- Their member organisers get priority concierge onboarding
- Their organisation page is featured on EventLinqs
- Co-branded community events posted free

### 7.2 Press and Media Outreach (Founder action - 2 weeks before launch)

- SBS Multicultural News
- ABC Multicultural / ABC News
- Cultural community newspapers (Polish Times, Caribbean Times, etc.)
- Local council newsletters
- Founder LinkedIn personal post about why EventLinqs

### 7.3 Founder Personal Brand (Ongoing)

- LinkedIn presence as cultural community advocate
- Speaking at cultural events
- Personal endorsement of every launch organiser

---

## 8. IMPLEMENTATION SEQUENCE (BATCHES)

These batches run before merge to main. After all complete, we merge and friends-launch.

### Batch 11 - Community-First Feature Implementation (MUST)

**Estimated time:** 12 to 16 hours of CC work + verification

Scope:
- Cultural calendar awareness (DB table + event creation warnings + display)
- Multi-language event listings (DB columns + UI toggle + search)
- Cultural sensitivity markers (DB + event creation form + browse filters)
- Cultural organisation partnership badge system (DB + admin upload + display)
- Organiser CSV export of attendees + followers (verify exists, surface in dashboard)
- Data sovereignty messaging on organiser onboarding flow

### Batch 12 - Marketing Copy + Pitch Pages (MUST)

**Estimated time:** 6 to 8 hours of CC work + founder copy review

Scope:
- "Why EventLinqs" page
- "For Organisers" page with case studies template
- "For Communities" page
- Press kit page
- Homepage copy refresh emphasising community-first
- Email signup copy refresh
- Footer link audit and additions

### Batch 13 - Final Launch Prep (MUST)

**Estimated time:** 8 to 10 hours of mixed work

Scope:
- Friends-launch testing playbook (founder operational doc)
- Cultural organisation partnership outreach templates
- Press release templates (English + native language pairs)
- Founder onboarding playbook (internal doc for concierge calls)
- Final visual regression at all 3 viewports across all NEW pages
- Lighthouse 95+ verification on Vercel preview
- axe-core 0 violations sweep
- Pre-merge checklist

After Batch 13: merge redesign → main, friends-launch beta opens.

---

## 9. WHAT WE ARE NOT DOING (REJECTED ADVICE)

For the record, these items were considered and rejected:

- **Humanitix-style charity profit model:** EventLinqs is for-profit. Optional donation at checkout is acceptable, but we do not dilute commercial positioning.
- **Migration concierge for 50 organisers:** Founder time-bound. First 10 personally, self-serve from 11.
- **Lower fees for "distressed" organisers:** Same fee for all. No race to the bottom.
- **Sponsor matching marketplace at launch:** Year 2+ feature.
- **White-label checkout at launch:** M8+ feature.
- **Generic Pro tier subscription at launch:** No pricing decision without market signal.
- **Multi-currency processing at launch:** Display in user's currency, process in AUD only at launch.

---

## 10. SUCCESS METRICS (LAUNCH READINESS)

The platform is launch-ready when:

- [ ] All Day-One features in Section 5 are implemented and verified
- [ ] All operational polish in 5.8 complete
- [ ] 5 cultural organisation partnerships secured in writing
- [ ] First 10 launch organisers identified and ready to onboard
- [ ] Press kit and outreach templates complete
- [ ] Founder personal brand presence established (5+ LinkedIn posts)
- [ ] Friends-launch testing playbook executed and passed
- [ ] Pre-merge checklist all green
- [ ] Final Lighthouse 95+ verified on Vercel preview
- [ ] axe-core 0 violations verified

Friends-launch metric: 30+ events live across 15 culture-city combinations within 4 weeks of opening.

Public launch metric: 100+ events live, 50+ organisers onboarded, 1,000+ buyers on the platform within 8 weeks of friends-launch.

---

**This document is authoritative. Updates require founder decision in writing.**
