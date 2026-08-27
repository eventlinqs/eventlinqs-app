# Ticketing System V1 - DESIGN

Status: **PROPOSAL - Phase 1 only. Awaiting founder approval. No implementation has been done.**
Date: 2026-05-17. Author: autonomous design pass (Option B selected by founder).

## 0. Problem and grounding facts (verified in this codebase)

EventLinqs can capture a Stripe payment but **never issues an admittable ticket**. Verified:

- No `public.tickets` table exists in **any** migration (grep across `supabase/migrations/**`). The "M4 Ticketing Engine" is `seat_maps` / `seat_map_sections` / `seats` / `seat_holds` (`baseline_schema.sql:1694-1823`) - reserved-seating *inventory*, not per-attendee issued tickets. No `ticket_code`, no QR generation anywhere.
- The confirmation email itself says "Your tickets will be available ... once our ticketing system is fully activated" (`api/webhooks/stripe/route.ts:792`).
- `confirm_order(p_order_id)` (`baseline_schema.sql`, `SECURITY DEFINER`, idempotent: returns early when `status='confirmed'`, locks the order `FOR UPDATE`, flips status, converts reservation, bumps `ticket_tiers.sold_count`) is the **single chokepoint** every confirmation flows through: paid (Stripe webhook `handlePaymentSucceeded` -> `confirm_order`), free logged-in (`actions/register-free.ts` -> `confirm_order`), and squad checkout. This is the correct, idempotent place to issue tickets.
- `order_items` (`baseline_schema.sql:686`) holds one row per tier with `quantity`, `item_type IN ('ticket','addon')`, snapshot `item_name`/prices, optional `attendee_*` fields. Tickets = expand each `item_type='ticket'` row into `quantity` individual ticket rows.
- `seats` table exists for reserved-seating events; a ticket may optionally reference a `seat_id`.
- No `qrcode` or ticket library in `package.json` (must add `qrcode`).
- ESLint: `@next/next/no-img-element: error`; `next/image` forbidden outside `src/components/media/**`. QR rendering must respect this (section 1.3).
- Hard rules (CLAUDE.md): RLS on every table; schema only via `supabase db push --linked` from PowerShell (never MCP `apply_migration`); regenerating `src/types/database.ts` is a **[SHARED]/Session-2-owned** action requiring PM coordination; AU English, no em-dashes, no exclamation marks; payment-adjacent code uses idempotency keys.

## 1.1 Schema design

New migration `supabase/migrations/20260517xxxxxx_ticketing_system.sql` (applied via `supabase db push --linked`).

**`public.tickets`**

| column | type | notes |
|---|---|---|
| id | uuid pk default uuid_generate_v4() | |
| order_id | uuid not null refs orders(id) on delete cascade | |
| order_item_id | uuid not null refs order_items(id) on delete cascade | which tier line this ticket belongs to |
| event_id | uuid not null refs events(id) | denormalised for fast scan-time lookup + RLS |
| ticket_tier_id | uuid refs ticket_tiers(id) on delete set null | |
| seat_id | uuid refs seats(id) on delete set null | reserved-seating events only |
| ticket_code | text not null unique | human code `EL-XXXX-XXXX` (1.2) |
| secret | uuid not null default uuid_generate_v4() | high-entropy value the QR encodes (anti-enumeration, 1.2/1.9) |
| holder_name | text | snapshot from order_item/profile |
| holder_email | text not null | delivery + magic-link view |
| status | text not null default 'valid' check in ('valid','scanned','refunded','void','transferred') | |
| scan_count | int not null default 0 | |
| first_scanned_at | timestamptz | |
| last_scanned_at | timestamptz | |
| scanned_by | uuid refs auth.users(id) | organiser/staff who admitted |
| transferred_to_email | text | V1 = holder_email reassignment only |
| refunded_at | timestamptz | set when `charge.refunded` webhook fires |
| created_at / updated_at | timestamptz default now() | |
| **unique (order_item_id, idx_in_item)** | | `idx_in_item` int 0..quantity-1 - the duplicate-proof key (1.4) |

