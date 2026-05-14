# Plausible Conversion Events

EventLinqs ships cookieless analytics via Plausible. This document is the source of truth for every custom event tracked across the platform. Add new entries here whenever a new tracked event ships.

## Install

- Script: `https://plausible.io/js/script.tagged-events.js`
- Loaded by: `src/app/layout.tsx` via `<Script defer strategy="afterInteractive" data-domain={NEXT_PUBLIC_PLAUSIBLE_DOMAIN}>`
- Default domain: `eventlinqs.com` (override via `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`)
- Wrappers: `trackEvent(name, props?)` (client) and `trackEventServer(name, url, props?)` (server) at `src/lib/analytics/plausible.ts`
- Tagged-events class pattern on static links: `className="plausible-event-name=event_name plausible-event-prop=value"`

## Event matrix (Batch 9.2)

| Event name | Trigger | Props | Source |
|---|---|---|---|
| `hero_browse_click` | Click on the SplitStateHero "Browse events" CTA | none | `split-state-hero.tsx` (tagged) |
| `hero_organiser_click` | Click on the SplitStateHero "I am an organiser" CTA | none | `split-state-hero.tsx` (tagged) |
| `category_chip_click` | Click on a category chip in the H2 strip | `category` | `category-chip-strip.tsx` (tagged) |
| `nav_cultures_click` | Click on the Cultures nav item OR the Cultural Communities chip | none | `category-chip-strip.tsx`, primary nav |
| `nav_cities_click` | Click on the Cities nav item | none | primary nav |
| `nav_organisers_click` | Click on the For Organisers nav item | none | primary nav |
| `trending_card_click` | Click on a card in the H8 Trending bento | `event_slug` | `trending-events-bento.tsx` (tagged) |
| `cultural_moment_click` | Click on a card in the H10 Cultural Moments bento | `moment` | `cultural-moments-bento.tsx` (tagged) |
| `culture_card_click` | Click on a card in the /cultures index | `culture_slug` | `app/cultures/page.tsx` (queued for 9.2.1) |
| `city_card_click` | Click on a card in the /cities index | `city_slug` | `app/cities/page.tsx` (queued for 9.2.1) |
| `header_search_open` | Search overlay opens | none | header-search-trigger.tsx (queued for 9.2.1) |
| `search_overlay_opened` | Search overlay open lifecycle | none | `header-search-overlay.tsx:86` (existing) |
| `search_submitted` | Search form submitted | `tab`, `q_len` | `header-search-overlay.tsx:128` (existing) |
| `search_suggestion_clicked` | Search suggestion link activated | `tab`, `label` | `header-search-overlay.tsx:220` (existing) |
| `email_signup_submit_success` | Email signup form succeeded | none (server fires with `domain`) | `email-signup-panel.tsx` (client) + `email-subscribe.ts` (server) |
| `email_signup_submit_error` | Email signup form errored | `reason` | `email-signup-panel.tsx` |
| `email_panel_organiser_click` | "Are you an organiser?" link in the email panel | none | `email-signup-panel.tsx` (tagged) |
| `surprise_me_open` | Surprise Me button click | none | `surprise-me-button.tsx` (tagged) [SHIPPED 9.2.1] |
| `surprise_me_pick_click` | Surprise Me modal pick activation | `event_slug` | `surprise-me-modal.tsx` (tagged) [SHIPPED 9.2.1] |
| `account_avatar_click` | Avatar click on the SiteHeader | none | `site-header-account-dropdown.tsx` + `site-header-account-button.tsx` (tagged) [SHIPPED 9.2.1] |
| `account_sign_out` | Sign-out menu item activated in the avatar dropdown | none | `app/actions/auth.ts` (server-side, fires via trackEventServer) [SHIPPED 9.2.1] |
| `email_signup_submit_duplicate` | Submitting an already-subscribed email (silent success) | `domain` | `app/actions/email-subscribe.ts` (server-side) [SHIPPED 9.2.1] |
| `pageview` | Built-in Plausible pageview | path, referrer | Plausible default |

Items marked "queued for 9.2.1" are documented for completeness; the static link sites that already exist via tagged-events are tracked from this batch onward, while the JS-API instrumentation on legacy locked components ships in 9.2.1 alongside the avatar dropdown work.

## Goals (founder configures in Plausible dashboard)

After the script lands and the domain is verified, configure the following as goals:
- `hero_browse_click`
- `hero_organiser_click`
- `email_signup_submit_success`
- `trending_card_click`
- `cultural_moment_click`

These map to the four primary conversion paths: ticket-buyer browse, organiser acquisition, email subscriber, content engagement.

## Activation steps for founder

1. Create a Plausible account at https://plausible.io and add `eventlinqs.com` as a site (or set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to a Plausible-registered domain for staging).
2. Fund the subscription (~$9 USD per month for the Growth plan).
3. The script in `src/app/layout.tsx` is already wired and starts sending pageviews + tagged events the moment the domain is verified.
4. Configure goals in the Plausible dashboard for the events listed above.
5. Optional: enable Plausible's email weekly digest for the first 4 weeks of data to validate the instrumentation.
