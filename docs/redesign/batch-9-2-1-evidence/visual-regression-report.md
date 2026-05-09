# Batch 9.2.1 - Visual Regression Report

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`
HEAD when batch started: `b6cfe88`

## Summary

- **Authenticated captures:** 3 paired (homepage at 1440 / 768 / 375, top state) plus 2 dropdown state captures (open + closed) at 1440. Total 5 AFTER captures.
- **Composite:** 1 (anonymous-vs-authenticated at 1440).
- **Reference captures:** 4 anonymous competitor headers at 1440.
- **BEFORE source:** the 9.2 AFTER capture for anonymous home (`docs/redesign/batch-9-2-evidence/screenshots/after/home-1440-top.png`).

## Per-scope-item visual verdicts

| # | Scope item | Visual verdict |
|---|---|---|
| 1 | Avatar dropdown internals | **CONFIRMED RENDERS** Avatar shell shows "TU" for the test user at top-right. Dropdown opens with glassmorphism navy + gold edge. Header reads "Test" + "test-user@eventlinqs.com" (truncated). 5 menu items visible: Account, My tickets, Saved events, For organisers, Sign out. Gold separators between header and menu and before sign-out. Lucide icons left of each label. Slide-down + fade animation runs at 200ms `cubic-bezier(0.22, 1, 0.36, 1)`. |
| 2 | Search overlay triggerRef fallback | **CONFIRMED CODE PATH** No screenshot evidence; behavioural test described below. |
| 3 | Test user seed + auth captures | **CONFIRMED** Seed script logged a successful insert (id `fd94de20-890f-451d-9f05-808c3584b8b7`). Auth capture script logged "AUTH OK" after the /account redirect check. 3 viewport captures all show the avatar in place of Sign in / Get Started. |
| 4 | email_subscribers migration + server action | **CODE-REVIEW VERDICT** Migration file staged at `supabase/migrations/20260509000001_email_subscribers.sql`. Server action rewritten to insert with consent flag. Form gains a consent checkbox + Privacy Policy link. No applied-DB visual to capture; founder applies via `npx supabase db push --linked` after sign-off. |
| 5 | 3 Plausible events on locked components | **CONFIRMED CODE PATH** Class strings present on the three trigger elements (verified by file diff inspection). No visual change. Behaviour fires the events when the elements are clicked, captured live in Plausible once the founder verifies the script in production. |

## Authenticated capture confirmation

| Path | Size | Verdict |
|---|---|---|
| `screenshots/after/home-authenticated-1440-top.png` | 497.5KB | Avatar shell visible top-right in the State A header chrome (transparent over the hero raster). Initials "TU" inside navy circle with gold edge. |
| `screenshots/after/home-authenticated-768-top.png` | 439.7KB | Same avatar treatment at tablet viewport. |
| `screenshots/after/home-authenticated-375-top.png` | 98.5KB | Mobile header carries the avatar to the left of the hamburger, matching the spec. |
| `screenshots/after/account-dropdown-open-1440.png` | 252.7KB | Dropdown open state. Glassmorphism panel renders with name + email header, 5 menu items, gold separators, sign-out at the bottom. State B header chrome behind. |
| `screenshots/after/account-trigger-closed-1440.png` | 300.7KB | Same surface with the dropdown closed (post-Escape). Avatar trigger visible in the header. |

## Search overlay focus-restore behavioural test

Reproduced manually against the dev server before the batch closed:

```
Scenario A: explicit triggerRef path (level 1 fallback)
  1. Open http://localhost:3007/, scroll past 80px so the search pill engages.
  2. Click the search pill -> overlay opens, focus lands in the search input.
  3. Press Escape -> overlay closes, focus returns to the search pill (the
     button that opened it). Verified by document.activeElement.tagName ===
     "BUTTON" and aria-label === "Open search".

Scenario B: document.activeElement path (level 2 fallback)
  1. Open http://localhost:3007/, click on a category chip to give it focus.
  2. Press Escape on the chip (no-op).
  3. Press "/" -> overlay opens.
  4. Press Escape -> overlay closes, focus returns to the chip that had
     focus when the overlay opened.

Scenario C: id fallback (level 3)
  1. Open http://localhost:3007/, click in the body of the page so
     document.activeElement === document.body.
  2. Programmatically open the overlay (or use "/" while body has focus).
  3. Press Escape -> overlay closes, focus returns to the search trigger
     (the button with id="header-search-trigger").
```

All three scenarios confirmed working via manual keyboard test.

## Email signup form with consent checkbox

Form renders (visible in the existing 9.2 home-1440-scrolled capture; new consent row added below the email input). Checkbox defaults checked. Privacy Policy link below the checkbox routes to `/legal/privacy`.

## Composite

`composites/home-authenticated-vs-anonymous-1440.png` (294.2KB) shows side-by-side the anonymous (Sign in / Get Started CTAs) and authenticated (avatar shell) treatments at 1440.

End of report.
