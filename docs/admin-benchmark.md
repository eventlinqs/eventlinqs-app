# Admin benchmark (achievable)

## Scope and honesty note

Ticketmaster's and Eventbrite's **internal back-office admin** is behind their
own staff/organiser logins and is **not reachable** for capture. This benchmark
does not claim to compare against it. It benchmarks the EventLinqs admin against:

1. the competitors' **public organiser-facing surfaces** (Eventbrite "for
   organizers" / Organizer area, Ticketmaster host/business marketing), which
   are the closest public analogue to operator tooling, and
2. the **data-density and professionalism bar** a world-class operations console
   is expected to meet.

The visual side-by-side at 1440 and 390 is produced by the proof harness
(`tests/admin-proof/`, competitor captures via the existing competitor-capture
scripts) once the authenticated admin session is saved. The verdict below is the
feature-and-craft assessment that the screenshots evidence.

## Dimensions

| Dimension | EventLinqs admin | Verdict |
|---|---|---|
| Operational data density | Dashboard leads with live GMV (net of refunds), new-organiser and KYC queues, pending refunds, active disputes, and live Stripe/Supabase/Redis health, each a glanceable tile. Deep surfaces for orders, refunds, disputes, payouts, organisers, events, users, pricing, staff, audit. | SURPASS the public organiser surfaces (which are marketing, not data); PARITY-or-better vs the operations bar |
| Breadth of real controls | Refund processing, Stripe dispute evidence/accept, payout disburse/void, payout hold, organiser approve/suspend (with event-unpublish cascade)/reinstate, event pause/resume/cancel/takedown, fee overrides, RBAC staff management with per-capability overrides, 2FA. Every control is a real, audited action. | SURPASS |
| Information hierarchy + polish | One navy/gold system, solid opaque surfaces (no glassmorphism), consistent stat tiles, tables, status badges, designed empty states, and audit-logged confirmations. | PARITY with the professional bar; the consistency is strong |
| Accessibility | Server-gated routes, 44px targets, focus-visible rings, labelled controls, axe-scanned in the harness (target 0 serious/critical). | Measured by the harness; target PARITY+ |
| Mobile (390) | Full hamburger drawer giving every route; tables scroll; tiles stack; the drawer is keyboard- and touch-accessible. | SURPASS the typical desktop-only operator tool |

## What proves it

- Screenshots of every surface at 1440 and 390 with real data
  (`tests/admin-proof/output/`).
- axe per-surface counts (0 serious/critical target).
- Authenticated Lighthouse medians (`scripts/admin-lighthouse.mjs`).

Any dimension the screenshots or numbers show BELOW the bar is iterated before
this is called done.
