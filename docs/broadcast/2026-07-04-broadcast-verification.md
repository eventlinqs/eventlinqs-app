# Broadcast Layer verification, 4 July 2026

Branch `feat/broadcast-layer`, spec `docs/EventLinqs-Broadcast-Layer-SPEC.md` v1.0.
Every module of all three stages is built, tested (640 unit tests green), and
committed on this branch behind its stage flag. This document records the
evidence for every gate, the flag states, and the switch-on runbook per stage.

Verdict: ALL GATES GREEN on staging, with ONE named exception reported
honestly: the physical device receipt of a push notification, which no
automated browser can perform (Chrome forbids the Push API in incognito
contexts and disables its push service under automation). The push pipeline is
proven to the last hop and the device check is a one-tap founder step below.

## Environment

- Database: TEST Supabase `vkapkibzokmfaxqogypq` only. Production
  `gndnldyfudbytbboxesk` untouched. The staging page HTML embeds the TEST
  project ref (checked directly) and the worktree `.env.local` carries TEST
  values only.
- Staging: the Vercel git-integration preview of this branch,
  `https://eventlinqs-app-git-feat-broadca-62d6b2-lawals-projects-c20c0be8.vercel.app`
  (the launch-line staging pattern; the branch alias tracks the newest build).
- Migrations `20260704000001` to `20260704000004` applied to TEST with
  `supabase db push --linked` and verified by direct query (`migration list`
  local = remote, plus a service-role read-back of the feature_flags seed).
  The launch-line tab has already synced the same four files onto
  `release/launch-line` (commit ec55ca0), so the shared migration history is
  consistent.
- The funds-holding payment engine is unmodified. No broadcast code writes to
  order, payment, or payout tables: conversions insert into share_link_events
  only, referencing the order id read-only, capped by a unique
  (link, order) index.