**`public.ticket_scans`** (append-only audit): id, ticket_id refs tickets on delete cascade, event_id, scanned_by uuid, result text check in ('admitted','already_scanned','invalid','wrong_event','refunded','void'), scanned_at timestamptz default now(), device_info jsonb default '{}'.

**Indexes**: `tickets(order_id)`, `tickets(event_id, status)`, unique `tickets(ticket_code)`, `tickets(holder_email)`, `tickets(secret)`, unique `tickets(order_item_id, idx_in_item)`; `ticket_scans(ticket_id)`, `ticket_scans(event_id, scanned_at)`.

**RLS** (mirrors the proven `order_items` policy shape, `baseline_schema.sql:725-758`):
- SELECT: holder (`order_id IN (select id from orders where user_id = auth.uid())`) OR org owner/member of the event's organisation OR `service_role`.
- Scan/UPDATE: only org owner/member with role in ('owner','admin','manager','scanner') for that event's organisation, plus `service_role`. Buyers cannot mutate ticket status.
- `ticket_scans`: INSERT/SELECT for org members of the event + service_role; never buyer-writable.
- All issuance INSERTs happen as `service_role` inside `confirm_order` (SECURITY DEFINER), so RLS never blocks issuance.

## 1.2 Ticket code strategy

- `ticket_code`: `EL-` + 8 chars from Crockford base32 (no I/O/0/1) in two groups, e.g. `EL-7G4K-2PMQ`. ~32^8 ≈ 1.1e12 space; human-readable for support/manual entry. Uniqueness: DB `unique` + retry-on-collision in the issuance function (generate, insert, on unique-violation regenerate, max 5 tries).
- `secret`: a separate `uuid` (122-bit). **The QR encodes `ticket_code` + `secret`**, never user data. Scan validation requires both to match - the human code alone cannot be guessed/enumerated to forge entry, and exposing a `ticket_code` (e.g. in support) does not allow forging a scan.

## 1.3 QR code generation

- Library: `qrcode` (npm, standard, no native deps). Add to `dependencies`.
- Timing: generated **on demand**, not stored, not pre-generated. Rationale: avoids a Storage bucket + lifecycle, always reflects current status, trivial to render.
- Endpoint: `GET /api/tickets/[ticket_code]/qr` -> returns `image/png` (or `image/svg+xml`), payload encodes `https://www.eventlinqs.com/t/{ticket_code}?k={secret}` (the scan-resolve URL). 60s cache, `private`.
- **ESLint constraint**: feature code cannot use raw `<img>` or `next/image` directly. The QR is functional UI, not content media. Resolution: render via a tiny dedicated component under `src/components/media/` (the directory ESLint exempts) e.g. `media/QrImage.tsx` that wraps the API route URL, OR inline an SVG string from `qrcode`'s `toString` (no `<img>` at all - preferred for the ticket page and email). Email uses a `cid:`/hosted PNG (email clients cannot run the API route with cookies; use the public PNG endpoint).

## 1.4 Payment-to-ticket flow (the core integration)

**Decision: issue tickets inside `confirm_order`**, via a new SQL function `issue_tickets_for_order(p_order_id uuid)` called at the end of `confirm_order` just before `RETURN TRUE`.

