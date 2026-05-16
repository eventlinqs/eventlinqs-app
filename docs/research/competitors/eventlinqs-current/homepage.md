# EventLinqs - Homepage (live, current state)

Source: https://www.eventlinqs.com
Scraped: 16 May 2026 (firecrawl, location AU, onlyMainContent, waitFor 3000)
Status: 200 OK
Screenshot: screenshots/homepage.png

---

## Top nav
EVENTLINQS. (text wordmark, no logo) | [Get Started] [Sign in]

## Section order (top to bottom)

1. **Featured cultural events** - 5-slide hero carousel (Africultures Festival Sydney 2027, Pasifika Festival Melbourne 2027, Diwali Mela Brisbane 2026, Lebanese Eid Festival Sydney 2027, Caribbean Carnival Melbourne 2027). Each: category eyebrow, title, venue|city|date, [Get tickets].
2. **Quick filter chips**: Tonight, This Weekend, Free, Music, Food, Comedy, Wellness, Family, Cultural Communities ›
3. **"We'll pick three events for you"** - "Surprise me" personalisation prompt.
4. **Trending now** - 5-card rail (Amapiano Adelaide $45, Island Vibes Sydney $35, Gospel on the River Brisbane Free, Lagos Comedy Sydney $45, Lagos Comedy Melbourne $45). [Browse all events ›]
5. **What's happening near you** (this week) - 3-card rail.
6. **Cultural moments ahead** - calendar block: Flores de Mayo, Africa Day, Eid al-Adha, Reconciliation Week. "Plan around the celebrations that matter."
7. **Community events across Australia** - large grid: "Real events, real organisers, real communities. This is what's happening right now."
8. **Fresh on the platform** (just added) rail.
9. **Hand-picked for the week** (editor's picks) rail.
10. **Browse by city** - Melbourne (10), Sydney (9), Brisbane (6), Adelaide (2).
11. **Community events** rail.
12. **Where the city goes** (featured venues) - Enmore Theatre, Brisbane Powerhouse, The Gov, The Metro Theatre, Riverstage, The Comedy Theatre, Centennial Park Pavilion, The Tivoli, Margaret Court Arena, Roma Street Parkland.
13. **For event organisers** - "Sell tickets. Keep more." block:
    - "Transparent fees, real-time analytics, squad booking, and a checkout your fans will actually complete. Built for organisers who take their events seriously."
    - Bullets: Open to every community and every kind of event; All-in pricing: no surprise fees at checkout; Real-time sales dashboard and scan app; Squad booking: your fans buy together; Mobile-first checkout: WhatsApp sharing built in
    - CTAs: [Start selling tickets] -> /organisers/signup, [View pricing] -> /pricing
    - Stat strip: **0%** Platform fees on free events | **2-tap** Checkout: fastest in market | **5+** Payment gateways supported | **24/7** Real-time ticket scanning
14. **Newsletter**: "Get the best events for your scene, every Friday." Hand-picked events across 14 communities and 20 cities. No spam, ever. + consent line + Privacy Policy link. "Are you an organiser? Start hosting events ›"

## Meta
- Title: "EventLinqs - Every culture. Every event. One platform."
- Description: "Discover live events from communities across Australia and beyond. Afrobeats, Bollywood, Caribbean, Latin, Comedy, Pride and more. No hidden fees, verified organisers, fair refund policy."
- og:locale en_AU

---

ANALYST NOTE: The homepage is a discovery/marketplace surface first, organiser-acquisition surface a distant second (one block at position 13 of 14). Strengths: genuinely culture-led (carousel leads with Africultures/Pasifika/Diwali, not generic concert stock), strong AU specificity (AU venues, AU cities, AU date format, en_AU), warm copy ("Real events, real organisers, real communities", "celebrations that matter"). The "0% platform fees on free events / 2-tap checkout / 5+ gateways / 24/7 scanning" stat strip is the seed of a strong pricing-trust narrative but it is buried at the bottom. CRITICAL BUG: og:image and twitter:image resolve to `http://localhost:3000/opengraph-image` - social shares will render a broken/dev image. og:url also leaks localhost on several pages. This is a launch blocker for any social distribution and directly undermines the "WhatsApp sharing built in" promise. Density is very high (14 sections, 5+ rails) - risk of homepage fatigue vs. a tighter competitor hero. No trust signals (no organiser count, no testimonials, no press, no security badges) anywhere on the homepage - the entire trust burden is carried by the event content itself, which is thinner than it looks (~27 events, heavy repetition of the same ~25 titles across every rail).