- Branch-scoped preview env added for the evidence run: `CRON_SECRET`
  (fresh), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` +
  `VAPID_SUBJECT` (fresh pair; the launch-line records are sensitive-encrypted
  and unreadable by design, and push subscriptions are per-origin, so a
  branch-preview pair is the correct isolation), and `EMAIL_FROM`
  (`EventLinqs <hello@eventlinqs.com>`; the project-wide preview value
  resolves to the unverified `send.eventlinqs.com` domain and Resend refuses
  it - founder decision item 3 below).

## Flag states

Seeded launch defaults, verified by service-role read-back on TEST, and
restored to exactly this state after the evidence run:

| Flag | State | Governs |
|---|---|---|
| broadcast_share | ON | Stage 1: OG cards, share actions, tracked links, QR poster, reach panel |
| broadcast_digest | OFF | Stage 2: weekly local digest |
| broadcast_follow | OFF | Stage 2: follow prompts and surfaces |
| broadcast_artists | OFF | Stage 3: artist profiles, lineup tagging, artist links, dashboards |

During the gate run the three OFF flags were switched ON (a row update, no
deploy, live within 30 seconds), and switched back OFF afterwards. Switching
is admin-surfaced at `/admin/flags` (capability `admin.flags.manage`,
audit-logged, cache-invalidated).

## Stage 1 evidence gate: ALL PASS

Fixture: the real seeded event `harbour-lights-live-geelong-waterfront-sessions-4muhm2`
plus the gate fixture event below. Full probe log:
`evidence/stage1-gate-log.txt`, battery results:
`evidence/gate-battery-results.json`.

| Check | Verdict | Evidence |
|---|---|---|
| Link preview validation of a real shared staging event | PASS | og:title, og:description, og:image, og:url, twitter:card, twitter:image all present and correct on the event page (the exact tags preview crawlers read); the OG card endpoint returns a real 200KB PNG with CDN caching. `evidence/stage1-og-card.png`, `evidence/stage1-gate-log.txt` |
| Attribution row in TEST from a real click | PASS | GET `/s/QccAI65pi3` returned 302 to the event, set the last-touch share cookie, and wrote exactly one click row (id 3b69ee89). View beacon wrote one view row and the same-day duplicate was deduped server side. |
| Attribution row in TEST from a synthetic conversion | PASS | Rendering `/orders/EL-Z488D879/confirmation` with the share cookie wrote exactly one conversion row referencing order accfafb2 read-only; a re-render wrote nothing (idempotent). |
| QR poster PDF downloads and scans | PASS | Organiser-authed download returned a 45KB `%PDF-`; the embedded 600x600 QR was mechanically decoded (jsQR) to the tracked link `/s/fWqL4mcWxP`, which 302s to the event page. `evidence/stage1-qr-poster.pdf` |
| Reach panel shows the measured numbers | PASS | Screenshot shows link views 2, clicks 5, orders 2, tickets 2 with the per-channel table, the full share kit, the poster download, and the honest measured-only footnote. `evidence/stage1-reach-panel.png` |
| ADVERSARIAL: forged or tampered code corrupts nothing | PASS | Four attack shapes (unknown well-formed code, one-character tamper of a real code, oversized junk, injection string) each 302d cleanly to `/events` and the share_link_events row count was identical before and after (3 = 3). The format gate rejects malformed codes before any query; unknown codes fail the existence check; conversions additionally require the link event to equal the order event and are unique per (link, order). |

## Stage 2 evidence gate: ALL PASS except the named device-receipt step

Fixtures: organisation "Broadcast Gate Presents", free published event
"Broadcast Gate Proof Night, Geelong" (city geelong, this digest week), a
second event published after the follow, and two buyer accounts. Consent was
captured through the REAL guest checkout (unticked digest box, ticked
deliberately) - see `evidence/stage2-checkout-consent.png`.

| Check | Verdict | Evidence |
|---|---|---|
| Digest email delivered to a real test inbox | PASS | Rehearsal send delivered to lawaladams9@gmail.com (`test_to`, HTTP 200, events: 2), then the REAL send delivered to both granted recipients (`sentTotal: 2`) and wrote the digest_sends audit row; an immediate re-run skipped with `already_sent_this_period` (idempotent). Founder: the email is in your Gmail inbox, subject "This week in Geelong: 2 events worth a look". |
| Unsubscribe excludes the address from the next send | PASS | Recipient resolution before: buyer one + founder. Buyer one unsubscribed via the real no-login page with one deliberate button press (`evidence/stage2-unsubscribe-page.png`, `stage2-unsubscribed.png`); recipient resolution after: founder only. The send path reads status granted rows only, so exclusion is mechanical. |
| Push notification received for a followed organiser's new event | PASS to the last hop; device receipt is founder step 1 below | The follow was made through the real event-page button (saved_organisers row verified). The new event was published after the follow, the just-announced cron dispatched 2 and sent 2, and the notifications rows are stamped (type just_announced, sent_at set) with the email fallback channel per the push-first-email-backbone design, since no device push subscription exists on the preview: Chrome forbids the Push API in incognito (all Playwright contexts) and disables its push service under automation flags, so no automated browser can complete a real FCM subscription. VAPID keys are configured on the deployment (the Enable push alerts control is active, `evidence/stage2-preference-centre.png`) and the subscribe/unsubscribe API and web-push send path are unit- and code-path verified. |
| Consent gating proven both directions | PASS | Granted at checkout -> included (recipient list shows the address); withdrawn -> excluded from the next resolution; never consented (buyer two) -> never present in any list. The consent row carries the exact wording, version v1, source checkout, city geelong. |

The preference centre (`evidence/stage2-preference-centre.png`) shows the full
trust surface live: push control, email alerts and quiet hours and timezone,
the digest opt-in with city (Geelong, flowed from the checkout consent), and
the Following list with unfollow.

## Stage 3 evidence gate: ALL PASS

Fixtures: two artists on the fixture event, exercised through the REAL flows:
"Sienna Vale" tagged directly on the Lineup tab; "Marlo Reyes" invited by
link, claimed by a signed-in buyer (single-use token, profile ownership
assigned on claim, never transferring an owned profile).

| Check | Verdict | Evidence |
|---|---|---|
| Two-artist event, sales attributed correctly through both links | PASS | Buyer one arrived through Sienna Vale's tracked link and bought (guest free checkout); buyer two arrived through Marlo Reyes's link and bought (signed-in free checkout). Conversions split exactly: Sienna Vale -> order 100cf6ff, Marlo Reyes -> order 0659725b. `gate-battery-results.json` |
| Organiser dashboard correct | PASS | The Lineup tab's "Who filled the room" table: Sienna Vale 4 clicks, 1 order, 1 ticket; Marlo Reyes 1 click, 1 order, 1 ticket. `evidence/stage3-lineup-attribution.png` |
| Artist dashboard correct | PASS | Marlo Reyes's dashboard (the claiming buyer's account): totals 1 click, 1 order, 1 ticket, the per-show proof-of-draw table, and the artist's own share link. `evidence/stage3-artist-dashboard-numbers.png` |
| Artist share card preview correct | PASS | `/api/og/event/[slug]?artist=marlo-reyes-lojdor` renders the variant: gold "Live on stage" eyebrow, "Marlo Reyes live at Broadcast Gate Proof Night, Geelong", date and venue line, EventLinqs mark. The purple background with baked-in size text is the TEST placeholder cover image itself, not a card defect. `evidence/stage3-artist-og-card.png` |

Artist follows ride the existing follows table and the just-announced cron
alerts artist followers when the stage is on (deduped per user per event, so
an organiser-follower who also follows the artist is never alerted twice).

## Fixtures created on TEST (recorded for cleanup, ids in `evidence/fixtures.json`)

Users broadcast.gate.organiser/buyer.one/buyer.two@eventlinqs.com,
organisation "Broadcast Gate Presents", events
`broadcast-gate-proof-night-geelong` and
`broadcast-gate-encore-session-geelong` (both free, real rows so the digest
carries them), artists "Sienna Vale" and "Marlo Reyes", two free orders, the
share links and attribution rows above, one founder digest consent
(lawaladams9@gmail.com, granted, geelong), and Stage 1 probe rows on the
Harbour Lights event. All TEST-only. The Stage 1 probe conversion references
order EL-Z488D879 read-only.

## Data-completeness note for the digest

Only 27 published TEST events carry `city_primary` (the taxonomy key the
digest scopes by); the 261-event seeded catalogue mostly carries free-text
`venue_city` only. The digest correctly uses the taxonomy key (one source of
truth). Before switching broadcast_digest on for real cities, backfill
`city_primary` on real events (or ensure the event-creation flow always sets
it, which it does for organiser-created events via the city picker).

## Switch-on runbook per stage

Every switch-on: flip the flag in `/admin/flags` (live within 30 seconds,
audit-logged), re-run the stage's evidence gate on staging green, update the
marketing copy the same day (SPEC section 6).

### Stage 1 (broadcast_share): ON now, on by seed

Re-verify after any change: paste a staging event link into a link-preview
validator, click a minted `/s/` link and confirm the click row, download and
scan a poster, open the event's Reach tab.

### Stage 2 (broadcast_digest, broadcast_follow): launch week plus one to two

1. Confirm real events exist for the target cities with `city_primary` set,
   and real consents have accrued (checkout and signup capture them while the
   flags are OFF, by design, so the list builds before the first send).
2. Flip `broadcast_follow`: the event page organiser card gains Follow and
   the preference centre gains the Following section. Follow a test
   organiser, publish an event, run
   `GET /api/cron/notify-just-announced` (Bearer CRON_SECRET), confirm the
   push or email.
3. Flip `broadcast_digest`: run the cron with `?city=<slug>&dry_run=1` and
   review the recipient and event lists, then `?city=<slug>&test_to=<you>`
   for a rehearsal, then let the Thursday 08:00 AEST schedule run. Confirm
   the digest_sends audit row.
4. Production env prerequisites (founder items 2 and 3 below): CRON_SECRET
   and VAPID keys on the production environment, and a verified Resend
   sending domain for EMAIL_FROM.

### Stage 3 (broadcast_artists): when multi-performer events exist

1. Flip `broadcast_artists`: /artists/[slug], the Lineup tab, the artist
   dashboard, and artist share cards go live together.
2. Tag the first real lineups; send each artist their claim link and share
   link from the Lineup tab.
3. Re-run the Stage 3 gate on one real event.
4. This switch-on is a marketing moment: "artists, claim your numbers".

## Coordination notes for Tab 4 (feat/ui-upgrade)

- The OG share-card template reads every token from
  `src/lib/broadcast/og-theme.ts`: swap that file's values when the final
  design tokens land; no template change needed.
- Surfaces built here that Tab 4 may restyle (flag a reconciliation merge
  rather than duplicating): the event page share bar (upgraded in place,
  visual language unchanged), the Reach and Lineup dashboard tabs, the
  notification preference centre, the artist profile and artist dashboard
  pages, the digest email template (`src/lib/broadcast/digest.ts`), and the
  A4 poster layout (`src/lib/broadcast/poster.ts`).

## BROADCAST LAYER COMPLETE

All three stages are built A to Z, unit-tested (640 green), lint- and
type-clean, deployed to staging, and every evidence gate has run green with
artefacts in `docs/broadcast/evidence/`, with the single push device-receipt
exception handled by founder step 1. Flags sit at launch state: Stage 1 ON,
Stages 2 and 3 OFF, each switchable in `/admin/flags` with no deploy.

Items requiring a founder decision or action:

1. PUSH DEVICE RECEIPT (one tap, closes the last Stage 2 evidence item).
   Place: `https://eventlinqs-app-git-feat-broadca-62d6b2-lawals-projects-c20c0be8.vercel.app/account/notifications`
   on your phone or desktop Chrome, signed in as any account that follows an
   organiser. Action: tap "Enable push alerts" and allow notifications, then
   have that organiser publish an event and run the just-announced cron (or
   wait for its 15-minute schedule). Success: the push notification appears
   on your device. Automated browsers cannot perform this step (Chrome
   disables its push service under automation), which is why it is yours.
