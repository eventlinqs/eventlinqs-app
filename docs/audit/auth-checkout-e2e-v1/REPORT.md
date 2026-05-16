# Auth + Checkout E2E Verification - REPORT

Run date: 2026-05-17. Target: https://www.eventlinqs.com (production). Stripe: TEST mode.

## Tooling reality (bounds every result below)

No Playwright MCP, no Stripe MCP, no Resend MCP in this environment. Available: Firecrawl (scrape + `interact` browser automation), Supabase (read-only SQL), curl, code inspection. Consequences, stated up front so nothing here is overclaimed:

- **Email-link steps are not executable** (signup verification link, password-reset completion): no inbox, `@eventlinqs.test` is non-deliverable. Verified to the backend boundary (auth row / dispatch) + code; the link click itself is labelled NOT-EXECUTABLE, which is a tooling limit of this run, not necessarily a product defect.
- **Stripe capture is not dashboard-verifiable**: no Stripe access. The paid path is assessed by authoritative code inspection + Supabase order/payment/webhook state, not a Stripe dashboard confirmation.

Labels used: **PASS** (executed + verified), **FAIL** (executed, reproducibly broken), **NOT-EXECUTABLE** (blocked by tooling, assessed via code/state), **STRUCTURAL** (code-verified defect).

---

## 1. Auth flows

| Flow | Result | Evidence |
|---|---|---|
| Signup (new user) | **PASS** to email gate | Drove `/signup` via Firecrawl interact with `test-e2e-1747449600@eventlinqs.test`; redirected to `/verify-email-sent`, "Check your inbox" shown. Supabase `auth.users` row created (id `d255b16f-e7bb-46b3-b690-a5e612321cc5`, `email_confirmed_at`=null, full_name "E2E Test User"). Code: `components/auth/signup-form.tsx:39` `supabase.auth.signUp` → `/verify-email-sent`. |
| Email verification | **NOT-EXECUTABLE** | Confirmation email cannot be received/clicked (no inbox). Backend correctly enforces it (`email_confirmed_at`=null; login blocked until confirmed). Code path present (`auth/callback/route.ts:12` `exchangeCodeForSession`, `auth/confirm/route.ts:14` `verifyOtp`). Needs a human/Playwright + real mailbox pass before launch. |
| Login | **PARTIAL / wiring PASS** | `/login` form present and wired (`login-form.tsx:35` `signInWithPassword`). Full authenticated login+redirect not executed: only test user is email-unconfirmed (Supabase rejects unconfirmed login by design) and no pre-confirmed seeded account/inbox exists. `/dashboard` unauthenticated → 307 `/login?redirect=%2Fdashboard` (guard works). |
| Logout | **NOT-EXECUTABLE** (code-verified present) | `app/actions/auth.ts:19` server action `signOut()` → `redirect('/')`, wired from header/dashboard dropdowns. Not executed (requires authenticated session). |
| Password reset | **NOT-EXECUTABLE** + **STRUCTURAL risk** | `/forgot-password` present (`forgot-password-form.tsx:19` `resetPasswordForEmail`, redirectTo `/auth/reset-password`). `/auth/reset-password` relies on supabase-js `detectSessionInUrl`/`PASSWORD_RECOVERY` with no explicit code exchange. Cannot verify without the emailed link. RISK: if the live Supabase template delivers a PKCE `?code=` link, the page may hang on "Validating". Must be confirmed by a human email-link test before launch. |

Auth subsystem is structurally sound (Supabase-native, email confirmation enforced, `/dashboard` guarded). `/dashboard` protection is a **page/layout server guard, not edge middleware** (no `middleware.ts` exists at root or `src/`); production 307 proves it is enforced - functionally secure, architecture note only.

## 2. Free checkout - **FAIL (production, reproduced)**

Event: `reggae-on-the-lawn-family-carnival-day` (genuine single $0 tier, `is_free=true`).

Guest flow: set "Free Admission" qty=1 → button becomes "Register 1 ticket" → **click is a complete no-op**. Two independent Firecrawl-interact attempts: no navigation, no email-capture step, no confirmation, **no error message**, page unchanged. Supabase verification: **0 reservations and 0 orders** created (checked twice, 20-min window + event-scoped). Client logic is correct (`ticket-selector.tsx:98-118`: guest free → `registerFreeTickets` → `/checkout/{reservation_id}`); the failure is server-side - `registerFreeTickets` produces no reservation and the error is swallowed by `startTransition` (no `setError`, no nav). A guest cannot register for a free event, and gets zero feedback. This breaks a core flow and the "guest checkout, zero friction" platform principle. Root cause not definitively isolated (candidates: `register-free.ts:75` `getOrCreateGuestSessionId()` cookie write inside a server action, `create_reservation` RLS for the anon role, or an unhandled server-action throw) - needs local repro/logs. **Escalated, not speculatively patched** (Session-1 reservation/payment territory).

## 3. Paid checkout - **NOT-EXECUTABLE live; STRUCTURALLY assessed**

Headless card entry through the Stripe Elements iframe + 3D Secure is unreliable and unverifiable without Stripe access, so it was not falsely "passed". Authoritative code assessment (verified file:line):

