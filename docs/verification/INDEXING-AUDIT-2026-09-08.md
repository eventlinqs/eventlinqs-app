# INDEXING AND CANONICAL AUDIT, 8 September 2026

Close-out C19.1. Driven against https://www.eventlinqs.com.au, not read off the
code: every drivable page route enumerated from `src/app` was fetched and the
tags were taken from the response. 88 of the 130 page routes have a value an
anonymous visitor can reach; the other 42 are bearer tokens, reservations,
one-time codes and authenticated ids, and their declarations are held by
`scripts/guards/indexing-policy.mjs` instead.

Evidence, all under `C:\dev\EVIDENCE\C19`: `audit-production.json` (the driven
run), `sitemap-prod.xml` (550 URLs), `sweep-before.json` (all 550 driven: 550
of 550 answered 200), `uniqueness.json` (31 pages sampled for copy).

## What it found

**D1. The root layout leaked its canonical onto 57 routes.** `src/app/layout.tsx`
declared `alternates: { canonical: '/' }`. Next merges metadata field by field,
so every page that did not declare its own inherited it and published the
HOMEPAGE as the canonical version of itself. Seven of the 57 were indexable AND
in the sitemap: every `/help/[slug]` topic. Google Search Console's first two
exclusion reasons, "alternate page with proper canonical tag" and "duplicate,
Google chose different canonical than user", are the name of that defect.

**D2. 545 of the 550 sitemap URLs were empty templated pages.** Production
publishes two events. 441 community and community-by-city URLs, 44 city and
suburb URLs and 22 browse-city URLs held nothing and differed from one another
by a noun. That is what Google collapses, and a canonical is a hint it is free
to overrule.

**D3. Boilerplate with a swapped noun, on two families.** `/events/browse/[city]`
carried one sentence with the city name changed, on all 21. The 420
`/community/[community]/[city]` pages carried "{Community} events on tonight in
{City}" plus one shared sentence, while 271 hand-written city-specific
paragraphs sat unused in `src/lib/communities/intersection-editorial.ts`.
Verified NOT boilerplate: `/community/[community]`, `/city/[slug]` and
`/city/[slug]/[suburb]` all carry genuinely distinct titles, descriptions and
headings.

**D4. No site-wide Organization or WebSite.** Both existed, on the homepage
only. `/events`, `/help` and `/help/[slug]` emitted no ItemList.

**D5. Nothing asserted that a private route was noindex.**
`scripts/ci/assert-seo-audits.mjs` derived its exempt set from `src/app/(auth)/`
alone and only ever SKIPPED those four. No check anywhere failed if `/dashboard`,
`/admin` or the door scanner became indexable, and five routes were found
declaring no robots directive at all: `/scan/[eventId]`, `/dev/shell-preview`,
`/events/[slug]/holder`, and (as redirect stubs, correctly) `/account/tickets`
and `/organisers/signup`.

## What changed

`src/lib/seo/indexing-policy.ts` is now the one place that says what may be
indexed, classifying every page route ALWAYS, CONDITIONAL, ALIAS or NEVER. The
root layout declares no canonical; every indexable page declares its own; a
templated discovery page is noindex until it holds
`DISCOVERY_INDEXING_THRESHOLD` publicly visible events and enters and leaves the
sitemap with its own state; Organization and WebSite are site wide.

`scripts/guards/indexing-policy.mjs` (registered, blocking) holds the source to
the policy. `scripts/verify/indexing-drive.mjs` holds the RUNNING pages to it and
is the check that can see what a parser cannot: run against production before the
change it FAILED, naming `/help/getting-started` and six auth pages.

## The table, as production stood before the change

