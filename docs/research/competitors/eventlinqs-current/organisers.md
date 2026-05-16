# EventLinqs - /organisers Landing (live, current state)

Source: https://www.eventlinqs.com/organisers
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/organisers.png
Note: /for-organisers returns 404 (only /organisers exists; homepage footer links to /organisers, hero CTA links to /organisers/signup).

---

## Structure

- Eyebrow "For Event Organisers"
- H1: **Sell tickets. Keep more.**
- Sub: "Transparent fees, real-time analytics, squad booking, and a checkout your fans will actually complete. Built for organisers who take their events seriously."
- CTAs: [Start selling tickets] -> /organisers/signup | [View pricing] -> /pricing
- **3 value props**:
  - **All-in pricing**: "What the buyer sees at checkout is what they pay. No surprise fees at the final step. Fee caps protect buyer trust across every event on the platform."
  - **Real-time tools**: "Sales dashboard, guest list, check-in scan app, and payment integration."
  - **Self-serve from day one**: "Sign up in minutes. Build your event. Submit for review. Go live. Most events approved the same business day. No gatekeeping on organisers."
- **How it works - 4 steps**: 1) Create organiser account (~1 min) 2) Build your event (5-15 min) 3) Submit for review (most approved same business day) 4) Go live and sell tickets (payouts within 5 business days of event ending)
- **Open to every community**: "Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae and beyond." + use-case bullets (Afrobeats/Amapiano nights, Gospel/faith, Owambe, Caribbean fetes, business summits, weddings/birthdays, corporate/conferences, "Any event that brings a community together")
- **Organiser FAQ** (6, full answers):
  - What does it cost? "No upfront cost. Free events incur zero platform fees, permanently. For paid events, fees are a percentage of ticket revenue. The booking fee is split between EventLinqs and the organiser. We cap the total booking fee to protect buyer trust."
  - When do I receive payout? Within 5 business days of event ending, +1-3 bank days, via Stripe Connect, identity verification required.
  - Can I set my own refund policy? Yes; overriding guarantee: cancelled/materially rescheduled = full refund regardless.
  - Early bird + multiple tiers? Yes.
  - Discount codes? Yes.
  - Door sales on the night? Yes.
  - [See all organiser help articles ›] -> /help/selling-tickets
- **Closing**: "Ready to sell tickets? Sign up in minutes. No upfront fees. No approval gate on organisers." [Start selling tickets]

## Meta
- Title: "For Organisers | EventLinqs"
- og:image -> http://localhost:3000/opengraph-image (BUG)

---

ANALYST NOTE: This is a solid organiser landing page and is arguably ahead of Ticketmaster/DICE on transparency (both of those hide pricing entirely; EventLinqs states "free events free permanently" and explains the split). Strengths: the 4-step "sign-up to sold out" flow with realistic time estimates is excellent and beats every competitor's hand-wave; the FAQ answers are full and honest (refund override guarantee, Stripe Connect, identity verification) which builds real trust; "No gatekeeping / no approval gate on organisers" is a sharp differentiator against the enterprise sales-gate model. Weaknesses vs. world-class: (1) zero quantified trust - no organiser count, no payout volume, no testimonials, no logos, no case study; the page asserts trust but never evidences it. (2) The fee story is verbal not visual - "fees are a percentage", "split between EventLinqs and the organiser", "we cap the total" - no number, no worked example, no comparison table. The actual rate ("from 2.9% + AUD 0.59") only appears on /pricing, so this page under-sells the single most persuasive fact. (3) No screenshots of the dashboard/scan app despite "real-time tools" being a core claim - tell-don't-show. (4) localhost OG bug. This page is the conversion engine and is currently competent-but-unproven.
