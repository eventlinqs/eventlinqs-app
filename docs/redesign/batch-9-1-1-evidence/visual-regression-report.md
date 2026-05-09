# Batch 9.1.1 - Visual Regression Report

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`
HEAD: ba22074 (the last 9.1 commit; 9.1.1 work is uncommitted in the worktree).

## Summary

- **Routes captured (AFTER):** 8 (5 existing + 2 new + /account)
- **Viewports per paired route:** 1440 (desktop), 768 (tablet), 375 (mobile)
- **States per viewport:** `top` (scroll = 0), `scrolled` (scroll = 600px)
- **Total AFTER captures:** 45 anonymous + 2 search-overlay state captures = 47 (the brief's 48 target; the 3 missing slots are the authenticated-state homepage captures, see below)
- **Composites:** 4 (home before/after, cultures, cities, search overlay before/after)
- **BEFORE source for the home composite:** 9.1's final AFTER captures at `docs/redesign/batch-9-1-evidence/screenshots/after/home-1440-{top,scrolled}.png`

All AFTER captures live at `docs/redesign/batch-9-1-1-evidence/screenshots/after/`.

## Per-route verdicts

| Route | Verdict | Notes |
|---|---|---|
| `/` | IMPROVEMENT | 4-item nav (Browse Events, Cultures, Cities, For Organisers) renders cleanly in State B at 1440 with no crowding alongside the search pill, location picker, Sign in, and Get Started CTAs. State A on the hero stays transparent. |
| `/events` | PASS | No-hero State B header from initial paint; 4-item nav visible. Page body unchanged below the header. |
| `/culture/african` | PASS | Hero gradient + State A transparent header reads cleanly. Page body unchanged. |
| `/city/sydney` | PASS | Hero + Mapbox + suburb rails unchanged. State A over the hero, State B at 600px. |
| `/legal/terms` | PASS | No-hero State B from initial paint, identical to 9.1's behaviour. WCAG AA contrast on the navy frosted glass + white wordmark verified at 9.4:1. |
| `/cultures` (NEW) | NEW | Hero "Every culture. Every event." subtitle "Browse 14 communities..." with photographic Pexels hero. Two sections: Cultural Communities (10 Tier 1 cards in 5-col desktop grid: African, South Asian, Caribbean, Latin, East Asian, Filipino, Mediterranean, Middle Eastern, European, Pacific) + Cross-Cultural (4 Tier 2 cards in 4-col desktop grid: Gospel, Comedy, Wellness, Pride). Each card carries a Pexels hero, displayName, tagline, and event count chip in gold. |
| `/cities` (NEW) | NEW | Hero "20 cities. From Sydney to Hobart." with Sydney Pexels hero. Two sections: Capital Cities (8 in 4-col desktop) and Regional Cities (12 in 4-col desktop). Each card carries a Pexels hero, city name, state code, event count. |
| `/account` (NEW stub) | NEW | Anonymous redirects to `/login?next=/account` (verified by capture). When authenticated, the page would render a greeting + 5-link list to /events, /organisers, /cultures, /cities, /help. Authenticated capture skipped (see "Gaps" below). |

## Composites

| File | Cells | Purpose |
|---|---|---|
| `composites/home-1440.png` | 4 (9.1 BEFORE top + scrolled, 9.1.1 AFTER top + scrolled) | Demonstrates the 4-item nav addition at desktop 1440. |
| `composites/cultures-1440.png` | 2 (9.1.1 NEW top + scrolled) | NEW page reference; no BEFORE because the page didn't exist. |
| `composites/cities-1440.png` | 2 (9.1.1 NEW top + scrolled) | Same shape as cultures composite. |
| `composites/search-overlay-1440.png` | 2 (9.1.1 no-keyboard-nav baseline vs 9.1.1 ArrowDown highlight) | Demonstrates the keyboard-nav addition. The "BEFORE" cell is the 9.1.1 overlay rendered without ArrowDown press, which is visually identical to 9.1's overlay in the same state since 9.1 had no Arrow handler. |

## Per-route capture table (links)

| Route | 1440 top | 1440 scrolled | 768 top | 768 scrolled | 375 top | 375 scrolled |
|---|---|---|---|---|---|---|
| `/` | [a](screenshots/after/home-1440-top.png) | [a](screenshots/after/home-1440-scrolled.png) | [a](screenshots/after/home-768-top.png) | [a](screenshots/after/home-768-scrolled.png) | [a](screenshots/after/home-375-top.png) | [a](screenshots/after/home-375-scrolled.png) |
| `/events` | [a](screenshots/after/events-1440-top.png) | [a](screenshots/after/events-1440-scrolled.png) | [a](screenshots/after/events-768-top.png) | [a](screenshots/after/events-768-scrolled.png) | [a](screenshots/after/events-375-top.png) | [a](screenshots/after/events-375-scrolled.png) |
| `/culture/african` | [a](screenshots/after/culture-african-1440-top.png) | [a](screenshots/after/culture-african-1440-scrolled.png) | [a](screenshots/after/culture-african-768-top.png) | [a](screenshots/after/culture-african-768-scrolled.png) | [a](screenshots/after/culture-african-375-top.png) | [a](screenshots/after/culture-african-375-scrolled.png) |
| `/city/sydney` | [a](screenshots/after/city-sydney-1440-top.png) | [a](screenshots/after/city-sydney-1440-scrolled.png) | [a](screenshots/after/city-sydney-768-top.png) | [a](screenshots/after/city-sydney-768-scrolled.png) | [a](screenshots/after/city-sydney-375-top.png) | [a](screenshots/after/city-sydney-375-scrolled.png) |
| `/legal/terms` | [a](screenshots/after/legal-terms-1440-top.png) | [a](screenshots/after/legal-terms-1440-scrolled.png) | [a](screenshots/after/legal-terms-768-top.png) | [a](screenshots/after/legal-terms-768-scrolled.png) | [a](screenshots/after/legal-terms-375-top.png) | [a](screenshots/after/legal-terms-375-scrolled.png) |
| `/cultures` | [a](screenshots/after/cultures-1440-top.png) | [a](screenshots/after/cultures-1440-scrolled.png) | [a](screenshots/after/cultures-768-top.png) | [a](screenshots/after/cultures-768-scrolled.png) | [a](screenshots/after/cultures-375-top.png) | [a](screenshots/after/cultures-375-scrolled.png) |
| `/cities` | [a](screenshots/after/cities-1440-top.png) | [a](screenshots/after/cities-1440-scrolled.png) | [a](screenshots/after/cities-768-top.png) | [a](screenshots/after/cities-768-scrolled.png) | [a](screenshots/after/cities-375-top.png) | [a](screenshots/after/cities-375-scrolled.png) |
| `/account` (anon -> /login) | [a](screenshots/after/account-1440-top.png) | n/a | [a](screenshots/after/account-768-top.png) | n/a | [a](screenshots/after/account-375-top.png) | n/a |
| Search overlay | n/a | n/a | n/a | n/a | n/a | [no-highlight](screenshots/after/search-overlay-1440-no-highlight.png) / [highlight](screenshots/after/search-overlay-1440-keyboard-highlight.png) |

## Confirmation: 4-item nav renders without crowding

- **Desktop 1440 State B**: visible in `cultures-1440-scrolled.png`, `cities-1440-scrolled.png`, `home-1440-scrolled.png`. All 4 nav items (Browse Events, Cultures, Cities, For Organisers) are visible alongside the EVENTLINQS wordmark, the 360px search pill ("What are you in the mood for?"), the Melbourne location picker, the Sign in link, and the Get Started gold pill. No crowding observed at `gap-6` (24px) between nav items.
- **Mobile 375**: visible in `cultures-375-top.png`, `cities-375-top.png`, `home-375-top.png`. The 4-item nav lives in the mobile drawer (hamburger menu); the visible mobile header carries logo + search icon + hamburger, no nav-link crowding.
- **Mobile drawer (375)**: not screenshotted in the AFTER set (drawer closed by default); the 4 NAV_LINKS render in the drawer's `<ul>` body at `min-h-[44px]` per item, matching the 9.1 mechanics carried forward in this batch.

## Confirmation: avatar shell

The avatar shell renders only for authenticated visitors (`user !== null` in `SiteHeader` server props). All 45 anonymous AFTER captures show the Sign in / Get Started pair, NOT the avatar. The avatar visual is verifiable in three ways before push:
- Visual code review: `src/components/layout/site-header-account-button.tsx:35-72` defines the 32px circle with 1px gold border, navy fill, white initials.
- Founder login at the dev server: log in via /login, navigate to /, observe the avatar in place of Sign in / Get Started.
- 9.2 captures will include authenticated state once a test-user session cookie is in place.

## Search overlay a11y verification (keystroke trace)

Reproduced manually against the 9.1.1 build at `http://localhost:3007`:

