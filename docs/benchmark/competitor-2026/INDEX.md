# Competitor-2026 Capture Index

Live Playwright captures of Ticketmaster AU and Eventbrite AU, the two reference
competitors, at desktop (1440 viewport) and mobile (390 viewport). Fold captures
at deviceScaleFactor 2, clamped to <= 1800px on the longest side so they stay
reviewable. This INDEX is the evidence pointer the `competitor-benchmark` skill
references; it is the single source of truth for "what do the competitors look
like". Do not re-ask the founder - read the skill and these captures.

- Captured / audited: 2026-06-08. **Stale after 2026-09-06 (90 days)** - re-run
  the procedure in the `competitor-benchmark` skill if past that date or when
  designing a new page type not covered here.
- Measurements (hero heights, banner kinds, h1 positions): `measurements.json`.
- PNGs are gitignored (local evidence). This INDEX + measurements.json are the
  committed record; re-capture regenerates the PNGs.
- Audit method: every file opened and visually inspected (brand wordmark + page
  heading + real content must be visible; a full-screen cookie wall, blank page,
  or loading spinner = INVALID).

## Ticketmaster AU

| File | Dimensions | Page shown (URL) | Status |
|---|---|---|---|
| ticketmaster__home-1440.png | 1800x1125 | Homepage - https://www.ticketmaster.com.au/ | VERIFIED |
| ticketmaster__home-390.png | 780x1688 | Homepage (mobile; small bottom ad banner, content full above) | VERIFIED |
| ticketmaster__discover-1440.png | 1800x1125 | Discover/Music - https://www.ticketmaster.com.au/discover/concerts | VERIFIED |
| ticketmaster__discover-390.png | 780x1688 | Discover/Music (mobile; small bottom ad banner) | VERIFIED |
| ticketmaster__event-detail-1440.png | 1800x1125 | Event detail -> Moshtix (Winter Wine Festival 2026) | VERIFIED |
| ticketmaster__event-detail-390.png | 780x1688 | Event detail -> Moshtix (mobile) | VERIFIED |
| ticketmaster__help-1440.png | 1800x1125 | Help centre - https://help.ticketmaster.com.au/hc/en-au | VERIFIED |
| ticketmaster__help-390.png | 780x1688 | Help centre (mobile) | VERIFIED |
| ticketmaster__signin-1440.png | 1800x1125 | Sign in (reached by clicking "Sign In/Register" on home) -> auth.ticketmaster.com OAuth | VERIFIED |
| ticketmaster__signin-390.png | 780x1688 | Sign in (mobile; same OAuth form) | VERIFIED |

## Eventbrite AU

| File | Dimensions | Page shown (URL) | Status |
|---|---|---|---|
| eventbrite__home-1440.png | 1800x1125 | Homepage - https://www.eventbrite.com.au/ | VERIFIED |
| eventbrite__home-390.png | 780x1688 | Homepage (mobile) | VERIFIED |
| eventbrite__browse-1440.png | 1800x1125 | Sydney all-events browse - /d/australia--sydney/all-events/ | VERIFIED |
| eventbrite__browse-390.png | 780x1688 | Sydney all-events browse (mobile) | VERIFIED |
| eventbrite__category-music-1440.png | 1800x1125 | Sydney music category - /d/australia--sydney/music--events/ | VERIFIED |
| eventbrite__category-music-390.png | 780x1688 | Sydney music category (mobile) | VERIFIED |
| eventbrite__event-detail-1440.png | 1800x1125 | Event detail (Australian Tattoo Expo Sydney) | VERIFIED |
| eventbrite__event-detail-390.png | 780x1688 | Event detail (mobile) | VERIFIED |
| eventbrite__pricing-1440.png | 1800x1125 | Organiser pricing - eventbrite.com/organizer/pricing/ | VERIFIED |
| eventbrite__pricing-390.png | 780x1688 | Organiser pricing (mobile) | VERIFIED |
| eventbrite__help-1440.png | 1800x1125 | Help centre - https://www.eventbrite.com.au/help/ | VERIFIED |
| eventbrite__help-390.png | 780x1688 | Help centre (mobile) | VERIFIED |
| eventbrite__signup-1440.png | 1800x1125 | Signup (modal over photo) - /signup/ | VERIFIED |
| eventbrite__signup-390.png | 780x1688 | Signup (mobile card) | VERIFIED |
| eventbrite__organizer-1440.png | 1800x1125 | Organiser landing - /organizer/overview/ | VERIFIED |
| eventbrite__organizer-390.png | 780x1688 | Organiser landing (mobile) | VERIFIED |

## Summary

- 26 captures, **26 VERIFIED, 0 INVALID**.
- Two previously-missing surfaces captured this pass: Ticketmaster sign-in
  (reached by clicking the homepage "Sign In/Register" button, NOT a guessed
  auth URL - the prior attempt failed ERR_NAME_NOT_RESOLVED on a fabricated
  host) and the Eventbrite organiser landing.
- No dependent design decision is blocked: every reference surface is verified.

## Re-capture procedure (when stale or a new page type is needed)

1. Most surfaces: `node scripts/capture-competitors.mjs` (or the prior mirror
   capture script) at 1440 + 390, real UA, accept cookies, fold capture.
2. Auth/account pages: `node scripts/capture-competitor-missing.mjs` - NEVER
   guess an auth URL; navigate from the homepage account/"Sign In/Register"
   control and wait for the real form (`input[type=email]` / "sign in or create
   account") to render before the screenshot (the OAuth page is an SPA that
   shows a spinner first).
3. Clamp every capture to <= 1800px on the longest side (sharp).
4. Re-run the visual audit, update this INDEX (filename / dimensions / page /
   VERIFIED-INVALID) and `measurements.json`, and bump the stale date.
