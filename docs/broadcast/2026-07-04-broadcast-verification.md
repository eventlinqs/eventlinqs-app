# Broadcast Layer verification, 4 July 2026

Branch `feat/broadcast-layer`, spec `docs/EventLinqs-Broadcast-Layer-SPEC.md` v1.0.
Every module of all three stages is built, tested, and merged onto this branch
behind its stage flag. This document records the evidence for every gate, the
flag states, and the switch-on runbook per stage.

Status: EVIDENCE RUN IN PROGRESS. Each gate below carries PASS, FAIL, or NOT
VERIFIED with its artefact path. No gate is claimed without its artefact.

## Environment

- Database: TEST Supabase `vkapkibzokmfaxqogypq` only. Production
  `gndnldyfudbytbboxesk` untouched (no code in this layer references it, and
  the worktree `.env.local` carries TEST values only).
- Migrations applied to TEST and verified by direct query:
  `20260704000001_broadcast_artists_extension`, `20260704000002_broadcast_share_links`,
  `20260704000003_broadcast_audience`, `20260704000004_broadcast_feature_flags`.
- Staging: the Vercel git-integration preview build of this branch (the
  launch-line staging pattern). URL recorded below once deployed.
- The funds-holding payment engine is unmodified: no broadcast code writes to
  order, payment, or payout tables. Conversions reference order ids read only,
  enforced by design (inserts go to share_link_events only) and by the
  one-conversion-per-order unique index.

## Flag states (seeded, verified on TEST by direct read-back)

| Flag | State | Governs |
|---|---|---|
| broadcast_share | ON | Stage 1: OG cards, share actions, tracked links, QR poster, reach panel |
| broadcast_digest | OFF | Stage 2: weekly local digest |
| broadcast_follow | OFF | Stage 2: follow prompts, feed prioritisation surfaces |
| broadcast_artists | OFF | Stage 3: artist profiles, lineup tagging, artist links, dashboards |

Switching any stage is a row update in `/admin/flags` (capability
`admin.flags.manage`, audit-logged, cache-invalidated, live within 30
seconds). No deploy.

## Stage 1 evidence gate

| Check | Verdict | Evidence |
|---|---|---|
| Link preview validation of a real shared staging event | PENDING | |
| Attribution row in TEST from a real click | PENDING | |
| Attribution row in TEST from a synthetic conversion | PENDING | |
| QR poster PDF downloads and scans | PENDING | |
| Reach panel shows the measured numbers | PENDING | |
| Adversarial: forged share code corrupts nothing | PENDING | |

## Stage 2 evidence gate

| Check | Verdict | Evidence |
|---|---|---|
| Digest email delivered to a real test inbox | PENDING | |
| Unsubscribe excludes the address from the next send | PENDING | |
| Push notification received for a followed organiser's new event | PENDING | |
| Consent gating proven both directions | PENDING | |

## Stage 3 evidence gate

| Check | Verdict | Evidence |
|---|---|---|
| Two-artist event, sales attributed correctly through both links | PENDING | |
| Organiser dashboard correct | PENDING | |
| Artist dashboard correct | PENDING | |
| Artist share card preview correct | PENDING | |

## Switch-on runbook per stage

Every switch-on: flip the flag in `/admin/flags`, re-run the stage's evidence
gate on staging green, update the marketing copy the same day (SPEC section 6).

### Stage 1 (broadcast_share): ON at launch

Already ON by seed. To verify after any change: share a staging event link in
a link-preview validator, click a minted `/s/` link and confirm the click row,
download and scan a poster, open the event's Reach tab.

### Stage 2 (broadcast_digest, broadcast_follow): launch week plus one to two

1. Confirm real events exist for the target cities and real consents have
   accrued (checkout and signup capture them while the flags are OFF, by
   design).
2. Flip `broadcast_follow`: the event page organiser card gains Follow, the
   preference centre gains the Following section. Verify a follow, publish a
   test event, run the just-announced cron, confirm the push and email.
3. Flip `broadcast_digest`: the preference centre gains the digest section.
   Run the cron with `?city=<slug>&dry_run=1` (CRON_SECRET) and review the
   recipient and event lists; then `?city=<slug>&test_to=<founder email>` for
   a rehearsal send; then let the Thursday schedule run. Confirm the
   digest_sends audit row.
4. Marketing copy: update the organiser pitch to include the follow and
   digest reach numbers only once they are real (SPEC copy rule 2).

### Stage 3 (broadcast_artists): when multi-performer events exist

1. Flip `broadcast_artists`: /artists/[slug], the Lineup tab, the artist
   dashboard, and artist share cards all go live together.
2. Tag the lineups of the first multi-performer events; send each artist
   their claim link and share link.
3. Re-run the Stage 3 gate on one real event.
4. This switch-on is a marketing moment: "artists, claim your numbers".

## Coordination notes for Tab 4 (feat/ui-upgrade)

- The OG share-card template reads every token from
  `src/lib/broadcast/og-theme.ts`: swap that file's values when the final
  design tokens land; no template change needed.
- Surfaces built here that Tab 4 may restyle (flag any reconciliation merge
  rather than duplicating): the event page share bar (upgraded in place, same
  visual language), the Reach and Lineup dashboard tabs, the notification
  preference centre, the artist profile and artist dashboard pages, the
  digest email template (`src/lib/broadcast/digest.ts`), and the A4 poster
  layout (`src/lib/broadcast/poster.ts`).

## BROADCAST LAYER COMPLETE

Populated at the end of the evidence run.