2. PRODUCTION ENV FOR STAGE 2: production has no CRON_SECRET or VAPID keys
   visible to this workstream. Before flipping the Stage 2 flags in
   production, set CRON_SECRET, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
   VAPID_PRIVATE_KEY, and VAPID_SUBJECT on the Production environment (the
   launch-line preview records exist but are sensitive-encrypted; decide
   whether to reuse those values or mint production ones - production push
   subscriptions bind to whichever public key ships first, so pick once).
3. RESEND SENDING DOMAIN: the project-wide preview EMAIL_FROM resolves to
   `send.eventlinqs.com`, which is NOT verified in the Resend account and
   caused hard send failures until this branch overrode it with the verified
   `hello@eventlinqs.com`. Decide the canonical sending identity (verify
   send.eventlinqs.com in Resend, or standardise EMAIL_FROM on the verified
   root domain) and align the env records everywhere.
4. DIGEST CITY BACKFILL: backfill `city_primary` on real events before the
   first real digest send (see the data-completeness note).
5. FIXTURE CLEANUP TIMING: the gate fixtures listed above stay on TEST as
   verification history unless you want them purged; say the word and they
   are removed in one pass (ids in `evidence/fixtures.json`).
6. MERGE SEQUENCING: this branch is self-contained on top of the
   staging-verification lineage. The four broadcast migrations are already
   copied onto `release/launch-line`; merging `feat/broadcast-layer` onto the
   launch line is a fast-forward-style code merge plus one Tab 4 design
   reconciliation pass over the surfaces listed above. Never merged without
   your sign-off, per the constitution.
