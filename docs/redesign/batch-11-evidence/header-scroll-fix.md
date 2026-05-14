# Batch 11.0 - Header scroll fix

Date: 2026-05-14

## Problem

The Batch 9.1 dual-state SiteHeader used `rgba(10, 22, 40, 0.72)` + `backdrop-filter: blur(20px) saturate(180%)` in State B (scrolled past sentinel). The brief reported mid-scroll text bleed-through that broke readability on long pages. The 72% opaque navy + saturated blur let bright page content show through enough to compete with the white nav labels.

## Fix

`src/app/globals.css` `.site-header-glass[data-scrolled="1"]`:

- Background changed from `rgba(10, 22, 40, 0.72)` to solid `rgb(10, 22, 40)`.
- `backdrop-filter` and `-webkit-backdrop-filter` set to `none` (no longer needed once the background is opaque; saves a compositing layer).
- Gold accent border-bottom preserved at `rgba(212, 164, 55, 0.30)`.
- State A (transparent over hero) unchanged.
- Transition timing unchanged (300ms `cubic-bezier(0.22, 1, 0.36, 1)` on the header element).

The `@supports not (backdrop-filter)` fallback rule was deleted: with State B now solid, no fallback is needed.

## Visual evidence

Header sampled at 5 scroll positions (1440 viewport):

| Scroll y | File | Verdict |
|---|---|---|
| 0 | `screenshots/after/header-scroll-0px-1440.png` | State A transparent over hero. White wordmark + nav legible. |
| 200 | `screenshots/after/header-scroll-200px-1440.png` | State A still transparent (sentinel not yet crossed). |
| 500 | `screenshots/after/header-scroll-500px-1440.png` | State B solid navy with gold border. Nav legible. |
| 1000 | `screenshots/after/header-scroll-1000px-1440.png` | State B solid navy. Trending bento behind header is fully occluded. No bleed-through. |
| 2000 | `screenshots/after/header-scroll-2000px-1440.png` | State B solid navy. Deep page content occluded cleanly. |

## Regression risk

- The frosted-glass aesthetic was a design choice in State B; making it solid removes the translucent layering effect. State A (over hero) remains transparent so the dual-state contrast is preserved.
- The 1-pixel gold border at `rgba(212, 164, 55, 0.30)` keeps a subtle State B accent so the header still reads as the platform's branded chrome, not a generic solid bar.

End of report.
