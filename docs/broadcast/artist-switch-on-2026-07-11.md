# Stage 3 switch-on: broadcast_artists ON for launch (2026-07-11)

Founder decision: the artist layer (profiles, lineup tagging, per-artist
tracked links, dual attribution dashboards, artist follows) ships ON at
launch. Per the SPEC section 6 switch-on rule: flag flipped, the Stage 3
evidence gate re-run green on staging, and the marketing copy updated the
same day. TEST database `vkapkibzokmfaxqogypq` only; production untouched;
the payment engine unmodified (attribution references order ids read-only).

## Flag flip

`feature_flags.broadcast_artists` set to `true` on TEST (service-role row
update, the config-not-deploy switch the resolver is built for; live within
the 30 second cache TTL). Full table after the change:

| Flag | State |
|---|---|
| broadcast_artists | **ON** (flipped this pass) |
| broadcast_share | ON |
| launch_kit | ON |
| magic_start | ON (code default, no DB row) |
| seated_events | ON |
| surpass_edges | ON |
| broadcast_digest | OFF |
| broadcast_follow | OFF |
| community_giving | OFF |

## Stage 3 evidence gate re-run: ALL GREEN

Staging: `eventlinqs-staging.vercel.app` (feat/launch-kit line). Fixture: a
fresh synthetic two-artist event `artist-layer-launch-night-geelong`
("Artist Layer Launch Night, Geelong", free, published, 14 Aug 2026), with
the existing gate artists tagged through the REAL organiser Lineup UI.
Harness: `scripts/verify/artist-layer-gate.mjs` (re-runnable, STAGES
selectable). Full JSON: `evidence/artist-switch-on-2026-07-11/gate.json`.

| Check | Verdict | Evidence |
|---|---|---|
| Two artists tagged via the Lineup UI, per-artist links minted | PASS | Sienna Vale + Marlo Reyes tagged by name (reuse, no duplicates); tracked links `10Ct5Cc6Ud` and `VEPJ1npbw6` minted on render. `lineup-two-artists-tagged.png` |
| Sales through both artist links | PASS | Guest buyer through Sienna Vale's link -> order d0016e7a; signed-in buyer through Marlo Reyes's link -> order e9f85765. Both free checkouts; no payment path touched. `buy-*.png` |
| Attribution correctly split | PASS | share_link_events: Sienna Vale exactly 1 conversion (d0016e7a), Marlo Reyes exactly 1 conversion (e9f85765), distinct orders, one conversion per link. |
| Organiser dashboard | PASS | "Who filled the room": Sienna Vale 2 clicks / 1 order / 1 ticket; Marlo Reyes 1 click / 1 order / 1 ticket. `organiser-who-filled-the-room.png` |
| Artist dashboard | PASS | Marlo Reyes (owner account): totals 2 clicks / 2 orders / 2 tickets, per-show proof-of-draw rows for this event AND the 4 July gate show, own share link block. `artist-dashboard-marlo.png` |
| Artist share card in a link preview | PASS | `/events/.../with/marlo-reyes-lojdor` serves og:title "Marlo Reyes live at Artist Layer Launch Night, Geelong | EventLinqs" with the artist OG image; the card endpoint returns a real PNG with the gold "Live on stage" eyebrow over real photography. `artist-share-card.png` |
| Artist follow | PASS | Real profile Follow button as a signed-in buyer -> exactly one `follows` row (followable_type artist). `artist-follow-following.png` |

## Artist profile: brought to the platform profile standard

The pre-existing artist profile was a bare white band (avatar initials +
name + text list): below the premium bar. Rebuilt to INHERIT the
established profile pattern, no new design language: the shared
`OrganiserProfileHero` (photographic banner from the artist's next show,
navy scrim, navy-gradient fallback so the surface is never blank, centred
avatar, stats, Follow + links), then the organiser-profile shows rail
(`ContentSection` + `SnapRailScroller` + real `EventCard`s), and the shared
`CategoryHeroEmpty` empty state. Screenshots at 1440x900 and 390x844:
`artist-profile-1440x900.png`, `artist-profile-390x844.png`.

## Honest copy (SPEC section 0 copy rules held)

- Organiser page, launch-kit band, one new point: "Tag your lineup: each
  performer gets a profile, a place on your event page, and the exact
  tickets their sharing sold."
- Artist profile empty state: "Performers on EventLinqs get a profile, a
  place on every lineup they play, and the exact number of tickets their
  sharing sold." Tools and visibility only; no promise of bookings, fame,
  or filled rooms; no competitor named.

## Fixtures created on TEST this pass

Event `artist-layer-launch-night-geelong` (3f6a1c2e, free, is_seed_data)
with tier "Launch Pass"; two free orders (d0016e7a guest, e9f85765
buyer.one); share links and attribution rows above; one artist follow
(buyer.one -> Sienna Vale); artist bio + image enrichment on the two gate
artists; a real photographic cover on the fixture event (was the purple
TEST placeholder); gate fixture account passwords rotated for the drive
(values not recorded here).