- Idempotency: `confirm_order` already early-returns when `status='confirmed'`, so a duplicate Stripe webhook never re-issues. Defence in depth: `issue_tickets_for_order` inserts with `ON CONFLICT (order_item_id, idx_in_item) DO NOTHING`, so even a direct re-call cannot create duplicates. One ticket row per unit: for each `order_items` row with `item_type='ticket'`, insert `quantity` rows with `idx_in_item = 0..quantity-1`.
- Atomicity: issuance runs in the same transaction as order confirmation. If issuance raises, the whole `confirm_order` rolls back - the order does **not** flip to confirmed, the Stripe webhook returns non-200, Stripe retries. (This also fixes WEBHOOK-2: confirmation + issuance now succeed or fail together.)
- Covers paid + free + squad automatically because all route through `confirm_order`. Note: the **broken guest free-checkout path** (separate finding, PR #17 report) must be fixed for guests to ever reach `confirm_order`; ticketing V1 does not fix that - it is a prerequisite tracked separately.
- Seated events: when the order's reservation carries `seat_id`s, map them onto the issued tickets (V1: best-effort link; full seat<->ticket binding can be a fast-follow if seat data shape needs work).

## 1.5 Email delivery

- Update `buildConfirmationEmailHtml` (`api/webhooks/stripe/route.ts:725`) and `sendConfirmationEmail` (`:679`): after issuance, fetch the order's tickets; render per ticket a row with event name/date/venue, `ticket_code`, and an inline QR (`<img src="https://www.eventlinqs.com/api/tickets/{code}/qr">` - hosted PNG, the only place a raw img tag is acceptable since it is an email, not feature React code). Replace the "tickets available once activated" copy (`:792`).
- **Gap to also close (not strictly ticketing but adjacent)**: the free path sends **no** email at all today. V1 should route free confirmations through the same `sendConfirmationEmail` so free attendees get their tickets. Flag for founder: this touches `actions/register-free.ts` / `actions/checkout.ts` (Session-1).
- Resend send failure stays non-fatal (already swallowed) but tickets exist regardless and are recoverable via "resend" (1.8) and the account view (1.6). Email content is a cosmetic+functional change; if the founder considers template wording a content decision, the QR/codes are functional and the prose minimal - flag for sign-off per ESCALATE rule.
- Cannot be mailbox-verified in this environment (no Resend MCP) - will be labelled UNVERIFIED, needs a human/Playwright + mailbox pass.

## 1.6 User-facing ticket views (mobile-first - this is shown at the gate)

- `GET /tickets` - authenticated: list the signed-in user's tickets (RLS-scoped), grouped by event, status badges.
- `GET /t/[ticket_code]?k={secret}` - the single ticket view. Renders large QR (SVG), code, event date/venue/time, status. **No login required when `?k={secret}` matches** (magic-link from email so a guest buyer can show it at the gate) - this is the deliberate, scoped exception to "RLS prevents reading others' tickets": possession of the secret IS the bearer credential, exactly like a paper ticket. Without a valid `k`, the route requires the holder to be logged in.
- Design-system styling (navy/gold), 44px+ touch targets, brightness-friendly high-contrast QR, works offline once loaded (static after render).
- `/account` already exists; add a "My tickets" entry pointing at `/tickets`.

## 1.7 Organiser scan flow

- `GET /organisers/events/[id]/scan` - org owner/member only (RLS + page guard). Camera QR scan via `navigator.mediaDevices` + a lightweight decoder (`@zxing/browser` or `jsQR`); manual `ticket_code` entry fallback.
- Validation endpoint `POST /api/tickets/scan` (organiser-authed for that event): body `{ticket_code, secret, event_id}`. Server (service_role, atomic): load ticket; checks in order -> wrong_event / not found-invalid / refunded / void / already `scanned` (return `already_scanned` + `first_scanned_at`) / else set `status='scanned'`, `scan_count+1`, `first_scanned_at`, `scanned_by`; always append `ticket_scans`. Returns `{result, holder_name, tier, seat, message}`.
- UI: full-screen colour-coded result - green "Admit / {name} / {tier}", amber "Already scanned at {time}", red "Invalid / Refunded / Wrong event". Auto-advance to next scan in ~1.5s.
- Offline tolerance (V1-light): queue scans locally if the network drops and replay; conflicts resolved server-side by first-scan-wins (the `ticket_scans` log is the source of truth). Full offline is a documented fast-follow, not MVP-critical.

## 1.8 Edge cases

- **Refund**: extend the existing `charge.refunded` webhook handler to set the order's tickets `status='refunded'`, `refunded_at=now()`. Scan of a refunded ticket -> red "Refunded, do not admit".
- **Transfer (V1 minimal)**: holder can change `holder_email`/`holder_name` on their own ticket from `/t/[code]` (re-issues the magic link to the new email; old link's secret unchanged so it still resolves - acceptable for V1; a true revoke-and-reissue transfer is a fast-follow).
- **Duplicate scan**: first scan wins (status flips); subsequent -> `already_scanned` with timestamp; every attempt logged in `ticket_scans`.
- **Lost ticket**: `/tickets` (logged-in) always shows it; add a "Resend my tickets" action on the order confirmation page + `/help` that re-sends `sendConfirmationEmail` for an order the user owns (rate-limited).

## 1.9 Security

- QR encodes only `ticket_code` + `secret` (no PII, no user id). Scan resolves everything server-side.
- `secret` is 122-bit uuid: brute force infeasible; `ticket_code` alone is insufficient to scan (both required) so support exposure / shoulder-surf of the code does not enable forgery.
- RLS prevents cross-user ticket reads (mirrors order_items policies); the only unauthenticated read is the bearer magic-link (`ticket_code`+`secret`), which is the intended ticket-possession model.
- Scan + status mutation requires organiser membership of the event's organisation; buyers can never set `status`.
- `/api/tickets/scan` rate-limited (reuse `src/lib/rate-limit/**`) to blunt enumeration of the scan endpoint.

## 1.10 Implementation order (sequenced, MVP-critical vs polish)

| # | Step | MVP? | Complexity | Ships independently |
|---|---|---|---|---|
| 1 | Migration: `tickets` + `ticket_scans` + RLS + indexes (`supabase db push --linked`); regen `database.ts` ([SHARED] - PM coordinate) | **MVP** | M | yes (inert until step 2) |
| 2 | `issue_tickets_for_order()` SQL fn + call from `confirm_order`; idempotent | **MVP** | M | yes |
| 3 | `qrcode` dep + `/api/tickets/[code]/qr` + scan-resolve `/t/[code]` view | **MVP** | M | yes |
| 4 | Confirmation email: real tickets + QR, remove "not activated" copy; route free path through email | **MVP** | M | yes |
| 5 | `/tickets` account list | **MVP** | S | yes |
| 6 | `/api/tickets/scan` + `/organisers/events/[id]/scan` camera UI | **MVP** | L | yes |
| 7 | Refund -> tickets refunded (extend `charge.refunded`) | **MVP** | S | yes |
| 8 | Resend-tickets action; transfer (email reassignment) | polish | S | yes |
| 9 | Offline scan queue; Apple/Google Wallet passes | polish (post-launch) | L | yes |

Each step is gate-green-committable on its own; steps 1-7 are the launch-critical set. Steps 1-4 deliver "payment -> real ticket in inbox + account"; steps 5-7 deliver "organiser can admit at the gate".

## Estimated implementation time

Steps 1-7 (launch-critical): roughly 5-8 focused build sessions (the migration + `confirm_order` change + scan flow are the heavyweight items; the schema migration and `database.ts` regen require Session-2/PM coordination and a real `supabase db push --linked` from PowerShell that this autonomous environment cannot fully execute/verify). Steps 8-9: 2-3 more, post-launch acceptable.

## Open questions for founder (decide before Phase 2)

1. **Schema migration ownership**: the migration + `src/types/database.ts` regen is [SHARED]/Session-2 territory and needs `supabase db push --linked` run from a real PowerShell session (not executable/verifiable autonomously here). Confirm who runs the push and when, and that Session-2 coordinates the `database.ts` regen.
2. **Guest free-checkout is broken** (separate PR #17 finding) - guests never reach `confirm_order`, so they would still get no ticket even after this build. Confirm this is fixed in parallel/first, or that V1 ticketing targets logged-in + paid only initially.
3. **Email template wording**: replacing the confirmation email body is partly content. Approve the minimal functional copy ("Your tickets are below. Show the QR at the gate.") or supply preferred wording (ESCALATE rule: email content beyond cosmetic).
4. **Seated events**: bind tickets to specific `seats` rows in V1, or issue general-admission-style tickets first and add seat binding as a fast-follow? (Recommend: GA-style in V1, seat binding fast-follow.)
5. **Scan auth model**: a dedicated lightweight "scanner" org role/PIN for door staff, or reuse existing owner/admin/manager membership? (Recommend: reuse existing roles for V1, add a scoped scanner role later.)
6. **Wallet passes** (Apple/Google): in scope for V1 or explicit post-launch? (Recommend: post-launch.)

## STOP - Phase 1 gate

End of design. **No code, schema, dependency, or copy has been changed.** Phase 2 (implementation) will not begin until the founder approves this design and answers the open questions.
