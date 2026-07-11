# Performer marketplace verification (2026-07-11)

TEST database `vkapkibzokmfaxqogypq` only; production untouched; the
funds-holding payment engine unmodified (booking never moves funds; the
structured pay-terms field records the agreement). Everything verified on
staging (`eventlinqs-staging.vercel.app`, feat/launch-kit line, migrations
20260711000002 applied to TEST) with `gig_board` and `artist_showcase`
temporarily ON in the test context and RESTORED TO OFF afterwards, the
launch state. Harness: `scripts/verify/marketplace-gate.mjs` (staged,
re-runnable); artefacts in `docs/marketplace/evidence/2026-07-11/`
(screenshots + `gate.json`).

## Extended versus new (foundation audit honoured)

EXTENDED, never duplicated: `artists` and `event_artists` (additive columns
and the existing lineup tagging close the booking loop), the share-link
attribution engine (draw data and the sale proof), the alert engine
(`notification_prefs`, push-first email backbone, one new `subject_id`
dedupe key), the rate-limit policy table, the flag resolver and
`/admin/flags`, the admin RBAC/audit/nav patterns, the Event Media Standard
embed allowlist (`parseVideoEmbed` + `EventVideo` + CSP), and the shared
profile/directory design system components.

NEW: `gigs`, `gig_applications`, `booking_requests` (bookings AND
structured mentoring contact), `marketplace_blocks`, `marketplace_reports`
tables; `/gigs` board + detail, `/dashboard/gigs` posting + applicant
review, `/artists` directory, showcase editor + self-serve profile
creation, `/admin/marketplace` moderation queue, four rate-limit policies,
and `admin.marketplace.manage`.

## Full loop journey: GREEN (screenshots at every step)

1. Verified organiser (active organisation) posted a structured gig through
   the real form: comedian, Geelong, fixed fee $250, deadline before the
   performance date, LINKED to a real published event
   (`marketplace-gate-night-geelong`). `post-gig-*.png`, board render
   `gig-board-desktop.png`.
2. Two performers with DIFFERENT draw data applied through the real panel;
   the panel shows exactly what travels (profile, measured draw, credits,
   showcase). `apply-*.png`.
3. The organiser compared them side by side, live draw numbers per card
   (`review-applicants-side-by-side.png`), shortlisted, and sent a
   structured booking request (terms + note).
4. The performer accepted from their dashboard: the request flipped to
   accepted, the application to booked, and the performer LANDED ON THE
   EVENT LINEUP automatically (`event_artists` row confirmed).
5. A guest bought through that performer's tracked link on the linked
   event: exactly one attributed conversion; the organiser's "Who filled
   the room" and the performer's proof-of-draw dashboard both show it.
   `sale-*.png`.

## Directory: GREEN

City + type filter returns both performers; the availability toggle
provably removes a performer from the available-only view; the draw badge
appears ONLY with the performer's consent (Sienna has sales but consent
off: no badge); the allowlisted embed renders as the click-to-play facade
on the profile (`directory-*.png`); a NON-allowlisted URL is rejected by
the editor, naming itself (`showcase-bad-embed-rejected.png`). Mobile
390x844 captures: `mobile-*.png`.

## Abuse rails: GREEN

- Application rate limit (5 per 10 minutes per user, fail-closed): five
  applications succeeded, the sixth was throttled with a clear message
  (`abuse-rate-limit-tripped.png`).
- Pair block: the organiser blocked a performer; the performer's next
  application to that organiser was refused
  (`abuse-block-refuses-application.png`). The block row was removed in
  restore.
- Report: a reported gig landed as an OPEN row in `marketplace_reports`
  (one report per user per target enforced), surfaced by the
  `/admin/marketplace` queue (built to the admin RBAC + audit pattern,
  capability `admin.marketplace.manage`). The admin queue screenshot needs
  a founder admin session (2FA); the row and the removal action are
  code-path and DB verified.

## Notifications: GREEN (Spam Act posture held)

All five types delivered through the EXISTING rails with rows in
`notifications` (channel email; push-first when a subscription exists):
gig_posted 3, gig_application 7, booking_request 1, booking_accepted 1,
mentoring_request 1. Real inbox evidence: `notify-mailinator-inbox.png`
(EventLinqs emails in a public test inbox, sender identified, manage link
in every footer). Opt-out provably excludes: with the performer's prefs
off, a fresh matching gig produced NO new row for them
(`optOutExcluded: true`); recipients are only ever notified about their
own marketplace activity or gigs matching the availability they switched
on themselves, and the availability toggle stops gig alerts.

Defect found by this battery and fixed at the root (`32dbcf7`): a bare
fire-and-forget dispatch after a server action response is not guaranteed
to run on serverless. Single-recipient dispatches are now awaited
(best-effort); the gig-posted fan-out runs in `after()`.

## Regression: GREEN

- `tsc --noEmit` 0 errors; `eslint` 0 errors; vitest 706/706 (+5 embed
  allowlist tests).
- Seated purchase, GA purchase, and the full seated-attachment battery
  (including ticket transfer) re-ran ALL_GREEN on the marketplace build.
- Magic Start publish + Launch Kit journey re-ran green end to end
  (`regression-magic-draft.png`, `regression-launch-kit.png`): AI draft,
  cover upload, publish, Launch Kit with live page, tracked sharing, QR
  poster, invitation card, live reach.
  Harness: `scripts/verify/magic-launch-kit-drive.mjs`.

## Final flag table (TEST read-back after restore)

| Flag | State | Launch intent |
|---|---|---|
| gig_board | OFF | OFF (staged post-launch activation) |
| artist_showcase | OFF | OFF (staged post-launch activation) |
| broadcast_artists | ON | ON |
| broadcast_share | ON | ON |
| launch_kit | ON | ON |
| magic_start | ON (code default) | ON |
| seated_events | ON | ON |
| surpass_edges | ON | testing flag |
| broadcast_digest | OFF | OFF |
| broadcast_follow | OFF | OFF |
| community_giving | OFF | OFF |

## Fixtures created on TEST this pass

Event `marketplace-gate-night-geelong` (7c2e5b1d) + Gate Pass tier; gig
67ef06aa (+6 spray targets and 2 probe gigs, all fixture-marked titles);
two applications + one booked; one accepted booking request + one
mentoring request; one free order via the artist link; one open
marketplace report; performer two's profile email was temporarily routed
to a public test inbox and RESTORED. Structured-contact boundary held
everywhere: no open messaging surface exists, and all video is external
allowlisted embeds (no uploads, no hosting).
