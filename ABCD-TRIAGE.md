# The A, B, C, D triage the owner asked for BEFORE building
8 September 2026, session 43. Source: CLOSE-OUT.md "AFRICA DEFERRAL, NARROWED,
7 September 2026", which pulls four items forward out of the Africa deferral and
says: "Add A through D to the LAUNCH-BLOCKING order in L2 only where they affect
an L1 journey. Anything that does not affect an L1 journey goes to the
post-launch queue, named. Report which is which before building, so the owner
sees the split."

Verdict in one line: NONE of the four blocks an L1 journey. All four go to the
post-launch queue, named, with the specific gap in each. Evidence below, read
from source rather than remembered.

## A. THE BUNDLE TARGET (scope 10.3: under 200KB initial JS, PWA offline, a
##    checkout that does not fail on poor network)

| Part | State | Evidence |
|---|---|---|
| Under 200KB initial JavaScript | NOT MET. The event route measures 433KB against a 480KB budget | CLOSE-OUT's own C8 figures, and the C8 ledger entries |
| PWA that functions offline | PARTIAL, and the part that exists is the part that matters at a door. `src/app/manifest.ts` plus TWO service workers: `public/scan-sw.js` (the door scanner's offline validation set, built in B1) and `public/push-sw.js` (web push). There is no app-shell service worker, so browse and checkout do not work offline | the files, and the B1 ledger entry |
| A checkout that does not fail on poor network | PARTIAL. The seat plan loader carries an AbortController and an explicit retry affordance, and the ticket selector distinguishes a retryable hiccup from a refusal so the checkout stops being offered only when it should. There is no offline queue for a purchase, and there should not be one: money is not a thing to queue optimistically | src/components/checkout/seat-selector-lazy.tsx, ticket-selector.tsx |

**Blocks an L1 journey?** No. L1 item 9 (buy a ticket end to end) completes; this
is speed and resilience, not function. The owner's LAUNCH ON THE RATCHET decision
already puts the performance work after launch, and P0 keeps the gate at 0.80 and
above while the platform rises to it. POST-LAUNCH QUEUE.

## B. WHATSAPP SHARE (scope 10.3: deep links with rich preview cards on all share
##    flows, event invitations, squad booking links and ticket transfers)

| Flow | State | Evidence |
|---|---|---|
| Event page share | BUILT. WhatsApp is the first channel in the share bar, beside Facebook, X and email, each carrying a tracked link | src/components/features/events/event-share-bar.tsx:99 |
| Launch Kit share | BUILT, same channel set | src/components/launch-kit/launch-share-row.tsx:52 |
| Squad booking link | BUILT. The start-squad modal opens WhatsApp with the invite | src/components/squads/start-squad-modal.tsx:80 |
| Rich preview card | BUILT. Every event has its own Open Graph image route and per-event card copy | src/app/api/og/event/[slug]/route.tsx, the C3 evidence |
| TICKET TRANSFER | NOT BUILT as a share. The transfer form takes an email address and the platform emails the new holder a fresh bearer link. There is no WhatsApp hand-off | src/components/features/tickets/transfer-ticket-form.tsx |

**Blocks an L1 journey?** No. No L1 item transfers a ticket over WhatsApp. Three
of the four flows the scope names are built and driven. POST-LAUNCH QUEUE, with
the named gap: the transfer flow.

## C. TRUST SIGNALS (scope 10.3: verified organiser badges, a public dispute
##    resolution process, buyer protection messaging, visible refund policies)

| Signal | State | Evidence |
|---|---|---|
| Contextual trust on the event page | BUILT, in the placement the locked design rules require: directly beneath the Get tickets CTA, never a sitewide band | src/components/features/event/EventTrustSignals.tsx, used at src/app/events/[slug]/page.tsx:932 |
| Trust treatment on checkout near the payment form | BUILT (CheckoutTrustSignals) | the checkout surface |
| Visible refund policies | BUILT. Every event carries its organiser's policy, it rides into the confirmation email, and /legal/refunds is public | src/lib/email/order-confirmation.ts, src/app/legal/refunds |
| VERIFIED ORGANISER BADGE | NOT BUILT as a vetted pipeline, and the component says so in its own header rather than claiming it: there is no `verified` flag on `organisations` behind a vetting process, so the microcopy reads "Community organiser" instead of making a claim the platform cannot stand behind. The organiser PROFILE hero does carry a verified marker | EventTrustSignals.tsx header, organiser-profile-hero.tsx:76 |
| A PUBLIC DISPUTE RESOLUTION PROCESS | NOT BUILT as a page. Disputes are handled in the admin surface and in the terms; there is no public "here is what happens if it goes wrong" page | src/app/legal has accessibility, cookies, organiser-terms, privacy, refunds, terms |

**Blocks an L1 journey?** No. POST-LAUNCH QUEUE, with two named gaps: the vetted
verified-organiser pipeline, and the public dispute resolution page.

## D. FRAUD PREVENTION (scope 10.3: dynamic rotating QR codes and single-use
##    cryptographic validation). The owner asked for an AUDIT here, not a rebuild.

| Requirement | State | Evidence |
|---|---|---|
| Single-use validation | BUILT and driven. The scanner validates once and refuses the second scan, across devices and offline, reconciling on reconnect | the B1 and B2 ledger entries, scripts/verify/door-realtime-verify.mjs |
| Dynamic rotating QR (30 second token) | NOT BUILT | the Scope v5 audit row for 3.12 |
| Cryptographic signing of the QR payload (HMAC-SHA256, per-event keys in a vault) | NOT BUILT | the same row |
| Anti-screenshot watermark | NOT BUILT | the same row |

**Is it already MET, as asked?** Partly, and the half that is built is the half
that stops the same ticket being used twice, which is the fraud that actually
costs an organiser at a door. The cryptographic hardening is build brief B4 and
is NOT built.

**Blocks an L1 journey?** No. L1 item 12 asks that the scan validates once and
refuses the second time, with the offline and multi-scanner paths proved, and all
three are built and driven. POST-LAUNCH QUEUE.
