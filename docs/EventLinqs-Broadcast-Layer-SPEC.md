# EventLinqs Broadcast Layer SPEC
## Version 1.0, 4 July 2026. Build everything A to Z, release behind feature flags.
## Reconciled with the Moat Doctrine, the Launch Density Layer SPEC, and the Event Media Standard.
## Australian English. No em-dashes or en-dashes. "Community" always, never the banned word.

---

## 0. DOCTRINE

Ticketing is a commodity. Distribution is the product. Organisers switch platforms for money and for filled rooms; the fee model covers money, the Broadcast Layer covers filled rooms. Artists are the original angle: an artist's real customer is often the organiser who booked them, so an artist who can prove "I filled 40 percent of that room" gets rebooked. Per-performer attribution is the feature no Australian incumbent runs, and it turns artists into recruiters of organisers, a growth loop that compounds the Launch Density strategy: dense local supply attracts dense local demand, and broadcast tooling is the pump between them.

**The two copy rules, binding on every surface and every marketing document:**
1. We never say "we will fill your room." We say "tools to expand your reach and a local audience that is actually looking."
2. No reach claim is published until platform data can back it. Claims graduate from tooling ("trackable links, share cards, local digest") to outcomes ("organisers on EventLinqs reached X locals last month") only when the numbers are real.

**Build-all, stage-the-switch:** every module below is built, tested, and merged now. Each module sits behind its own feature flag, defaulting OFF except Stage 1. Switching a stage on is a config change plus a verification pass, never a build. This removes the risk of the layer being forgotten and the risk of a half-built feature facing a user. Both risks die in the same design.

---

## 1. NON-NEGOTIABLES (inherited, restated, binding)

- TEST Supabase database vkapkibzokmfaxqogypq is the only writable environment. Production gndnldyfudbytbboxesk is never written to.
- The funds-holding payment engine is never modified. The Broadcast Layer never touches money paths.
- No em-dashes or en-dashes anywhere. Australian English everywhere. "Community" never the banned word, including in table names, columns, routes, flags, and copy.
- Every module is proven with real evidence: real emails delivered, real push notifications received, real attribution rows, real link previews. No claims without artefacts.
- Privacy is a moat, not a chore: consent-first, easy unsubscribe, attendee data belongs to the organiser, and we never email anyone without consent. Compliance targets: Australian Privacy Act and Spam Act 2003 (consent, sender identification, functional unsubscribe in every send).

---

## 2. STAGE 1: SHARE INFRASTRUCTURE (flag: broadcast_share, default ON at launch)

The organiser-facing reach toolkit. Everything here is demonstrable in a cold DM.

