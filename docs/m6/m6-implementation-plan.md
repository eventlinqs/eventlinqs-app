# M6 Stripe Connect: implementation plan

**Date:** 2026-04-28 (rev 1, Phase 0 refinements)
**Status:** Plan only. No code in this session. Phase 0 (this revision) is documentation-only; Phase 1 (schema + webhook scaffold) follows on Lawal's go.
**Companion doc:** `docs/m6/m6-current-state-audit.md`
**Test mode only:** every step below assumes Stripe **test mode**. Production cutover is a separate phase gated by Lawal's sign-off.
**Revision note:** revised 2026-04-28 to incorporate industry-practice research (Eventbrite, Humanitix, Ticketmaster) and to lock the tiered organiser payout model. The original v0 "daily payout default" policy is superseded by §1.4 below. Sections added in rev 1: §1.4 tiered payouts (replaces v0), §1.5 reserve and float architecture, §1.6 tier eligibility automation, §1.8 refund and chargeback policy, §1.10 geographic scope v1, §1.12 Australian Consumer Law, §1.13 organiser KYC enforcement; expanded §3 test plan; new §8 industry research citations.

---

## 1. Architectural decisions

Locked decisions are marked **LOCKED 2026-04-28**. Each decision carries its rationale plus the alternative considered.

### 1.1 Account type: Express (LOCKED 2026-04-28)

**Decision:** Stripe Express accounts.