| path | status | robots (before) | canonical (before) | in sitemap | JSON-LD (before) |
|---|---|---|---|---|---|
| / | 200 | index, follow | / | yes | WebSite, Organization |
| /about | 200 | index, follow | /about | yes | none |
| /account | 200 -> /login?next=/account | noindex, nofollow | / | no | none |
| /account/notifications | 200 -> /login?next=/account/notifications | noindex, nofollow | / | no | none |
| /account/saved | 200 -> /login?next=/account/saved | noindex, nofollow | / | no | none |
| /account/tickets | 200 -> /tickets | noindex, nofollow | / | no | none |
| /admin | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/analytics | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/audit | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/disputes | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/enrol-2fa | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/events | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/flags | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/health | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/kyc | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/login | 200 | noindex, nofollow | / | no | none |
| /admin/marketplace | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/network | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/notifications | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/orders | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/orders/unfulfilled | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/organisers | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/payouts | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/pricing | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/refunds | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/search | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/staff | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/users | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /admin/venues | 200 -> /admin/login | noindex, nofollow | / | no | none |
| /artist/dashboard | 404 | noindex | / | no | none |
| /artists | 404 | noindex | / | no | none |
| /auth/reset-password | 200 | noindex, nofollow | / | no | none |
| /careers | 200 | index, follow | /careers | yes | none |
| /categories/networking | 200 | index, follow | /categories/networking | yes | CollectionPage, BreadcrumbList |
| /cities | 200 | index, follow | /cities | yes | ItemList, BreadcrumbList |
| /city/sydney | 200 | index, follow | /city/sydney | yes | City, ItemList, BreadcrumbList |
| /city/sydney/inner-west | 200 | index, follow | /city/sydney/inner-west | yes | Place, BreadcrumbList |
| /communities | 200 | index, follow | /communities | yes | ItemList, BreadcrumbList |
| /community/aboriginal-torres-strait-islander | 200 | index, follow | /community/aboriginal-torres-strait-islander | yes | CollectionPage, BreadcrumbList |
| /community/aboriginal-torres-strait-islander/sydney | 200 | index, follow | /community/aboriginal-torres-strait-islander/sydney | yes | CollectionPage, BreadcrumbList |
| /contact | 200 | index, follow | /contact | yes | none |
| /dashboard | 200 -> /login?redirect=%2Fdashboard | noindex, nofollow | / | no | none |
| /dashboard/events | 200 -> /login?redirect=%2Fdashboard%2Fevents | noindex, nofollow | / | no | none |
| /dashboard/events/create | 200 -> /login?redirect=%2Fdashboard%2Fevents%2Fcreate | noindex, nofollow | / | no | none |
| /dashboard/gigs | 200 -> /login?redirect=%2Fdashboard%2Fgigs | noindex, nofollow | / | no | none |
| /dashboard/insights | 200 -> /login?redirect=%2Fdashboard%2Finsights | noindex, nofollow | / | no | none |
| /dashboard/invites | 200 -> /login?redirect=%2Fdashboard%2Finvites | noindex, nofollow | / | no | none |
| /dashboard/my-squads | 200 -> /login?redirect=%2Fdashboard%2Fmy-squads | noindex, nofollow | / | no | none |
| /dashboard/my-waitlists | 200 -> /login?redirect=%2Fdashboard%2Fmy-waitlists | noindex, nofollow | / | no | none |
| /dashboard/organisation | 200 -> /login?redirect=%2Fdashboard%2Forganisation | noindex, nofollow | / | no | none |
| /dashboard/organisation/create | 200 -> /login?redirect=%2Fdashboard%2Forganisation%2Fcreate | noindex, nofollow | / | no | none |
| /dashboard/payouts | 200 -> /login?redirect=%2Fdashboard%2Fpayouts | noindex, nofollow | / | no | none |
| /dashboard/reports/gst | 200 -> /login?redirect=%2Fdashboard%2Freports%2Fgst | noindex, nofollow | / | no | none |
| /dashboard/tickets | 200 -> /login?redirect=%2Fdashboard%2Ftickets | noindex, nofollow | / | no | none |
| /dashboard/venues | 200 -> /login?redirect=%2Fdashboard%2Fvenues | noindex, nofollow | / | no | none |
| /design/cards | 404 | noindex | / | no | none |
| /dev/logo-preview | 404 | none | none | no | none |
| /dev/shell-preview | 404 | none | none | no | none |
| /events | 200 | index, follow | /events | yes | BreadcrumbList |
| /events/browse/adelaide | 200 | index, follow | /events/browse/adelaide | yes | CollectionPage, BreadcrumbList |
| /events/open-field-party-v8yqlp | 200 | index, follow | /events/open-field-party-v8yqlp | yes | Festival, BreadcrumbList |
| /faith/christian | 200 | index, follow | /faith/christian | yes | CollectionPage |
| /feed | 200 -> /login?redirect=/feed | noindex, nofollow | / | no | none |
| /for-organisers | 200 -> /organisers | index, follow | /organisers | no | none |
| /forgot-password | 200 | noindex, nofollow | / | no | none |
| /gigs | 404 | noindex | / | no | none |
| /guides | 200 | index, follow | /guides | yes | ItemList |
| /guides/creating-your-first-event | 200 | index, follow | /guides/creating-your-first-event | yes | Article |
| /help | 200 | index, follow | /help | yes | none |
| /help/getting-started | 200 | index, follow | / | yes | none |
| /launch | 200 | index, follow | /launch | no | none |
| /legal/accessibility | 200 | index, follow | /legal/accessibility | yes | none |
| /legal/cookies | 200 | index, follow | /legal/cookies | yes | none |
| /legal/organiser-terms | 200 | index, follow | /legal/organiser-terms | yes | none |
| /legal/privacy | 200 | index, follow | /legal/privacy | yes | none |
| /legal/refunds | 200 | index, follow | /legal/refunds | yes | none |
| /legal/terms | 200 | index, follow | /legal/terms | yes | none |
| /login | 200 | noindex, nofollow | / | no | none |
| /organisers | 200 | index, follow | /organisers | yes | none |
| /organisers/mklstudios | 200 | index, follow | /organisers/mklstudios | yes | Organization |
| /organisers/signup | 200 -> /signup?role=organiser | noindex, nofollow | / | no | none |
| /press | 200 | index, follow | /press | yes | none |
| /pricing | 200 | index, follow | /pricing | yes | none |
| /signup | 200 | noindex, nofollow | / | no | none |
| /tickets | 200 -> /login?redirect=/tickets | noindex, nofollow | / | no | none |
| /venues/geelong-showgrounds | 200 | index, follow | /venues/geelong-showgrounds | yes | Place |
| /verify-email-sent | 200 | noindex, nofollow | / | no | none |
| /waitlist | 200 | index, follow | /waitlist | no | none |
