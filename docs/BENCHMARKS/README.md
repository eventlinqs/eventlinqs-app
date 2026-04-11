# EventLinqs Competitor Benchmarks

## Purpose

This folder contains detailed teardowns of how Ticketmaster, Eventbrite, DICE, AXS, Songkick, and See Tickets handle every major user flow. These are not vague summaries — they are pattern-level analysis of real behavior, field-level detail, and UX decision documentation.

**Every Claude Code command that touches a user-facing feature must reference the relevant benchmark file before writing code.** The goal is not to copy these platforms — the goal is to understand what they do well, identify where they fail, and build a version of EventLinqs that is measurably better on every dimension.

EventLinqs will surpass Ticketmaster, Eventbrite, and DICE. These files are the bar we must clear, then exceed.

---

## How to Use This Folder

1. Before building any feature, open the relevant benchmark file
2. Read the patterns that apply to your task
3. Ask: "Is my implementation equal to or better than this?"
4. If equal — ship it
5. If better — ship it
6. If worse — do not ship it. Iterate.

---

## Benchmark Files

| File | Description |
|------|-------------|
| [event-creation.md](event-creation.md) | Eventbrite and Ticketmaster multi-step event creation wizards — fields, validation, smart defaults, image upload, draft saving |
| [seat-selection.md](seat-selection.md) | Ticketmaster and AXS interactive seat maps — color coding, hover states, best available, mobile touch targets, zoom behavior |
| [checkout-flow.md](checkout-flow.md) | Eventbrite and Ticketmaster checkout steps — field order, guest checkout, payment methods, fee transparency, mobile differences |
| [order-confirmation.md](order-confirmation.md) | Ticketmaster, Eventbrite, and DICE post-purchase screens — ticket delivery, calendar buttons, upsell, email content |
| [organiser-dashboard.md](organiser-dashboard.md) | Eventbrite Organizer and Ticketmaster Host portal — metrics above the fold, charts, order tables, quick actions |
| [events-listing-page.md](events-listing-page.md) | Eventbrite, DICE, and Songkick event grids — filter chips, cards, infinite scroll, skeleton loaders, sort options |
| [error-handling-and-empty-states.md](error-handling-and-empty-states.md) | How professional platforms handle form errors, 404s, empty states, payment failures, expired reservations |
| [mobile-responsiveness.md](mobile-responsiveness.md) | Breakpoints, touch targets, bottom-fixed CTAs, mobile checkout, safe-area insets, device-specific behavior |
| [pwa-and-app-experience.md](pwa-and-app-experience.md) | DICE, Ticketmaster, and Eventbrite app patterns — installable manifest, offline tickets, push notifications, wallet integration |
| [accessibility.md](accessibility.md) | WCAG 2.2 AA compliance patterns — keyboard nav, screen readers, ARIA, contrast, focus indicators, reduced motion |
| [performance.md](performance.md) | Core Web Vitals targets, image optimization, font loading, code splitting, edge caching patterns |

---

## Platform Quick Reference

| Platform | Strengths | Weaknesses |
|----------|-----------|------------|
| **Ticketmaster** | Best seat map UX, robust queue system, native wallet passes | Predatory fees revealed at last step, terrible mobile performance, forced account creation |
| **Eventbrite** | Best event creation wizard, clean organiser dashboard, strong email confirmations | Weak seat map, slow checkout, confusing fee disclosure |
| **DICE** | Best mobile app, fairest queue, strong anti-scalping | Limited to music/arts, no organiser self-serve seat map builder |
| **AXS** | Strong seat maps for arenas, good resale integration | Confusing UI, weak mobile, limited market |
| **Songkick** | Best event discovery and artist following | No ticketing engine, discovery only |

---

## Verification Notes

Where a specific detail is marked "TBD — verify with Playwright MCP", this means the detail was uncertain at time of writing. Use `mcp__playwright__browser_navigate` to visit the platform and verify before writing code that depends on that detail.