2.1 **Social share cards (Open Graph).** Every event page auto-generates a professional OG image: event image treated per the Event Media Standard, title, date, venue locality, and EventLinqs mark. Correct meta tags for Instagram, Facebook, LinkedIn, X, and messaging apps. Fallback design for events with no image so no shared link ever looks broken. (Visual design owned by Tab 4's design system; this layer owns generation, caching, and correctness.)

2.2 **Share actions.** Visible, well-designed share controls on every event page and in the organiser dashboard: native share sheet on mobile PWA, copy link, and per-channel intents. One tap, never buried.

2.3 **Trackable share links.** Every share generates a short link carrying a channel tag (and later, a person tag, see Stage 3). Clicks and conversions land in an attribution table so an organiser sees "Instagram sold 31, poster QR sold 12, Facebook sold 6."

2.4 **QR poster kit.** One-click downloadable A4 poster per event: event image, title, date, price, and a tracked QR code, print-ready PDF. The physical-world share channel, and a favourite for markets, gigs, and community noticeboards.

2.5 **Reach panel v1.** A clean panel in the organiser dashboard showing views, clicks by channel, and tickets by channel for each event. This is the "tools to expand your reach" pitch made visible, and it is honest by construction because it only shows measured data.

Stage 1 evidence gate: a shared staging link renders a correct preview in a real link-preview validation, a tracked link click writes an attribution row in TEST, the QR poster PDF downloads and scans, and the reach panel displays the real counts from a synthetic run.

---

## 3. STAGE 2: AUDIENCE ENGINE (flags: broadcast_digest, broadcast_follow, default OFF)

The demand-side pump. This is what makes "a local audience that is actually looking" literally true, and it is the retention loop made physical.

3.1 **Marketing consent capture.** An unticked-by-default consent checkbox at checkout and registration ("Keep me posted on events in my area"), stored with timestamp and source in TEST. No consent, no marketing contact, ever. (Tab 3's audit already covers verifying the checkout surface for this.)

3.2 **Weekly local digest.** A city-scoped email (Geelong edition, Melbourne edition) through the existing Resend custom domain: this week's events, beautifully rendered per the design system, sender identified, one-tap unsubscribe that works instantly. Locality derives from the Launch Density Layer's geography definitions, one source of truth.

3.3 **Follow an organiser.** A follow button on organiser profiles and event pages. Followers get notified of new events via PWA push (existing VAPID credentials) and email fallback, per their preference. This converts one good event into a durable audience, which is the single strongest organiser retention hook we can build.

3.4 **Buyer home feed.** The signed-in home experience prioritises followed organisers and the buyer's city. Density made visible: a Geelong buyer opens the app and sees Geelong.

3.5 **Notification preference centre.** One clean screen governing digest, follows, and push, per channel. Trust surface, not an afterthought.

Stage 2 evidence gate: a real digest email delivered to a test inbox with a working unsubscribe that is proven to stop the next send, a real push notification received on a device for a followed organiser's new event, and consent rows in TEST driving inclusion and exclusion correctly.

---

## 4. STAGE 3: PERFORMER ATTRIBUTION (flag: broadcast_artists, default OFF)

The differentiator. Nobody in this market does this well.

4.1 **Artist and performer profiles.** Name, image, bio, links, upcoming shows. An artist exists on the platform independent of any single event.

4.2 **Lineup tagging.** Organisers tag performers on an event. Tagged artists appear on the event page, and the event appears on the artist's profile. Untagged guest performers can be invited by link.

4.3 **Per-artist tracked links and share cards.** Every tagged artist gets their own tracked share link and their own OG share card variant ("[Artist] live at [Event]"). One tap for the artist to share to their following.

4.4 **Attribution view, both directions.** The organiser sees exactly who filled the room by performer channel. The artist sees their own numbers across every show they have played, a portable proof-of-draw they can show the next organiser who considers booking them. That artefact is the recruitment loop: artists bring organisers to us to get their numbers.

4.5 **Artist follow.** Stage 2's follow mechanic extended to artists, so a comedian's following travels with them to every room they play.

Stage 3 evidence gate: a synthetic event with two tagged artists, sales through both artist links, attribution correctly split in both dashboards, and the artist share card rendering correctly in a link preview.

---

## 5. DATA MODEL ADDITIONS (TEST database only, additive, no changes to money tables)

New tables, indicative: share_links (id, event_id, channel, artist_id nullable, code, created_at), share_link_events (link_id, kind view or click or conversion, order_id nullable, occurred_at), marketing_consents (user_or_email, source, granted_at, revoked_at), follows (follower_id, target_type organiser or artist, target_id, channel prefs), artists (profile fields), event_lineups (event_id, artist_id, status), notification_prefs, digest_sends (city, sent_at, recipient counts) for auditability. All additive migrations, reversible, run against TEST only. Attribution of a conversion references the order id but never alters order, payment, or payout rows.

---

## 6. RELEASE STAGING (the switch-on plan, decided later, built now)

- Stage 1 ON at launch: it is demonstrable in outreach DMs from day one.
- Stage 2 ON when the first founding organisers are live and the digest has real events to carry (target: launch week plus one to two weeks).
- Stage 3 ON when the first multi-performer events are on the platform, and its switch-on is itself a marketing moment ("artists, claim your numbers").
- Every switch-on requires: flag flipped in config, the stage's evidence gate re-run green on staging, marketing copy updated the same day.

---

## 7. TAB 6 BUILD PROMPT (paste into a new CC tab)

Open a new PowerShell window, then:

```powershell
cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app
git worktree add ..\eventlinqs-broadcast -b feat/broadcast-layer
cd ..\eventlinqs-broadcast
claude --model claude-fable-5 --dangerously-skip-permissions
```

Then paste:

```
You are the growth platform engineer for EventLinqs. Mission: build the complete Broadcast Layer A to Z from the locked specification at docs/ (Broadcast Layer SPEC v1.0), all three stages, production quality, everything behind feature flags with only Stage 1 defaulting on. You build the entire layer now; release staging is a config decision made later by the founder. Do not stop until every stage's evidence gate passes on staging.

NON-NEGOTIABLES: TEST Supabase database vkapkibzokmfaxqogypq only, production gndnldyfudbytbboxesk never touched. The funds-holding payment engine is never modified and no broadcast code writes to order, payment, or payout tables (attribution references order ids read-only). No em-dashes or en-dashes anywhere including table names, flags, and copy. Australian English. "Community" never the banned word in any identifier or copy. Consent-first per the Spam Act 2003: no marketing contact without recorded consent, sender identification and a working unsubscribe in every email. Real evidence for every gate.

BUILD ORDER: (1) data model migrations per SPEC section 5, additive only, on TEST. (2) Stage 1 share infrastructure per section 2: OG card generation and caching, share actions, trackable short links with channel attribution, QR poster PDF kit, reach panel v1 in the organiser dashboard. (3) Stage 2 audience engine per section 3: consent capture, city-scoped weekly digest via the existing Resend domain, follow-an-organiser with PWA push via existing VAPID credentials plus email fallback, buyer home feed prioritising city and follows, notification preference centre. (4) Stage 3 performer attribution per section 4: artist profiles, lineup tagging, per-artist tracked links and share card variants, dual attribution dashboards, artist follows. (5) Feature flag wiring: broadcast_share default on, broadcast_digest, broadcast_follow, broadcast_artists default off, each independently switchable by config with no deploy.

COORDINATION: Tab 4 owns the visual design system and is redesigning surfaces in worktree eventlinqs-ui on feat/ui-upgrade. Consume its design tokens and components where they exist, build cleanly where they do not, and flag any surface where the two branches will need a reconciliation merge rather than silently duplicating. The OG card visual template should be built to accept Tab 4's final design tokens.

EVIDENCE GATES, all must pass on staging with artefacts: Stage 1: link preview validation of a real shared staging event, attribution rows in TEST from a real click and a synthetic conversion, scannable QR poster PDF, reach panel showing the measured numbers. Stage 2: digest email delivered to a real test inbox, unsubscribe proven to exclude the address from the next send, push notification received for a followed organiser's new event, consent gating proven both directions. Stage 3: synthetic two-artist event with sales attributed correctly through both artist links, both dashboards correct, artist share card preview correct. Include one adversarial test: a tampered or forged share link code must not corrupt attribution.

GATE: produce docs/broadcast/2026-07-04-broadcast-verification.md with every gate, evidence paths, flag states, and a switch-on runbook per stage. End with a block titled BROADCAST LAYER COMPLETE listing anything requiring a founder decision.
```

---

## 8. WHAT THIS LAYER FEEDS (so it is never orphaned in strategy)

- Moat Doctrine: attribution data and follow graphs are accumulating, non-portable assets, deepening two layers of the six-layer stack.
- Launch Density Layer: the digest and city feed are density made visible to buyers; the reach panel is density made visible to organisers.
- Marketing playbook: Stage 1 is a DM demo asset from day one; Stage 3's switch-on is a planned marketing moment; the copy rules in section 0 bind all of it.
