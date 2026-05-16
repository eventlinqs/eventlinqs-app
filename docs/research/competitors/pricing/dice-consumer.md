# DICE - Consumer Experience (evidence for Sections K/L)

Sources:
- https://dice.fm (consumer homepage)
- https://dice.fm/event/yobk2x-dance-go-home-x-afro-plus-the-memorial-day-rave-23rd-may-berhta-washington-tickets (event detail, mobile viewport 390x844)
Scraped: 16 May 2026 (firecrawl, location AU, waitFor 3500-4000)
Status: both 200
Screenshot: screenshots/dice-event-mobile.png (mobile, full page)

---

## Consumer homepage - observed (verbatim where quoted)

- Hero: "Welcome to the alternative" + "Incredible live shows. Upfront pricing. Relevant recommendations. DICE makes going out easy."
- Primary CTA is "Get the app" (app-first; web is a funnel to the app).
- Three-pillar value strip, quoted:
  1. "Get tickets in less time than it took to read this" (speed)
  2. "See the full price upfront, with no surprises at checkout" (anti-hidden-fee, the direct shot at Ticketmaster)
  3. "Personalised recommendations on your unique Home feed" (relevance)
- Event card grid: square face-cropped images, title, date, venue, and PRICE on every card ("$35.85", "From $65.73", "Free", "From Free").
- Social proof: "Loved by millions" with a paraphrased user-quote wall ("ticket purchasing revolution, the best gig ticket app, refreshing, reassuring, stress-free, 10/10...").
- WEAKNESS (exploitable): even with location set to AU, the site defaulted to "Trending in Washington D.C.", USD pricing, US venues. DICE web is geo-US/app-centric; its AU web experience is effectively a US-defaulted app advert.

## Event detail page (mobile) - observed (verbatim where quoted)

- Top trust banner: "DICE protects fans and artists from touts. Tickets will be securely stored in the app." (anti-tout, repeated again lower on the page)
- Price line, quoted: "From $21.53  The price you'll pay. No surprises later."  <- the all-in promise placed immediately adjacent to the number, in plain language. This is the single best microcopy pattern in the entire competitive set.
- Clean vertical structure: image -> anti-tout banner -> "Got a code?" -> title -> venue (linked) -> date/time -> price + reassurance -> "Buy now" -> About (with "Read more" truncation) -> age policy -> "Presented by" -> refund policy (plain: refund if rescheduled/cancelled; none within 24h) -> Venue (address, Open in maps, Follow) -> Doors open -> FAQs accordion (parking/transport, lockers, safe-space policy, amenities, table service) -> Download app -> checkout breadcrumb (Back / Ticket / Payment / Get the app).
- USD, US venue, "21+" US framing - again, no AU localisation.
- og:image is a generic static DICE social card, not the event image (weak share preview, comparable to EventLinqs's own OG bug but by choice not defect).

---

ANALYST NOTE: DICE is the UX bar to beat in the modern challenger space, and the captures show exactly where the bar sits and where it cracks. The bar: ruthless vertical clarity on mobile, price-with-reassurance microcopy at the decision point ("The price you'll pay. No surprises later."), anti-tout trust at the top, a genuinely useful FAQ accordion, and confident brevity. The cracks EventLinqs exploits: (1) DICE web is an app-download funnel - the real product is gated behind an install; a fan who will not install an app is a second-class citizen. EventLinqs is web-first and WhatsApp-native, which suits AU community organisers better. (2) Zero localisation - US geo, USD, US framing even on an AU request; DICE has no real AU-community presence. (3) Narrow vertical - DICE is club/gig culture; it does not serve gospel nights, Owambe, Diwali galas, Filipino fiestas, weddings or faith events. EventLinqs's surpass move is: take DICE's price-reassurance and vertical-clarity patterns, deliver them web-first without an app wall, and apply them across a cultural breadth DICE structurally ignores - in AUD, with AU venues and AU community organisers.
