# Ticketmaster AU - Consumer Experience (evidence for Sections K/L)

Sources:
- https://www.ticketmaster.com.au (consumer homepage)
- https://www.ticketmaster.com.au/guns-n-roses-tickets/artist/735218 (artist/event-listing page, mobile viewport 390x844)
Scraped: 16 May 2026 (firecrawl, location AU, waitFor 3500-4000)
Status: both 200
Screenshot: screenshots/ticketmaster-event-mobile.png (mobile, full page)

---

## Consumer homepage - observed (verbatim where quoted)

- SEO-stuffed title: "Tickets for Concerts, Sport, Arts, Theatre, Family, Events, more. Official Ticketmaster site"
- Banner present: "Your browser is not supported. For the best experience, use any of these supported browsers..." (renders even to a modern scrape client)
- Two explicit "Advertisement" slots on the homepage body
- OneTrust cookie-consent wall with a full multi-category preference centre (high friction)
- reCAPTCHA verification element on the page
- Highlights/Popular/Discover/Featured rails are 100% mega-brand: Toyota AFL Premiership, MJ the Musical, Guns N' Roses, Melbourne Cup Carnival, Rugby World Cup 2027, The Lion King. Zero community, cultural, or grassroots events.
- "Popular Cities" rail: Brisbane, Melbourne, Perth, Sydney, Adelaide, Hobart (capital-only).
- NO price shown anywhere on discovery surfaces.
- Upsells surfaced on homepage: Gift Cards, app install ("Add Your Favourites"), Group Bookings.

## Artist / event-listing page (Guns N' Roses) - observed

- Same "browser is not supported" banner.
- An "Advertisement" slot on the artist page body.
- Long marketing bio padding ("Guns N' Roses endure as the most dynamic, dangerous, and definitive American rock band in history to this day...", multi-paragraph, plus album-sales certifications).
- Tour-date list is paginated ("Showing slide ... of 4", "Next items") and internationally scattered (e.g. Gliwice, Poland linking out to ticketmaster.pl) with AU dates not prominently surfaced.
- Almost every tour date is labelled "Guns N' Roses - World Tour 2026 | VIP Packages" - aggressive VIP-package framing as the default presentation.
- Each date exposes only a "Find tickets" action. NO ticket price, NO service fee, NO all-in total is shown at this layer. Price and fees are only encountered after clicking through into the dated event and progressing toward checkout.

NOTE on accuracy: the words "platinum" and "dynamic" appear on this page but in the artist bio (album certifications; "most dynamic ... rock band"), NOT as Ticketmaster Platinum / dynamic-pricing product labels. This capture does not evidence a dynamic-pricing screen. The defensible, captured fact is: Ticketmaster discloses no price or fee at the discovery/artist layer; cost is revealed only deeper in the funnel.

---

ANALYST NOTE: The captured consumer surfaces corroborate Ticketmaster's well-documented model without needing to overclaim. What we can assert from evidence in hand: (1) price and fees are absent from every discovery and artist surface we scraped - the buyer cannot know the true cost until deep in the funnel; (2) the experience is ad-laden, consent-walled, browser-gated and bio-padded - high friction, low scannability; (3) it is culturally generic and capital-city, mega-brand only - structurally incapable of representing AU multicultural community events; (4) DICE, the modern challenger, explicitly counter-positions on exactly this ("See the full price upfront, with no surprises at checkout" - see dice-consumer.md), which validates "all-in, shown before payment" as the axis on which Ticketmaster is beaten. EventLinqs already states all-in intent; the rebuild must make it visible and provable at the price moment, which is precisely where Ticketmaster hides it.