| | Express | Standard | Custom |
|---|---|---|---|
| Onboarding UX | Stripe-hosted, ~5 min | Stripe-hosted, organiser sees full Stripe dashboard | Fully custom UI we build |
| KYC handling | Stripe handles end-to-end | Stripe handles end-to-end | Platform handles, must build screens |
| Branding | Light branding (logo + colours) | Stripe-branded | Full platform brand |
| Compliance burden | Low | Low | High (we own KYC, sanctions, ToS) |
| Disputes & chargebacks | Stripe-managed dashboard for organiser | Stripe-managed | Platform-managed |
| Payout schedule control | Platform sets default, organiser can override | Organiser controls | Platform controls fully |
| Self-serve fit | Strong (Lawal's stated requirement) | Strong | Weak (requires our build investment) |
| Time-to-launch | Fastest | Fast | Slowest |

**Why Express:** matches the "self-serve, no manual sales process, 5-minute signup" requirement. KYC is owned by Stripe (no Sumsub integration, no government-ID upload UI to build). AU ABN, US EIN, UK Companies House are all collected by Stripe's hosted flow per region. We control branding enough to feel native. Standard makes the organiser leave our brand for Stripe-branded dashboards. Custom is months of work for a v1 we don't need.

**Alternative if rejected:** Standard. Same Connect onboarding API, less branding control. Custom is off the table for v1.

### 1.2 Charge type: Destination charges (LOCKED 2026-04-28)

**Decision:** Destination charges with `application_fee_amount`, `transfer_data.destination`, and `on_behalf_of`.

| | Destination charges | Separate charges + transfers | Direct charges |
|---|---|---|---|
| Money flow | Buyer to platform to organiser (atomic) | Buyer to platform, then explicit transfer | Buyer to organiser, platform receives application fee |
| Statement of merchant | Platform (or `on_behalf_of` for organiser) | Platform | Organiser |
| Refund handling | Single flow, platform fee returned/retained per param | Two-step (refund charge, reverse transfer) | Organiser owes platform fee back |
| Webhook complexity | Lower | Higher (transfer.* events to track) | Lowest |
| Use in resale / split | Hard | Natural | Hard |
| Cross-currency conversion | Stripe auto-converts at payout | Manual | Stripe auto-converts |
| AU-friendly | Yes | Yes | Yes |

**Why destination:** atomic flow, single PaymentIntent, fee retention via `application_fee_amount` parameter, refund logic is single-path. Separate-charges is more flexible (resale market and squad payments may need it later) but introduces transfer tracking we don't need on day one. Direct charges flips the merchant-of-record to organiser, which complicates the platform's chargeback dashboard ambition.

**`on_behalf_of`:** set to the organiser's connected account so the organiser appears as merchant on the buyer's statement. Reduces "Why did EventLinqs charge me?" support tickets and shifts dispute liability onto the connected account (Stripe-recommended for marketplaces).

**Alternative if rejected:** separate charges + transfers. Adds a `transfers` table, `transfer.created` and `transfer.failed` webhooks, and a post-charge reconciliation step. Roughly 3 to 4 days additional engineering.

### 1.3 Platform fee read-path

**Decision:** at PaymentIntent creation, `application_fee_amount` is computed by `PaymentCalculator` (already reads `pricing_rules`). The same integer that goes into `orders.platform_fee_cents` is what we hand to Stripe. Single source of truth, no drift.

**Implication:** `application_fee_amount` includes the percentage + fixed-per-ticket components already encoded in `pricing_rules`. The Stripe API takes a single integer in cents.

### 1.4 Payout schedule: tiered model (LOCKED 2026-04-28, supersedes v0 daily default)

**Decision:** organisers progress through three tiers. Each tier defines payout cadence, reserve percentage, instant-payout cap, and fee treatment.

| Tier | Eligibility | Payout cadence | Reserve | Instant cap | Fees | Pre-event access |
|---|---|---|---|---|---|---|
| **Tier 1 (Standard)** | Default for every newly onboarded organiser | 3 business days post-event | 20% of gross | $0 (no instant) | Standard platform fee | None |
| **Tier 2 (Verified)** | After 1 successful event with no chargebacks and no negative-balance episodes | Scheduled (3 business days post-event) + on-demand pre-event payouts | 20% of gross | $50,000 AUD per event | Standard platform fee + 1.5% on instant | Yes (capped) |
| **Tier 3 (Trusted)** | 5+ events, $50,000+ lifetime gross, no disputes, M7 admin approval required | Scheduled + on-demand + faster cadence | 10% of gross | $250,000 AUD per event | Reduced platform fee (admin-set per-organiser) | Yes (capped higher) |

**Tier progression rules (locked):**

- **Tier 1 to Tier 2:** automatic on first event completing settlement with zero chargebacks and zero negative-balance episodes. Settlement window is 14 days post-event end (covers the bulk of the chargeback claim window for AU domestic transactions).
- **Tier 2 to Tier 3:** requires M7 admin manual approval. Auto-eligible status is computed by the system and surfaced in the admin queue, but the promotion is not automatic. Admin reviews lifetime volume, dispute history, payout history, and organiser conduct.
- **Tier demotion:** any chargeback rate over 1% in any 90-day window, or any negative-balance episode lasting more than 7 days, demotes the organiser one tier. Demoted organisers re-earn promotion under the same rules.

**Why tiered (industry research, see §8 for citations):**

- Eventbrite uses scheduled post-event payouts (default 3 business days post-event) with reserve holds for new accounts.
- Humanitix holds funds for 5 business days post-event for new organisers.
- Ticketmaster holds funds 7 days post-event.
- A flat "daily" default would expose the platform to refund-and-chargeback risk where an organiser pulls funds before their event runs and then the event is cancelled or fraudulent. The tiered model is industry-standard ticketing practice and protects the platform float.

**Why post-event-only at Tier 1:** prevents pre-event withdrawal of buyer funds. If an event is cancelled the day before doors, refund liability is recoverable from the organiser's still-held balance. At Tier 1, no organiser can drain ticket revenue before delivery.

**Implication for schema:** `organisations.payout_tier` (`tier_1|tier_2|tier_3`, default `tier_1`), `organisations.payout_schedule` (`post_event_only|scheduled_plus_on_demand`, default `post_event_only`), `organisations.total_event_count` (int, default 0), `organisations.total_volume_cents` (bigint, default 0). New table `tier_progression_log` records every tier change with reason and timestamp.

### 1.5 Reserve and float architecture (NEW rev 1)

**Decision:** every paid event accrues a per-event reserve held by the platform. The reserve releases with the final payout 3 business days after the event end.

**Reserve percentages (locked):**

- Tier 1: 20% of gross ticket revenue per event.
- Tier 2: 20% of gross ticket revenue per event.
- Tier 3: 10% of gross ticket revenue per event.

**Calculation:** at the moment of each successful PaymentIntent, the platform writes a positive ledger entry for the order (net of platform fee) and a corresponding negative ledger entry equal to `floor(gross_cents * reserve_percentage)` tagged `reserve_hold` and pinned to the originating `event_id`. The reserve ledger entry's counterpart positive entry (`reserve_release`) is written 3 business days after the event end, when the reserve hold is released.

**Released reserve is paid out on the next scheduled payout** (which for Tier 1 is the post-event payout itself). No separate "reserve payout" exists; the reserve simply unblocks the corresponding portion of the payout calculation.

**Held reserve is the platform's defence against:**

- Late refund claims by buyers (typical chargeback claim window: 60 to 120 days for AU consumer card transactions, but most claims arrive within 14 days post-event).
- Cancelled events.
- Fraudulent events that pass initial KYC but fail on delivery.

**Implication for schema:** `organisations.hold_amount_cents` (bigint, default 0) is the running total of unreleased reserve across all the organiser's events. Table `payout_holds` carries `event_id`, `hold_type` (`reserve|chargeback|admin_manual|negative_balance|new_organiser`), `amount_cents`, `release_at`, `released_at`.

**Float math:** if the platform processes $10M gross monthly across Tier 1+2 organisers (20% reserve, average 14-day hold), the platform float requirement is approximately $9.2M (20% of monthly gross spread over 14 days). This is held in the platform's Stripe balance; Stripe holds it in a regulated custodial structure. The platform does not lend or invest the float.

### 1.6 Tier eligibility automation (NEW rev 1)

**Decision:** the system computes Tier 1 to Tier 2 promotion automatically. Tier 2 to Tier 3 surfaces an admin-approval queue.

**Auto-eligibility for Tier 2 (computed nightly):**

- `total_event_count >= 1` (at least one settled event)
- For all settled events: `chargeback_rate = 0`, `negative_balance_episodes = 0`, `refund_rate <= 5%` (refund rate by ticket count).
- No `admin_manual_hold` flag set on the organiser.

**Auto-eligibility for Tier 3 (queued for admin review):**

- `total_event_count >= 5`
- `total_volume_cents >= 5000000` (i.e. $50,000.00 AUD)
- For all settled events: `chargeback_rate = 0`, no disputes filed.
- Organiser has been on Tier 2 for at least 90 days.

**Tier 3 admin review (M7 dependency):** the M7 admin panel surfaces a Tier 3 candidate queue. Admin sees lifetime stats, dispute timeline, payout history, organiser-team identity verification status, and a "promote" / "decline" / "snooze 30 days" action. M6 ships only the eligibility computation and the automatic Tier 1 to Tier 2 transition. M7 adds the admin queue UI.

**Demotion automation:** runs on every chargeback webhook and on every nightly negative-balance check. Demoted organisers receive an email plus in-product notification; M7 admin can override.

**Implementation note:** the nightly job runs as a Supabase Edge Function (or a scheduled Vercel cron in v1) reading from `organiser_balance_ledger`, `payouts`, and dispute history. Output is an INSERT into `tier_progression_log` and an UPDATE on `organisations.payout_tier`. All transitions are logged.

### 1.7 Refund cost-allocation

**Decision (revised):** refund priority order from Scope §3.7.3, with tier-aware behaviour.

1. **Organiser balance (deduct from next payout)**, primary path. Works when organiser balance >= refund amount.
2. **Reserve hold draw**, if step 1 insufficient. Draw from `payout_holds` rows of `hold_type = 'reserve'`. Tier 1 and Tier 2 organisers' 20% reserve covers most refund scenarios.
3. **Gateway partial reversal**, if steps 1 and 2 still insufficient. Stripe pulls from the connected account's available balance. May require organiser bank-account debit if Stripe balance is depleted.
4. **Platform float (last resort)**, with negative ledger entry on the organiser. Organiser is moved to `payout_status = 'on_hold'` until balance recovers. Sentry alert plus admin email.

**Implication:** the existing `organiser_balance_ledger` table is expanded with reason codes `reserve_hold`, `reserve_release`, `refund_from_balance`, `refund_from_reserve`, `refund_from_gateway`, `refund_platform_float`, and a state machine in code that selects the source.

### 1.8 Refund and chargeback policy (NEW rev 1)

**Refund window (locked):** organisers may set a custom refund window per event, but the platform enforces a maximum of **7 days pre-event** for buyer-initiated refunds. After the 7-day cutoff, all refund requests must go through the organiser manually (organiser-initiated refund only). This protects organisers against last-minute mass cancellation gaming.

**Refund flow (pre-event, within window):**

- Buyer initiates from `/orders/[id]`.
- Platform calls `stripe.refunds.create` with `refund_application_fee: true` (full refund) or partial-refund logic.
- Ledger entries written per §1.7.
- Buyer receives Stripe-confirmation email automatically.

**Refund flow (post-event):**

- Organiser initiates from organiser dashboard (M6 Phase 4 surfaces this).
- Same Stripe API path, but logged with `refund_initiated_by = 'organiser'`.
- Buyer cannot self-serve post-event refunds.

**Chargeback policy (locked):**

- Stripe `charge.dispute.created` webhook freezes the disputed amount in `payout_holds` (`hold_type = 'chargeback'`).
- Platform compiles evidence pack: order ID, ticket scan history, buyer IP at purchase, buyer email confirmation timestamps, organiser refund-policy displayed at purchase, ACL terms accepted at checkout.
- Evidence pack auto-submitted via `stripe.disputes.update`.
- **Chargeback fee allocation:** Stripe charges the platform $25 AUD per dispute. Allocation is **50/50 between platform and organiser**. Organiser's 50% is debited from their balance; platform absorbs its 50%. This aligns incentives: organisers care about fraud prevention because they share the cost.
- Disputes won: chargeback hold released, fees retained per 50/50.
- Disputes lost: refund flow runs, fees retained per 50/50, chargeback counts against tier eligibility (see §1.6).

**Evidence pack contents (locked):**

- `order_id`, `event_id`, `event_name`, `event_date`, `event_venue`
- `buyer_email`, `buyer_phone` (if collected), `purchase_ip`, `purchase_user_agent`
- `payment_intent_id`, `card_last4`, `cvc_check`, `address_check` (from Stripe)
- Ticket scan history if any (timestamp, scanner identity, gate)
- ACL terms accepted at checkout (URL of Terms snapshot, version hash, acceptance timestamp)
- Refund-policy displayed at purchase (snapshot of policy text the buyer saw)
- Email confirmation timestamps (purchase confirmation, ticket delivery, reminder)
- Organiser response to dispute notification (if requested via M7 admin)

### 1.9 Multi-currency settlement

**Decision:** organiser's connected account is created with a primary currency matching their country of operation (default AUD for AU organisers, override at onboarding). Stripe handles FX automatically at payout. Cross-currency platform-fee math stays in the buyer's currency on `orders.platform_fee_cents`; the same integer goes to Stripe; Stripe converts at payout.

**Out of scope for v1:** EUR pricing rules in `pricing_rules` seed (must be added before EU launch). Flagged for Module 11 prep.

### 1.10 Geographic scope v1 (LOCKED 2026-04-28)

**Decision:** Stripe Connect M6 ships for **AU, UK, US, and EU only**. African organisers are waitlisted to Module 11 (Paystack/Flutterwave Connect equivalents).

**Why:**

- Stripe Connect Express does not support NG, KE, GH, or ZA as connected-account countries.
- Building a parallel African organiser path on Paystack/Flutterwave Connect duplicates the Connect surface (account creation, onboarding, webhooks, payouts, refunds) and is the right scope for M11.
- v1 launch scope is "real organisers, real money, real refunds, real legal exposure". Concentrating that scope on the four Stripe Connect Express jurisdictions reduces compliance surface for first-month launch.

**African organiser handling at v1:**

- Organiser-create form rejects countries outside [AU, UK, US, EU member states] with a friendly "Your region is on the waitlist; we are launching support for [country] in Module 11. Join the waitlist to be notified."
- Existing African organisers in seed data: none. Production database is empty for organisers (confirmed via audit).

### 1.11 Tax handling and compliance handoff

**Decision matrix per jurisdiction:**

| Jurisdiction | Buyer-side tax | Platform-fee tax | Organiser-side tax reporting | Platform responsibility |
|---|---|---|---|---|
| AU | GST 10% on ticket price (organiser charges, organiser remits if ABN-registered) | GST 10% on platform fee, **mandatory** (we charge GST on our fee, we remit to ATO) | Organiser remits ticket-revenue GST via BAS if ABN-registered | Platform issues tax invoice for fee, files own GST return, files **TPAR (Taxable Payments Annual Report)** with ATO listing payments to organisers above threshold |
| UK | VAT 20% (organiser charges, organiser remits if VAT-registered) | VAT 20% on platform fee for UK organisers | Organiser remits via HMRC Making Tax Digital | Platform issues VAT invoice for fee |
| US | Sales tax (organiser-side, varies by state, organiser charges and remits) | None on platform fee (B2B services, organiser invoice) | Organiser receives **1099-K from Stripe** for organisers exceeding IRS threshold ($600 federal as of 2024) | Stripe files 1099-K. Platform exposes year-end summary download in payout dashboard |
| EU | VAT (organiser charges, organiser remits per home-country VAT) | VAT on platform fee per buyer's country (reverse-charge B2B may apply) | Organiser remits via home-country VAT MOSS / OSS | Platform issues VAT invoice for fee |

**AU-specific platform obligations (locked):**

1. **GST on platform fee, mandatory.** EventLinqs (the AU-registered platform entity) charges GST on its platform fee. Organisers receive a tax invoice with GST line. Implementation: pricing rules in v1 already store `platform_fee_percent` net of GST; the GST amount is computed on top and stored in `orders.platform_fee_gst_cents` (new column required, see Phase 1 schema additions).
2. **TPAR (Taxable Payments Annual Report) filing, mandatory.** As a platform paying organisers, EventLinqs Pty Ltd must file TPAR annually with the ATO listing payments to AU organisers above the threshold ($75,000 ABN-registered, lower for unregistered). Platform must collect ABN at onboarding (Stripe Express does this) and surface a TPAR-export CSV in admin dashboard. Out of M6 scope; flag for M7 admin tools.
3. **BAS (Business Activity Statement) own filing.** EventLinqs files quarterly BAS for its own GST liability. This is operator-side, not in code. Out of scope.
4. **Tax invoice generation:** every organiser payout generates a downloadable tax invoice (PDF) in the payout dashboard. Phase 4 deliverable.

**Stripe-handled compliance (locked):**

- 1099-K (US) filed by Stripe for connected accounts above platform threshold.
- KYC, sanctions screening, AML: Stripe Express handles via hosted onboarding. Platform receives `account.updated` webhooks indicating capabilities cleared.
- ToS: organiser sees and accepts Stripe's Connect platform agreement during Express hosted onboarding. We do not need a custom ToS modal for the Stripe portion.

**Platform-side ToS update required (Phase 6):** `src/app/legal/organiser-terms/page.tsx` must reference the Stripe Connect agreement, the 50/50 chargeback fee split, the 20% / 10% reserve policy, the tiered payout model, the 7-day refund window, and the GST-on-platform-fee disclosure. Out-of-band copy update before live cutover.

### 1.12 Australian Consumer Law compliance (NEW rev 1)

**Decision:** every paid checkout displays the organiser's refund policy and ACL-compliant terms. Buyer acceptance is timestamped and stored.

**ACL requirements (sourced from ACCC):**

- **Major failure rights:** if the event is materially different from advertised, cancelled, or unfit for purpose, buyer is entitled to a refund. Cannot be contracted out via terms. Platform terms must not claim "no refunds under any circumstances".
- **Cooling-off period:** AU does not require cooling-off for ticketed events specifically. Refund window is set per organiser within platform-enforced bounds (max 7 days pre-event for self-serve, see §1.8).
- **Ticket-resale display:** if a ticket is being resold (M11 scope), the resale price plus face value plus total to buyer must be disclosed. Out of M6 scope.
- **Misleading conduct:** ticket descriptions, event imagery, and pricing displays must match what is delivered.

**Implementation (Phase 5):**

- Organiser's refund policy text is captured at event creation, displayed at checkout under "Refund policy", and snapshot-stored on the `orders` row at purchase time so the buyer's exact-displayed-policy is preserved for chargeback evidence.
- Buyer ticks "I agree to the EventLinqs Terms and the organiser's refund policy" before payment. Timestamp, terms version hash, and refund-policy snapshot are recorded on the order.
- No "ALL SALES FINAL" or similar absolutist refund language is allowed. Platform-side validation rejects organiser refund-policy text that contains specific banned phrases. Operator policy plus simple keyword screen.

### 1.13 Organiser KYC enforcement (NEW rev 1)

**Decision:** paid events require completed KYC; free events do not.

**Enforcement layers:**

1. **Database trigger (Phase 3):** before transitioning `events.status` to `published`, if any tier in `ticket_tiers` has `price_cents > 0`, require `organisations.stripe_charges_enabled = TRUE`. Trigger raises an exception and the UI catches and surfaces the error.
2. **UI gate:** on the event publish screen, paid events with non-onboarded organiser show "Connect Stripe before publishing paid events" with a deep-link to onboarding.
3. **API gate:** the `events.publish` server action repeats the same check defensively.
4. **Free-event bypass:** events where every tier is `price_cents = 0` skip Stripe entirely. No Connect onboarding required to publish a free event. The organisation row's `stripe_account_id` may be NULL.

**Restricted-state handling:** if Stripe later restricts a connected account (`account.updated` webhook with `disabled_reason` set), the platform:

- Marks `organisations.stripe_charges_enabled = FALSE`.
- Sets `organisations.stripe_requirements = <Stripe's requirements payload>`.
- Sends email plus in-product notification to organiser with deep-link to Stripe Express dashboard "Resubmit information".
- Pauses publishing of new paid events until requirements clear.
- Existing published events continue to sell tickets (Stripe still accepts charges in restricted state, just stops payouts).

**Free-vs-paid migration risk:** if an organiser switches a free event to paid without completed KYC, the publish-gate trigger blocks it. UI surfaces the same "Connect Stripe" CTA.

---

## 2. Phased delivery

Six phases. Each is independently committable, individually testable in Stripe test mode, and reversible if needed. Phase 1 lays the schema; Phase 6 is production cutover.

### Phase 1: Schema and webhook plumbing (1.5 days)

**Goal:** unblock everything else. No user-visible behaviour change.

- Add migration `20260429000001_m6_connect_schema.sql`:
  - **Extend `organisations`** (locked column list, rev 1):
    - `stripe_account_country TEXT` (e.g. `AU`, `GB`, `US`, EU country codes)
    - `stripe_charges_enabled BOOLEAN DEFAULT FALSE`
    - `stripe_payouts_enabled BOOLEAN DEFAULT FALSE`
    - `stripe_capabilities JSONB DEFAULT '{}'`
    - `stripe_requirements JSONB DEFAULT '{}'`
    - `payout_tier TEXT DEFAULT 'tier_1' CHECK (payout_tier IN ('tier_1','tier_2','tier_3'))`
    - `payout_schedule TEXT DEFAULT 'post_event_only' CHECK (payout_schedule IN ('post_event_only','scheduled_plus_on_demand'))`
    - `payout_destination TEXT` (Stripe external_account ID once linked)
    - `refund_window_days INTEGER DEFAULT 7 CHECK (refund_window_days >= 0 AND refund_window_days <= 7)`
    - `risk_tier TEXT DEFAULT 'standard' CHECK (risk_tier IN ('standard','elevated','high'))`
    - `hold_amount_cents BIGINT DEFAULT 0 CHECK (hold_amount_cents >= 0)`
    - `total_event_count INTEGER DEFAULT 0 CHECK (total_event_count >= 0)`
    - `total_volume_cents BIGINT DEFAULT 0 CHECK (total_volume_cents >= 0)`
    - `payout_status TEXT DEFAULT 'active' CHECK (payout_status IN ('active','on_hold','restricted'))`
  - **New table `payouts`:** `id`, `organisation_id`, `stripe_payout_id`, `amount_cents`, `currency`, `arrival_date`, `status` (`pending|in_transit|paid|failed|canceled`), `failure_reason TEXT`, `created_at`, `updated_at`. RLS: organiser owners can SELECT their own org's rows.
  - **New table `payout_holds`:** `id`, `organisation_id`, `event_id` (nullable), `hold_type` (`reserve|chargeback|admin_manual|negative_balance|new_organiser`), `amount_cents`, `currency`, `release_at`, `released_at` (nullable), `reason_text`, `created_at`. RLS: organiser owners can SELECT their own org's rows.
  - **New table `organiser_balance_ledger`:** `id`, `organisation_id`, `delta_cents` (signed), `currency`, `reason` (`order_confirmed|refund_from_balance|refund_from_reserve|refund_from_gateway|refund_platform_float|chargeback|payout|reserve_hold|reserve_release|adjustment`), `reference_type` (`order|payout|hold|adjustment`), `reference_id` UUID, `created_at`. RLS: organiser owners read-only.
  - **New table `tier_progression_log`:** `id`, `organisation_id`, `from_tier`, `to_tier`, `reason` (`auto_promotion|admin_promotion|chargeback_demotion|negative_balance_demotion|admin_demotion`), `triggered_by` (UUID, nullable for system), `metadata JSONB`, `created_at`. Append-only. RLS: organiser owners read-only on own rows; admin role read-all.
- Update TypeScript types in `src/types/database.ts` to mirror new columns and tables.
- Extend `src/app/api/webhooks/stripe/route.ts` to handle `account.updated`, `account.application.deauthorized`, `payout.created`, `payout.paid`, `payout.failed`, `payout.canceled`, `transfer.created`, `charge.dispute.created`, `charge.dispute.closed`. Stub handlers that log and write minimum-viable rows. No business logic yet (real logic ships in Phases 2 to 5).
- Register new webhook events in Stripe test-mode dashboard.

**Definition of done:** Supabase migration runs clean against the Sydney production schema, types compile, lint clean, build green, webhook handler returns 200 for stub events, no user-visible change.

### Phase 2: Express onboarding flow (2 days)

**Goal:** organiser can click "Connect Stripe" and complete Stripe Express onboarding. Tier 1 status assigned automatically.

- New service: `src/lib/services/stripe-connect.ts`. Exports `createConnectedAccount(orgId, country)`, `createOnboardingLink(orgId, returnUrl, refreshUrl)`, `retrieveAccount(stripeAccountId)`, `createDashboardLink(stripeAccountId)`.
- New server action: `src/app/actions/connect-onboarding.ts`. Functions: `startOnboarding(orgId)`, `refreshOnboarding(orgId)`. Both gated by `org.owner_id === auth.uid()`.
- New routes:
  - `/dashboard/organisation/payouts/connect`: initiates onboarding, redirects to Stripe-hosted Express flow.
  - `/dashboard/organisation/payouts/return`: return URL after Stripe flow. Re-fetches account, updates `stripe_charges_enabled` etc, redirects to `/dashboard/payouts`.
  - `/dashboard/organisation/payouts/refresh`: refresh URL when Stripe link expires. Generates a new link and redirects.
- Wire `account.updated` webhook (from Phase 1) to set `stripe_onboarding_complete = (charges_enabled AND payouts_enabled AND details_submitted)` and to populate `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_capabilities`, `stripe_requirements` from the Stripe payload.
- Update `get-started-checklist.tsx` step 3 CTA to point at `/dashboard/organisation/payouts/connect`.
- Update `dashboard/organisation/page.tsx`: add a "Connect Stripe" button when `!stripe_onboarding_complete`, and a "Manage payouts" button when complete (calls `createDashboardLink`).
- Country gate: onboarding form refuses countries outside [AU, GB, US, EU member states] (per §1.10).

**Definition of done:** in test mode, an organiser can complete Stripe Express onboarding end-to-end, the org row updates, the checklist step ticks. Tested with at least one AU and one non-AU test organiser. Restricted-state handling tested by triggering a Stripe test-account requirements update.

### Phase 3: Destination-charge wiring (1.5 days)

**Goal:** every PaymentIntent created for an organiser with a connected account routes funds via destination charge. Reserve calculation runs at success time.

- Extend `CreatePaymentIntentParams` in `src/lib/payments/gateway.ts` with optional `connected_account_id?: string`, `application_fee_cents?: number`, `on_behalf_of?: string`.
- Update `StripeAdapter.createPaymentIntent` to set `transfer_data.destination`, `application_fee_amount`, and `on_behalf_of` when `connected_account_id` is supplied.
- Update `src/app/actions/checkout.ts:355` and `:603` to look up `org.stripe_account_id` plus `org.stripe_onboarding_complete` and pass through. Also `src/app/actions/squad-checkout.ts:205`.
- **Hard guard (KYC enforcement, see §1.13):** if event's organiser is not `stripe_onboarding_complete = true` AND event is paid (any tier > 0 cents), refuse to create the PaymentIntent and return a friendly error pointing the organiser at onboarding. Free events bypass.
- **Hard guard:** before allowing `events.status` transition to `published` for paid events, require `org.stripe_onboarding_complete = true`. Migration adds a database trigger; UI surface displays a "Connect payouts before publishing" warning.
- Update webhook `payment_intent.succeeded` handler to:
  - Write a `+order_total` row to `organiser_balance_ledger` (`reason = 'order_confirmed'`).
  - Write a row to `payout_holds` with `hold_type = 'reserve'`, `amount_cents = floor(gross * reserve_pct(tier))`, `release_at = event_end + 3 business days`.
  - Update `organisations.hold_amount_cents` (running total).
  - Increment `organisations.total_volume_cents` (settled basis, not gross-on-create).
- Update `charge.refunded` handler to write a refund ledger row, source-allocated per §1.7.

**Definition of done:** test-mode end-to-end ticket purchase against an organiser with a connected account routes the application fee to the platform Stripe account, the residual to the connected account, the reserve to `payout_holds`. Refund returns funds and reverses ledger correctly across all four refund-source paths.

### Phase 4: Payout dashboard (2 days)

**Goal:** replace the placeholder at `/dashboard/payouts` with a real dashboard. Tier-aware visibility.

- New page: `src/app/(dashboard)/dashboard/payouts/page.tsx` (rewrite, delete placeholder).
- KPI row: available balance (from Stripe `balance.retrieve` on connected account), pending balance (orders confirmed but not yet in Stripe transit), held in reserve (sum of unreleased `payout_holds`), in-transit (Stripe payouts not yet paid), paid out total (lifetime).
- Tier badge: organiser's current tier prominently displayed with progress to next tier (e.g. "Tier 1, 0/1 events to Tier 2").
- Transactions panel: paginated `payouts` table rows with arrival date, amount, status badge, link to Stripe receipt.
- Upcoming payouts panel: derived from Stripe balance + payout schedule + reserve releases.
- Held funds panel: rows from `payout_holds` with release date and `hold_type`.
- Tax summary panel: Stripe Reporting download links + year-to-date gross + downloadable tax invoices for platform fees (PDF).
- "Instant payout" button: only visible when `payout_tier IN ('tier_2','tier_3')` AND Stripe `instant_available > 0`. Calls a server action that triggers `stripe.payouts.create` with `method: 'instant'` and writes the 1.5% fee to `organiser_balance_ledger`.
- "Update bank details" button: calls `createDashboardLink` to send organiser into Stripe Express dashboard for that account.
- All numbers formatted via the same currency formatter used elsewhere.
- Empty state: when no payouts yet, friendly "Your first payout will appear 3 business days after your first event ends" copy.

**Definition of done:** dashboard renders against a real test-mode connected account with at least one test payout, one held reserve, and one held chargeback. Mobile layout passes Lighthouse (preserve current 0.80 perf floor).

### Phase 5: Refund + chargeback flows (2 days)

**Goal:** refunds and chargebacks correctly allocate fees and ledger across all four refund sources.

- Refund server action (audit existing or create): use `stripe.refunds.create` with `refund_application_fee: true` for full refunds and `false` for partial keep-fee scenarios.
- Implement four-source refund algorithm per §1.7. Unit tests cover each path.
- Wire `charge.dispute.created` webhook to: (a) freeze affected funds via `payout_holds` (`hold_type = 'chargeback'`), (b) compile evidence pack per §1.8 contents, (c) auto-submit via `stripe.disputes.update`.
- Wire `charge.dispute.closed` webhook to: release hold if won, run refund flow if lost, write 50/50 chargeback fee allocation to `organiser_balance_ledger` either way.
- Extend `dashboard/payouts/page.tsx` to surface a disputes panel.
- Negative-balance state machine: when `organiser_balance_ledger` running sum < 0, set `organisations.payout_status = 'on_hold'`, send email plus Sentry alert, withhold all future payouts until cleared. Tier demotion check (§1.6) runs on next nightly job.
- ACL compliance (§1.12): refund-policy snapshot capture at checkout. Buyer terms-acceptance timestamp stored on `orders`. Banned-phrase keyword screen on organiser's refund-policy text.
- Refund window enforcement (§1.8): server action rejects buyer-initiated refund requests within 7 days of event start.

**Definition of done:** test-mode refund of a confirmed order returns funds, reverses the application fee (full refund) or retains (partial), and writes correct ledger rows across all four refund-source paths. Test-mode dispute submission lands the evidence pack on Stripe. Test-mode dispute won and lost both flow correctly. Negative-balance scenario tested. ACL banned-phrase screen rejects "ALL SALES FINAL" and similar.

### Phase 6: Production cutover (0.5 day, plus monitoring window)

**Goal:** flip from test mode to live mode with confidence.

- Stripe live-mode platform account verified by Lawal (Stripe AU verification can take a few business days; kick off early).
- Live-mode publishable + secret keys added to Vercel Production env (Preview / Development stay on test mode).
- Live-mode webhook endpoint registered (separate from test-mode endpoint) with both platform plus Connect events subscribed.
- Live-mode webhook signing secret in Vercel Production env.
- Update `src/app/legal/organiser-terms/page.tsx` per §1.11 (Stripe Connect agreement reference, 50/50 chargeback split, reserve policy, tiered payouts, 7-day refund window, GST disclosure).
- Smoke test: Lawal creates a real organiser, completes live onboarding, lists a $1 ticket, makes a real purchase with own card, refunds, confirms ledger and payout.
- Monitor for 48 hours: Sentry quiet, Stripe Dashboard shows expected charges + transfers + payouts.
- Document rollback plan: feature-flag `connectEnabled` env var so we can fall back to platform-only PaymentIntents in 60 seconds if the connected-account path breaks.

**Definition of done:** real money flows from a real buyer to a real organiser net of platform fee. No Sentry errors. Lawal signs off.

---

## 3. Test plan (expanded rev 1)

Per phase, all tests run against Stripe **test mode** unless explicitly Phase 6.

### 3.1 Stripe test cards (locked reference)

- `4242 4242 4242 4242`: success.
- `4000 0000 0000 0002`: card declined (generic).
- `4000 0000 0000 9995`: insufficient funds.
- `4000 0000 0000 0259`: charge succeeds, dispute filed automatically (chargeback test path).
- `4000 0000 0000 1976`: charge succeeds, customer disputes via "fraudulent" reason (highest-severity dispute test).
- `4000 0027 6000 3184`: 3DS authentication required (SCA path).
- Stripe test connected account: any Express test account from Stripe dashboard.

### 3.2 Phase-by-phase test scenarios

| Phase | Test scenarios |
|---|---|
| 1 | Migration up + down clean against Sydney schema. Webhook handler returns 200 for each stub event (account.updated, payout.*, transfer.created, charge.dispute.*). Type compile clean. Lint clean. Build green. |
| 2 | AU organiser onboarding end-to-end. UK organiser onboarding. US organiser onboarding. EU organiser (e.g. NL) onboarding. NG organiser blocked at country-gate with friendly waitlist message. Refresh URL flow when Stripe link expires. Re-onboarding an org that already has `stripe_account_id` (idempotent). Restricted-state recovery (force a Stripe requirement-due event, verify UI surfaces resubmit prompt). |
| 3 | Paid event with onboarded organiser routes destination charge successfully, ledger correct, reserve hold written. Paid event with non-onboarded organiser blocked with friendly error. Free event with non-onboarded organiser succeeds (zero-Stripe path). Squad checkout against connected account. Reserve calculation matches `floor(gross * 0.20)` for Tier 1. Tier 1 to Tier 2 auto-promotion fires after first event settlement (simulated 14-day fast-forward). |
| 4 | Dashboard renders with no payouts (empty state). With one paid payout. With one in-transit. With one held reserve. With one held chargeback. Tier badge shows correct progress. Instant payout button hidden for Tier 1, visible for Tier 2 with `instant_available > 0`. Tax invoice download generates valid PDF. Mobile Lighthouse perf >= 0.80. |
| 5 | Full refund path 1 (deduct from balance): organiser balance >= refund amount, ledger correct. Full refund path 2 (reserve draw): balance < refund, reserve covers, ledger correct. Full refund path 3 (gateway reversal): balance + reserve < refund, gateway reversal succeeds. Full refund path 4 (platform float): all sources insufficient, platform float negative ledger written, Sentry alert fires. Partial refund: application fee retained. Disputed charge (`4000 0000 0000 0259`): evidence pack auto-submitted. Dispute won: 50/50 fee split written, hold released. Dispute lost: refund flow runs, fee split written. Tier demotion fires on chargeback. ACL banned-phrase: organiser refund-policy text containing "all sales final" rejected. Refund window enforcement: buyer-initiated refund request 6 days pre-event accepted, 6-days-and-23-hours pre-event rejected at boundary. Negative balance: future payouts withheld, organiser email sent. |
| 6 | Live-mode smoke test, single $1 ticket, full lifecycle: organiser onboarding, ticket sale, refund, payout. |

### 3.3 Webhook retry test

- Manually disable webhook endpoint, fire a test PaymentIntent, re-enable endpoint after Stripe's first delivery attempt has failed.
- Verify Stripe retries (default schedule: immediate, then 1 hour, 6 hours, 12 hours, 24 hours, 48 hours, 72 hours).
- Verify idempotency: re-delivery of the same event (same `event.id`) does not double-write to `organiser_balance_ledger`. Use Stripe `event.id` as the natural dedupe key in the webhook handler.

### 3.4 Tier progression simulation

- Test fixture: organiser with `total_event_count = 0`, `payout_tier = 'tier_1'`.
- Insert mock settled event row, run nightly tier-progression job, assert `payout_tier = 'tier_2'`, `tier_progression_log` row written with `reason = 'auto_promotion'`.
- Insert mock chargeback row in the same window, run job, assert `payout_tier = 'tier_1'` (demotion), demotion log row written.

### 3.5 Reserve calculation verification

- Buyer purchases $100 AUD ticket from Tier 1 organiser.
- Assert: `orders.platform_fee_cents` matches PaymentCalculator output, `payout_holds.amount_cents = 2000` (20% of 10000 cents), `organisations.hold_amount_cents` increments by 2000.
- Run reserve-release job with `release_at` in the past, assert hold is marked released and ledger has matching `+reserve_release` entry.

### 3.6 Load test

- 100 simultaneous PaymentIntent creates across 10 organisers (10 concurrent buyers per organiser).
- Assert: zero double-bookings (Inventory Service advisory locks hold), zero ledger drift, 100% webhook delivery, p95 PaymentIntent creation latency under 2s.
- Tooling: k6 or Artillery, run against local Supabase plus Stripe test mode.

---

## 4. Effort estimate

| Phase | Effort | Cumulative |
|---|---|---|
| 1: Schema + webhook plumbing | 1.5 d | 1.5 d |
| 2: Express onboarding | 2 d | 3.5 d |
| 3: Destination-charge wiring | 1.5 d | 5 d |
| 4: Payout dashboard | 2 d | 7 d |
| 5: Refund + chargeback | 2 d | 9 d |
| 6: Production cutover | 0.5 d + 48h monitor | 9.5 d |

**Total:** approximately 9.5 working days for full M6. Floor estimate; assumes no surprises in Stripe Express onboarding for non-AU jurisdictions and no scope creep.

**Critical-path acceleration option:** Phases 1 to 3 alone (~5 days) deliver an organiser-self-serve Connect path with destination charges and reserve holds. Phase 4 dashboard could ship as a "view in Stripe" link to the Stripe Express dashboard for v1, deferring the in-platform dashboard to a later sprint. This trims to ~5.5 days but breaks the "modern dashboard, clear payout visibility" promise. Recommend full plan unless launch date forces the cut.

---

## 5. Decisions locked (rev 1)

The following were the open questions in v0. All resolved 2026-04-28.

1. **§1.4 first-event hold policy.** **Resolved:** all new organisers start at Tier 1 (post-event-only payouts, 20% reserve, 3-business-day post-event cadence). Tier 1 to Tier 2 auto-promotion after first clean event. No first-event-specific exception; Tier 1 is the floor.
2. **§1.2 Charge type override.** **Resolved:** destination charges. Resale and split-payment scenarios at M11 may add a separate-charges path additively without breaking the Connect path.
3. **§1.10 Geographic scope at v1.** **Resolved:** AU + UK + US + EU only. African organisers waitlisted to M11 (Paystack/Flutterwave Connect equivalents).
4. **Risk-tier admin UI.** **Resolved:** column ships in Phase 1 with default `standard`. UI lives in M7. Auto-population stays out of scope until M7 admin tools exist.

---

## 6. Recommended starting phase

**Phase 1 (schema + webhook plumbing).** Fully reversible (single migration), unblocks every subsequent phase, and the only way to find out if anything in the design conflicts with the existing schema. Phase 1 deliverable is a green-tests merge with no user-visible change, which makes it the safest first commit on a launch-blocker module.

After Phase 1 lands and is reviewed, Phase 2 (onboarding) is the next clear step.

---

## 7. Production credentials policy

No production Stripe credentials are touched in any phase before Phase 6. Phases 1 to 5 use:

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_test_...`

Production keys (`sk_live_...`, `whsec_live_...`) are added to Vercel **only** during Phase 6 cutover after Lawal explicit sign-off. Until then, all Connect calls are test-mode-only and any accidental production flow is impossible because the platform Stripe live account is not configured.

---

## 8. Industry research citations

The tiered payout model and reserve architecture in §1.4 and §1.5 are grounded in published industry practice from comparable ticketing platforms.

- **Eventbrite** (US-headquartered, AU operations): scheduled post-event payouts, default cadence 3 business days post-event for verified organisers, longer reserve holds for new and unverified accounts. Source: Eventbrite Help Center, "When will I receive my payout?" (eventbrite.com.au/help). Eventbrite's practice motivated the 3-business-day Tier 1 default and the 20% reserve.
- **Humanitix** (AU non-profit ticketing platform, comparable to EventLinqs target market): 5-business-day post-event hold for new organisers; this is more conservative than Eventbrite. Source: humanitix.com payout terms. Humanitix's stricter default validates the "post-event-only at Tier 1, no pre-event access" policy.
- **Ticketmaster** (global, enterprise): 7-day post-event hold standard, longer for high-volume venues. Source: Ticketmaster organiser FAQ. Ticketmaster's longer hold reflects enterprise risk management; the EventLinqs Tier 1 3-day cadence is more organiser-friendly while still protecting the float.
- **Stripe Connect best practices** (Stripe's own platform documentation, stripe.com/docs/connect): destination charges with `application_fee_amount` and `on_behalf_of` is the recommended pattern for marketplaces with platform-managed disputes. Reserve management via platform-side `payout_holds` with delayed transfer is the recommended hold pattern.
- **Australian Consumer Law and ACCC ticket-resale guidance**: ACCC, "Tickets and event experiences" (accc.gov.au). Major-failure rights are non-contractible, refund-policy display is mandatory, misleading pricing or descriptions trigger penalty exposure. Drives the §1.12 ACL compliance requirements.
- **Stripe 1099-K handling**: Stripe Connect platforms automatically file 1099-K for connected accounts above IRS threshold, no platform action required (stripe.com/docs/connect/tax-reporting). Drives the §1.11 US compliance row.
- **ATO TPAR (Taxable Payments Annual Report)**: ATO guidance on platforms paying contractors / service providers. Platform must lodge TPAR by 28 August each year. Source: ato.gov.au taxable-payments-annual-report. Drives the AU TPAR row in §1.11.

---

## 9. References

- Audit: `docs/m6/m6-current-state-audit.md`
- Scope: `docs/EventLinqs_Scope_v5.md` §3.7.2, §3.7.3, §3.7.4, §3.9.3
- Existing M3 spec: `docs/modules/M3-checkout-payments.md`
- Stripe Connect docs: https://stripe.com/docs/connect, https://stripe.com/docs/connect/express-accounts, https://stripe.com/docs/connect/destination-charges, https://stripe.com/docs/connect/handling-disputes-on-connected-accounts
- Stripe testing: https://stripe.com/docs/testing, https://stripe.com/docs/connect/testing
- ACCC ticket-resale guidance: https://www.accc.gov.au/consumers/buying-products-and-services/buying-tickets
- ATO TPAR guidance: https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/taxable-payments-annual-report
- Launch blocker tracker: `docs/sprint1/launch-blocker-priorities.md`
