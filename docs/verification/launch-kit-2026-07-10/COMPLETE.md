# EVENT LAUNCH KIT COMPLETE

Branch: `feat/launch-kit` (pushed; commits 017e1a3 + e5d382e on top of the
integrated line). Flag: `launch_kit`, DB-backed row in `feature_flags`,
default ON, switchable at `/admin/flags` with no deploy.

## Packaged versus newly built

The mission's premise held once the platform's parallel branches were
integrated: `feat/broadcast-layer` (per-event OG cards, tracked short links
`/s/[code]` with per-channel attribution, the A4 QR poster route, the reach
panel, DB feature flags) and `feat/design-upgrade-2026-07-04` (the visual
seat-map builder with rows, round and square tables and standing zones,
seating v2, the redesigned organiser landing) were merged into the current
`feat/ui-upgrade` design line. Conflicts resolved in favour of the newest
founder rulings (2026-07-07 hero token). tsc, eslint and all 656 tests green
on the merged line before any Kit code was written.

PACKAGED (already existed, now fused): tracked short links per channel, the
QR poster PDF route, the reach summary, the per-event OG invitation card,
the seat-map builder and buyer map, the DB flag primitive.

NEWLY BUILT:
- `/dashboard/events/[id]/launch-kit` - the signature post-publish screen:
  cover-photo masthead ("[Event] is live."), live URL with copy, on-screen
  scannable QR, one-click A4 poster PDF, invitation-card preview with brand
  bar, one-tap tracked sharing for WhatsApp / Instagram / Facebook / X /
  LinkedIn / Email / Copy (each carrying its own tracked short link), the
  read-only `SeatMapPreview` server SVG of the organiser's room, live reach
  (views / clicks / orders / tickets + top channels), and a next-steps strip.
  A locked state renders for unpublished events.
- Kit delivery wiring: publish button becomes "Publish and get your launch
  kit", a gold framing band on the review step, post-publish redirect to the
  kit, "Launch Kit" row action on My Events, and a manage-page button.
- `/waitlist` - nine cities (Geelong and Melbourne badged "Opening first"),
  real city photography tiles as working selectors, Spam Act-compliant join
  (verbatim consent wording stored, optional marketing opt-in unticked and
  separate), founding-candidate flagging, token unsubscribe at
  `/waitlist/unsubscribe/[token]`, per-IP rate limiting.
- Migration `20260709000001_launch_kit.sql` (additive, APPLIED to TEST
  vkapkibzokmfaxqogypq): `city_waitlist_signups` + the `launch_kit` flag row.
- Organiser page repositioning: hero leads with "Build your event, map your
  room, get your complete promo kit." / "In minutes. Free."; the self-serve
  band became the launch kit band; the Founding Organiser band carries the
  locked offer (invite-only, first 50 across Geelong and Melbourne, 6 months
  fee-free, 3 more per referred organiser) with its CTA into the waitlist.
  No competitor named anywhere in customer-facing copy.

## Full journey evidence (real UI, local production build on TEST)

Screenshots in this folder, log in `journey-log.json`, zero console errors
across every browser context:

1. Login -> organisation created through the real form -> venue created
   through the real form -> seating chart built through the REAL visual
   builder (+ Rows, + Round table, Save: 40 seats) [03, 04, 04b]
2. 7-step wizard: details, dates, location, real cover upload, free tier,
   reserved seating with venue + chart selected, review with the kit framing
   band [05*, 06]
3. "Publish and get your launch kit" -> lands on
   `/dashboard/events/{id}/launch-kit?published=1` [07, final-launch-kit-1440/390]
4. Poster: `poster.pdf` valid (%PDF, 285 KB)
5. QR: on-screen QR decoded programmatically -> tracked short link `/s/...`;
   opened as an anonymous visitor -> 302 -> live event page [08]
6. WhatsApp channel link clicked anonymously; kit reloaded: reach shows the
   clicks attributed (Top channels: Poster QR 2, WhatsApp 2) [09]
7. Mobile passes at 390x844 with ZERO horizontal overflow (element-vs-parent
   probe returned empty; user-eye viewport captures clean) [usereye-*, final-*-390]

## Waitlist proof per city (TEST rows)

- geelong: Jordan Rivers, role organiser, marketing_opt_in FALSE (box left
  unticked), founding_candidate TRUE, consent wording stored verbatim,
  count 1
- sydney: Priya Nair, role attendee, marketing_opt_in TRUE (box ticked),
  founding_candidate FALSE, consent wording + opt-in wording stored
  verbatim, count 1
- Unsubscribe: token page visited, deliberate button press set
  unsubscribed_at and cleared the opt-in [11, 11b]

## Visual self-check verdict

Iterated three times before yes: deepened the masthead scrim for eyebrow
contrast, gave the invitation card its cover-and-brand-bar visual anchor,
centred the QR card, and root-caused a real mobile-width blowout (missing
grid-cols-1 base + truncate min-content) to zero overflow at both viewports.
Final verdict: YES - the kit screen is personal (the organiser's own
photography), complete (every artefact present and working), and alive (real
reach numbers moving). It is the screen an organiser screenshots.

## Where to see it

The push to `origin/feat/launch-kit` triggers the Vercel git preview for the
branch (preview env reads TEST via the _PREVIEW vars). On the preview or any
deployment of this branch:
- Launch Kit: `/dashboard/events/{eventId}/launch-kit` (organiser-gated;
  reached by publishing an event)
- Organiser page: `/organisers`
- Waitlist: `/waitlist`

## Honest remainders (not done, not implied)

- The Kit journey was proven on a local production build against TEST, not
  on the Vercel preview; the preview URL should get one click-through.
- Lighthouse 95+ / axe on the new surfaces not yet run (the standing
  platform gate battery applies at the next preview pass).
- The `launch_kit` DB flag exists in TEST only until the migration reaches
  production at launch.