- Reservation → `/checkout/[reservation_id]` → `processCheckout` (`actions/checkout.ts`): order inserted, payment row with `idempotency_key=order_id`, `createDestinationCharge` → PaymentIntent with `transfer_data.destination` + `application_fee` + `on_behalf_of`. Stripe idempotency key = `order_id`.
- **Fee is correct and DB-driven**: `payment-calculator.ts:163-167` reads `getPlatformFeePercentage`/`getPlatformFeeFixedCents` from `pricing-rules.ts` (the `pricing_rules` precedence reader). No hardcoded 2.5% / AUD 0.50 anywhere. Matches the launch fee.
- Webhook `api/webhooks/stripe/route.ts`: signature verified; `payment_intent.succeeded` idempotent; `confirm_order` RPC idempotent.

So money *capture* is structurally sound. But see the launch blockers - a captured payment still yields no admittable ticket.

## 4. Launch-blocking defects (verified)

| ID | Severity | Finding |
|---|---|---|
| **WEBHOOK-1** | **CRITICAL - LAUNCH BLOCKER** | **No ticket issuance system exists.** No `tickets`/`issued_tickets` table, no QR/ticket-code generation anywhere in code or migrations. `confirm_order` only flips order status + bumps `sold_count`. The confirmation email itself says "Your tickets will be available ... once our ticketing system is fully activated" (`route.ts:792`). A buyer can pay successfully and receive nothing to enter with. The platform cannot deliver the product it sells. |
| **FREE-CHECKOUT** | **CRITICAL - LAUNCH BLOCKER** | Guest free registration produces no reservation/order and no feedback (section 2, reproduced + DB-verified). |
| WEBHOOK-2 | HIGH | `route.ts:110-113,152`: webhook returns 200 and only logs if `confirm_order` fails. Money captured, order/inventory can be left inconsistent, Stripe will not retry. No automated recovery. |
| PAID-1 / FREE-1 | HIGH | `checkout.ts:305-309` / `register-free.ts:194`: `order_items` insert failure is non-fatal; an order can confirm with zero/partial line items (empty ticket list in email/account). |
| AUTH-2 | HIGH (unverified) | Password-reset code-exchange unverified; may hang on PKCE links. Needs a human email-link test. |
| MISLABEL | MEDIUM (FIXED) | Event detail derived free-ness from `min(tier price)`, so an event with a $0 RSVP tier + paid tiers (e.g. gospel-on-the-river: Free Admission $0 + Reserved Seat AUD 35) advertised "Free entry". Revenue/trust bug. **Fixed this run.** |
| AUTH-1 | LOW (FIXED) | Login ignored the `?redirect=` deep-link set by the guard; always landed `/dashboard`. **Fixed this run.** |
| EMAIL-FREE | MEDIUM | No confirmation email is sent on any free path (only the Stripe webhook sends email). Free attendees get nothing. |

## 5. Fixes shipped this run

PR (branch `test/auth-checkout-e2e-v1`): **MISLABEL** - `app/events/[slug]/page.tsx` `cheapestPrice()` now treats an event as free only when *every* tier is $0 and otherwise advertises the lowest *paid* price. **AUTH-1** - `components/auth/login-form.tsx` honours a safe internal `?redirect=` after login (open-redirect-guarded). Both gate-green (tsc/lint/build/test). The structural launch blockers were deliberately NOT speculatively patched - see escalations.

## 6. Escalations to founder (required before launch)

1. **WEBHOOK-1 - build a ticket issuance + scan system.** This is a product subsystem (ticket entity, code/QR generation, RLS, account display, scan/validate flow, email/wallet delivery), not a bug fix, and touches Session-1 payment/webhook code + a schema migration (forbidden via MCP; requires `supabase db push --linked` + regenerates the [SHARED] `database.ts`). Must be owned/sequenced by the founder/PM. **This alone is a hard national-launch blocker.**
2. **FREE-CHECKOUT root cause** - needs a local repro with server logs to isolate (`register-free.ts` guest path / `create_reservation` anon RLS / guest-session cookie in server action). Money-adjacent reservation code - escalated rather than patched blind.
3. **WEBHOOK-2 / PAID-1 / FREE-1** - money-capture-vs-state-consistency hardening. Decisions touch payment integrity - founder/Session-1 sign-off.
4. **AUTH-2** - run one real password-reset email end-to-end (human or Playwright + mailbox) to confirm the recovery link establishes a session.

## 7. LAUNCH READINESS ASSESSMENT

**NOT READY for national launch.** Two independent critical blockers, both verified, neither safely fixable in an unattended run:

1. **No ticket issuance exists** - payments can be taken but no admittable/scannable ticket is ever produced (code + the product's own confirmation email confirm this).
2. **Guest free checkout is broken** - reproduced on production with no server-side effect and no user feedback.

Auth (signup/guard) is structurally sound; paid money-capture/fee logic is correct and DB-driven. But "demonstrably take real money via real user flows and deliver a ticket" is **not** currently true. The platform must not launch nationally until WEBHOOK-1 (ticketing) and the free-checkout failure are resolved and re-verified with a real browser + Stripe + mailbox pass.

## 8. Test-data cleanup

- Supabase `auth.users`: delete `d255b16f-e7bb-46b3-b690-a5e612321cc5` (`test-e2e-1747449600@eventlinqs.test`). No orders/reservations were created by this run (the free-checkout failure meant none persisted).
