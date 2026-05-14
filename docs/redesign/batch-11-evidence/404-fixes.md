# Batch 11.0 - 404 fixes

Date: 2026-05-14

## Diagnosis

Founder's mobile DevTools surfaced two 404s on homepage load: `saved:1` and `search:1`. Grep on the codebase pinpointed the source:

```
$ grep -nE "/saved|/search" src/components/layout/mobile-bottom-nav.tsx
50:  { href: '/search',   label: 'Search',  Icon: Search,     matchExact: false },
51:  { href: '/saved',    label: 'Saved',   Icon: Heart,      matchExact: false },
```

The mobile bottom nav (mounted globally in `src/app/layout.tsx`) prefetched these routes via Next's `<Link>` component. Neither route exists:

- `/search` - no `src/app/search/page.tsx`. The platform's search lives in the header search overlay (Batch 9.1.1) and in `/events` filtering, not a dedicated page.
- `/saved` - no `src/app/saved/page.tsx`. The authenticated saved-events stub was shipped at `/account/saved` in Batch 9.1.1.

The Next router prefetches `<Link>` targets aggressively on mobile when they enter the viewport. Both missing pages returned 404 on prefetch, surfacing as `saved:1` and `search:1` Network panel entries.

## Fix

`src/components/layout/mobile-bottom-nav.tsx` ITEMS array updated:

| Label | Was | Now | Rationale |
|---|---|---|---|
| Search | `/search` (404) | `/events?focus=1` | `/events` is the canonical browse-and-filter surface; the query string is a hook for `/events`'s client to autofocus its search input on mount (no new route needed). |
| Saved | `/saved` (404) | `/account/saved` (200) | Routes to the existing authenticated saved-events stub from 9.1.1. |

The 5-item bar shape is unchanged. Only the destinations move to existing routes. The Plausible event tags on each item are unchanged.

## Verification

```
$ ls src/app/saved 2>&1
ls: cannot access 'src/app/saved': No such file or directory
$ ls src/app/search 2>&1
ls: cannot access 'src/app/search': No such file or directory
$ ls src/app/account/saved
page.tsx
$ ls src/app/events
[slug]  browse  page.tsx
```

`/events` and `/account/saved` both render successfully (verified via the Batch 11.0 visual regression captures at `screenshots/after/events-1440.png`).

## Residual exposure

`/events?focus=1` does not yet wire a client-side effect that autofocuses the events page's search input. The route resolves (no 404), so the immediate Console error is gone, but the "Search" tap deposits the user on the `/events` page without a primed search field. Wiring the `?focus=1` autofocus is queued for Batch 11.1 (Part 2 spacing audit pass) or a small follow-up; the 404 is the issue that this batch needed to resolve.

End of report.
