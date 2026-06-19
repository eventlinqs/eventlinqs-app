# EventLinqs Demand Engine: Complete Build Plan (Phase 0 to 5)

Status: APPROVED BLUEPRINT (founder sign-off, Lawal Adams). Execution is on
hold. We launch the platform first; we resume at Phase 0 the moment the
platform is live. Do not start Phase 0 before then.

Companion law: this plan executes the doctrine in
`event-demand-engine/SKILL.md` and the strategy in
`docs/MOAT-DEMAND-ENGINE-PLAN.md` (both live in the `eventlinqs-app` repo). The
governing constitution is `CLAUDE.md`.

Locked decisions (founder, this session):
- Push channel: Web Push (PWA) now, behind a channel-agnostic notification
  interface so a native FCM/APNs channel slots in later with zero rework.
- AI provider: Vercel AI Gateway with Claude models (AI SDK v6).
- SMS: build the SMS adapter behind the dispatcher interface, switch it on later
  when a provider key is added (no paid provider on the critical path now).

---

## Governing law

CLAUDE.md constitution + `event-demand-engine/SKILL.md` (five engines plus the
AI layer, six laws) + `MOAT-DEMAND-ENGINE-PLAN.md`. Build order is locked:
graph, then alerts, then feed, then conversion and virality, then waitlist
intelligence, then AI. Push first; the graph is sacred; sold out means packed;
every feature must move the benchmark metrics or it is not done.

Workspace: `eventlinqs-demand-engine` (a worktree of `eventlinqs-app`, branch
`feat/demand-engine`).

Prep step 0 (at resume): port `MOAT-DEMAND-ENGINE-PLAN.md` and the
`event-demand-engine` skill into this branch so the Law 0 docs are co-located
where the build happens (documentation copy only).

---

## Current-state map (audited against the live feat/demand-engine worktree)

| Engine | Built | Partial | Missing |
|---|---|---|---|
| 0. Attendee Graph | `follows` table (artist + subgenre only), genre/subgenre taxonomy, artists + event_artists, events carry genre/subgenre/city/geo | Behaviour tracking is Plausible fire-and-forget only (no DB); affinity tags singular not multi | Follow buttons/UI (none render), organiser/venue/community/scene follow targets, taste capture at signup, streaming connect, `attendee_taste`, `events_behaviour` tables |
| 1. Alert Engine | Resend email sender, transactional templates, Vercel cron infra (5 jobs), `waitlist_notifications` | `just_announced`/`last_chance` exist as UI badges only (not triggers); waitlist email is immediate, no send-time optimisation | Push (no VAPID/SW), SMS, `notifications`/`notification_prefs` tables, lifecycle trigger system, send-time optimisation, instrumentation |
| 2. Feed | `fetchRecommendedEvents` (saved-org/category + city, no ranking), category rails | Homepage is static ISR/anonymous | Affinity ranking, "for you" feed, weekly digest, similar events, affinity-ranked search, follow-feed query (none uses `follows`) |
| 3. Conversion/Virality | Stripe Payment Element (card + Apple/Google Pay), Squad group-buy fully working, event share bar | Social proof is scarcity only (no "N going/watching") | Abandoned-checkout recovery, referral/tag-a-friend + `referrals` table, affiliate tracking, saved cards |
| 4. Waitlist/Intelligence | Waitlist FIFO + RPC promote + 15-min offer window + email | Queue half-baked (config columns removed); face-value recirculation not closed-loop | Notify-Me-before-on-sale, organiser demand dashboard (insights page is a placeholder stub) |
| 5. AI layer | nothing | nothing | Everything: affinity scoring, send-time/copy gen, lookalike, predictive demand/pricing, campaign autopilot, fill-gap engine |

---

## Scope Manifest: DO NOT TOUCH (all phases)

These are frozen. Read them, never rewrite their logic:

- Payment spine: `src/lib/payments/*` (PaymentCalculator, `pricing-rules.ts`,
  `public-fee.ts`), Stripe charge/webhook handlers, `src/lib/payouts/*`,
  destination charges, refund logic. (Phase 3 adds Stripe Customer + saved-card
  via SetupIntent additively, and reads order data; it never alters
  charge/fee/payout math. Declared exception.)
- Auth core: `src/components/auth/*`, Supabase auth flows, auth middleware,
  `getUser` revalidation. (Phase 0 taste capture is a separate post-signup
  onboarding step, not a rewrite of the signup/auth flow. Declared exception.)
- Fee system: never hardcode or change a fee; `docs/FEE-SYSTEM.md` spine is law.
- Checkout payment confirmation (`checkout-form.tsx` Stripe confirm path), admin
  RBAC/2FA core, existing migrations (forward-only; never edit a shipped
  migration), `globals.css` tokens, and the homepage hero/LCP image.

## Authorised surfaces (new code lives here)

`src/lib/demand/*` (graph, affinity, dispatcher, ai), `src/lib/notifications/*`,
`src/app/api/cron/*` (new alert/digest jobs), `src/app/api/push/*`,
`src/app/feed`, `src/app/following`, `src/components/demand/*`,
`src/components/follow/*`, new `supabase/migrations/*`, `public/sw.js` + PWA
manifest, and additive sections on event-detail / dashboard / checkout.

## DB protocol (every phase that needs schema)

Stop, give the exact `supabase db push --linked` command, founder runs it in
PowerShell from the `feat/demand-engine` worktree, founder confirms applied;
then verify via a direct `schema_migrations`/pg query (not the PostgREST cache),
regenerate `database.ts`, then continue. One migration owner: the build agent,
this branch. Never the Dashboard SQL editor, never the Supabase MCP.

---

## Phase 0: The Attendee Demand Graph (foundation)

Schema: extend `follows` check to add `organiser|venue|community|scene`;
`attendee_taste` (communities[], genres[], home_city + lat/lng,
travel_radius_km, streaming_source, streaming_seed_json, updated_at);
`attendee_events_behaviour` (user_id, event_id, action enum
[view/save/share/purchase/waitlist_join/no_show], weight, source, created_at +
indexes); `event_affinity` resolver (view over events + event_artists +
genre/subgenre + culture/community + city/geo) so every event is matchable.

Build: follow buttons on organiser/artist/venue/community/scene surfaces
(shared `<FollowButton>`); post-signup taste onboarding (communities + sounds +
home city + radius); Spotify connect built to 100%, auto-switches on when
`SPOTIFY_CLIENT_ID` is set (data-dependent); a real behaviour-tracking writer
(view/save/share/purchase/waitlist/no-show) into the DB, not just Plausible.

Proof: follow to DB round-trip; taste profile persists; behaviour rows write on
real interactions; affinity resolver returns tagged events; Lighthouse 95+ /
axe 0 / link + affordance scans on new surfaces; benchmark follow lifecycle vs
Bandsintown at 1440/390.

## Phase 1: The Alert Engine (biggest lever)

Schema: `notification_prefs` (push/email/sms enabled, quiet_hours, timezone);
`push_subscriptions` (endpoint, p256dh, auth, ua); `notifications` (user_id,
event_id, type, channel, dedupe_key, scheduled_for, sent_at, opened_at,
clicked_at, converted_at, status, payload).

Build: Web Push (VAPID + `sw.js` + PWA manifest), opt-in capture + prefs +
quiet hours; channel-agnostic dispatcher with adapters {web-push, email=Resend,
sms=stub}; lifecycle triggers (Just Announced, On Sale Now, Going Fast
[velocity/stock threshold], Last Chance, Tonight, Waitlist Available) as cron
evaluators; targeting by follows + affinity + location radius; per-timezone
send-time + quiet-hours (heuristic now, AI-tuned in Phase 5); instrumentation
dashboard (sent/opened/clicked/converted + push-vs-email uplift).

Proof: real push delivered to a subscribed browser; each lifecycle type fires
on the right event state; dedupe holds; uplift readout live; benchmark alert
lifecycle vs Bandsintown + DICE.

