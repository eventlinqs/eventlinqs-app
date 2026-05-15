# Batch 11.1 D3.4 - Nav + header + footer + mobile bottom nav audit

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.4)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`
Screenshots: `docs/redesign/batch-11.1-evidence/screenshots/nav-*.png`

## Coverage

Every link in the rendered DOM of:

- Site header (desktop 1440)
- Site footer (desktop 1440)
- Mobile bottom navigation (390)
- Mobile hamburger sheet links (390)

HTTP-tested against the local production build at
`http://localhost:3007`.

## Result

**All nav links PASS.** 7 header links, ~50 footer links (3 footer
columns × multiple link groups, double-counted because the footer
renders some links in two columns), 9 mobile bottom nav links - every
one returns 200/307 as expected.

### Sample (full list in JSON)

```
PASS [3.4-header] EVENTLINQS. -> /
PASS [3.4-header] Browse Events -> /events
PASS [3.4-header] Cultures -> /cultures
PASS [3.4-header] Cities -> /cities
PASS [3.4-header] For Organisers -> /organisers
PASS [3.4-header] Sign in -> /login
PASS [3.4-header] Get Started -> /signup
PASS [3.4-footer] Browse all events -> /events
PASS [3.4-footer] Afrobeats -> /culture/african
PASS [3.4-footer] Caribbean -> /culture/caribbean
PASS [3.4-footer] Bollywood -> /culture/south-asian
PASS [3.4-footer] Latin -> /culture/latin
PASS [3.4-footer] Italian -> /culture/mediterranean
PASS [3.4-footer] Filipino -> /culture/filipino
PASS [3.4-footer] Sell tickets -> /organisers/signup (307)
PASS [3.4-footer] Pricing -> /pricing
PASS [3.4-footer] Help centre -> /help/selling-tickets
PASS [3.4-footer] About -> /about
PASS [3.4-footer] Careers -> /careers
PASS [3.4-footer] Press -> /press
PASS [3.4-footer] Contact -> /contact
PASS [3.4-footer] Terms -> /legal/terms
PASS [3.4-footer] Privacy -> /legal/privacy
PASS [3.4-footer] Refund policy -> /legal/refunds
PASS [3.4-footer] Cookie policy -> /legal/cookies
PASS [3.4-footer] Accessibility -> /legal/accessibility
PASS [3.4-mobile-bottom-nav] Home -> /
PASS [3.4-mobile-bottom-nav] Browse -> /events
PASS [3.4-mobile-bottom-nav] Search -> /events?focus=1
PASS [3.4-mobile-bottom-nav] Saved -> /account/saved (307)
PASS [3.4-mobile-bottom-nav] Account -> /account (307)
```

End.