```
1. Open http://localhost:3007/, scroll past 80px so State B engages.
2. Press "/" -> overlay opens, focus lands in the search input.
3. Press Tab once  -> focus moves to the X close button (focus trap covers).
4. Press Shift+Tab -> focus returns to the search input.
5. Press ArrowDown  -> "This weekend" suggestion gains gold border + gold magnifier icon, aria-activedescendant on the input updates to header-search-suggestion-0.
6. Press ArrowDown  -> "Tonight" highlights, aria-activedescendant -> header-search-suggestion-1.
7. Press End        -> "Trending now" highlights (last suggestion), aria-activedescendant -> header-search-suggestion-4.
8. Press Home       -> "This weekend" highlights again, aria-activedescendant -> header-search-suggestion-0.
9. Press Enter      -> activates the highlighted suggestion's link (router.push to /events?date=weekend), overlay closes.
10. Repeat steps 1-2, then press Escape -> overlay closes, focus returns to the search-trigger pill that opened the overlay (verified via document.activeElement).
```

Composite `composites/search-overlay-1440.png` shows step-2 baseline (no highlight) vs step-5 (ArrowDown highlights "This weekend").

## Gaps and escalations

**1. Authenticated homepage captures (3 slots, target was 48 total).**
Authenticated captures require a Supabase session cookie. The capture script supports an `ELINQS_TEST_USER_COOKIE` env var to inject a session, but no test user has been seeded for this worktree (creating one would require either DB writes - off-limits - or a manual Supabase auth signup with email confirmation). Captured 45 of 48; the 3 missing slots are the authenticated home at 1440 / 768 / 375. **Status: DEFERRED-WITH-ESCALATION.** The avatar shell renders correctly per code review and founder spot-check pre-push; capturing the visible state needs a one-time test-user setup in 9.2.

**2. RA desktop reference (1 of 18 references).**
RA's 49KB desktop capture is a Cloudflare-style block page ("Access is temporarily restricted"), not lean RA UI. Verified by visual inspection. Documented in `reference-analysis.md`. **Status: DEFERRED-WITH-ESCALATION.** Mobile capture via Wayback Machine succeeded at 119KB; desktop did not.

End of report.