## Phase 2: Discovery & Personalised Feed

Build (mostly code): affinity ranking (taste + location + recency + social +
scarcity) over the graph; follow-feed query (events matching followed
artists/subgenres/orgs/venues/communities); `/feed` "for you" + a personalised
homepage rail client-hydrated post-paint (preserves ISR + hero LCP law); weekly
"near you this week" digest (cron to push + email); "similar events" on event
detail; affinity-ranked sort option in search/browse. (Schema: optional
follow-count rollup; likely no migration.)

Proof: two distinct taste profiles get visibly different feeds; cold-start
(signup taste + Spotify) produces a non-empty feed; LCP unaffected; benchmark
feed vs DICE + Eventbrite.

## Phase 3: Conversion & Virality

Schema: `referrals` (referrer, invitee, event_id, channel, code, status,
reward); `abandoned_checkouts` (or reuse reservation state) for recovery.

Build: saved card (Stripe Customer + SetupIntent, additive); confirm Apple/Google
Pay; real social proof ("N going" from orders, "M watching" lightweight
presence, "K left" exists); abandoned-checkout recovery via the Phase 1
dispatcher (push + email); referral / tag-a-friend with attribution;
affiliate/promoter codes; wire referral attribution onto the existing Squad loop.

Proof: abandoned cart triggers recovery; referral attributes a real purchase;
social-proof counts are real; benchmark checkout + virality vs DICE.

## Phase 4: Waitlist & Demand Intelligence

Schema: pre-sale interest (`presale_interest` or a pre-onsale waitlist status).

Build: Notify-Me / RSVP before on-sale (feeds Just-Announced/On-Sale alerts);
close the waitlist face-value recirculation loop (auto-offer next on expiry,
verify + complete); replace the placeholder organiser demand dashboard with real
intelligence: waitlist depth, geographic distribution, taste breakdown of
who-wants-in, tier velocity, add-a-date prompt, real-time sales + referral/
marketing attribution.

Proof: pre-sale capture to on-sale alert; sold-out recirculation packs the room;
organiser sees real demand data; benchmark waitlist vs DICE.

## Phase 5: The AI Layer (Vercel AI Gateway + Claude)

Build: AI SDK v6 via Vercel AI Gateway (Claude); learned affinity scoring
augmenting Phase 2; optimal send-time/channel/copy generation per attendee
(tunes Phase 1); lookalike expansion from buyers; predictive demand + suggested
pricing/timing for organisers; campaign autopilot (auto-generate
copy/social/email/push from event details); fill-gap engine (detect underpacing
vs predicted curve, widen targeting, fire Going-Fast/offer, trigger referral
pushes). Data-dependent models (lookalike, predictive) built to 100%,
auto-switch on as data accrues.

Proof: autopilot generates a full campaign for a real event; fill-gap detects an
underpacing event and acts; AI send-time beats the heuristic; benchmark
intelligence vs DICE + Bandsintown.

---

## Proof & benchmark gate (every phase, before moving on)

End-to-end proof with evidence (screenshots, logs, metric readouts) on the
warmed Vercel preview; Competitive Benchmark Gate via Playwright vs the relevant
leader at 1440 + 390; Lighthouse 95+ desktop AND mobile; axe 0; link-integrity +
affordance scans on new surfaces; zero broken states. A short proof summary
after each phase, then continue to the next without re-approval, except stop for
the founder to apply each migration. Metrics tracked throughout: push-vs-email
uplift (target 4 to 6x), discovery + push share of sales (vs DICE ~40%),
waitlist fill rate, sell-through velocity.

Assumption confirmed: "verified in production" means proven on the warmed Vercel
preview deployment; merge to `main` / production promotion stays the founder's
call at the ship gate (CLAUDE.md: never merge without approval). No auto-merge
between phases.

---

## Resume trigger

Resume at Phase 0 the moment the platform is live. Until then this plan is the
preserved blueprint and execution stays on hold.
