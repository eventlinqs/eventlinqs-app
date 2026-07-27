# Roast ledger: Launch Kit social publishing plan (research + patterns + proofs)

Date: 2026-07-27. Task: Phase A research, Phase B three patterns, Phase C two static PNGs + LAUNCH-KIT-PLAN.md. BUILD NOTHING. Ledger written BEFORE work began per brief-roast Phase 1; adjudicated at completion.

MID-TASK FOUNDER DIRECTIVE (received during the session, near the usage limit): write everything to docs/design/LAUNCH-KIT-PLAN.md, commit and push it, report the remote sha and where the work got to. This overrides the original brief's report-and-wait-without-committing posture for the docs deliverables only. src remains untouched.

## Requirement ledger (verbatim decomposition of the brief)

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast skill FIRST and obey it | MET | Read as the first action of the session; this ledger + gate block are its output |
| 2 | Read the frontend-design skill FIRST and obey it | MET | Loaded via the Skill tool immediately after (the /mnt path does not exist on Windows; the same skill is installed at .claude/plugins/cache/.../frontend-design); brainstorm-tokens-signature process followed for the proofs |
| 3 | Report opens with the gate block or UNFULFILLED | MET | The session report opens with the gate block |
| 4 | BUILD NOTHING: no code, no components, no commits to src | MET | git diff shows zero src changes; mock HTML lives in the session scratchpad, not the repo; the only repo-root artefact (capture-kit-proof.mjs, a Playwright capture script) was deleted before commit |
| 5 | Deliverables: research, three compared patterns, two static PNGs | MET | LAUNCH-KIT-PLAN.md sections 2-6; docs/design/launch-kit-proof/ three PNGs (kit screen at two widths + flow) |
| 6a-6i | A1 for all nine platforms: publish-on-behalf, account type, exact permission | MET | Plan section 2.1 table, per-platform, cited (developers.facebook.com, developers.tiktok.com, docs.x.com, learn.microsoft.com, developers.google.com, reddit.com/dev), all accessed 2026-07-27 |
| 7 | A1 review/approval process and duration per platform | MET | Section 2.1: every regime named; durations marked NOT VERIFIED where officially unpublished (Meta, LinkedIn, YouTube), with dated secondary figures labelled as secondary |
| 8 | A1 explicit ToS prohibitions | MET | Section 2.2: Meta prefill ban, X duplicative-content ban, TikTok cross-poster rejection, Reddit spam patterns, WhatsApp opt-in, all quoted from live policy pages |
| 9 | A1 media constraints | MET | Sections 2.1/2.2: ratios, durations, sizes, caption limits, link handling per platform, cited |
| 10 | Be specific about hard walls (personal IG etc.) | MET | Section 2.2 "The hard walls that shape the product", six named walls |
| 11 | A2 study Buffer, Later, Metricool, Hootsuite, Canva + 2026 tools | MET | Section 3 (plus Publer, SocialBee, Planable, Postiz), from each tool's own help pages |
| 12 | A2 true auto-publish vs manual handoff per tool | MET | Section 3.1; the standardised notification-publishing pattern documented with four tools' own help URLs |
| 13 | A2 per-platform crops and captions handling | MET | Section 3.1 (Buffer does not auto-crop; downgrade-to-notification behaviour); NOT VERIFIED noted where a tool's docs were silent |
| 14 | A2 account-connection onboarding | MET | Section 3.1 onboarding-tax paragraph, cited |
| 15 | A3 human caption practice per platform and event type | MET | Section 4.1 tables, cited, dated |
| 16 | A3 extension of tell lexicon + enforceCopyLaws to captions | MET | Section 4.2: six-step extension incl. new sourced lexicon entries, caption-only validator, no-AI deterministic base, exclamation nuance flagged for founder decision |
| 17 | Research cited, dated, live; NOT VERIFIED where unverifiable | MET | Every claim carries URL + 2026-07-27 access date; NOT VERIFIED appears throughout where true |
| 18 | A4 media intelligence | MET | Section 5: detection, smart crop options incl. sharp/smartcrop.js/Cloudinary, the one-landscape-four-shapes answer, video ceilings, outpainting rejected with cited risk |
| 19 | Three GENUINELY different patterns, no strawmen | MET | Section 6: A (Publisher) and B (Composer) argued at full strength from evidence; C differs on the TIME axis (campaign delivered by push), not a blend |
| 20 | Pattern A as briefed | MET | Section 6, with its real costs enumerated from section 2 |
| 21 | Pattern B as briefed | MET | Section 6 |
| 22 | Pattern C own proposal, argued | MET | Section 6: the Manager; argued as roadmap not launch |
| 23 | Compare on the seven named dimensions | MET | Section 6 comparison table: exactly those dimensions |
| 24 | Recommend ONE + what would change it | MET | B for launch; four named mind-changers |
| 25 | Recommendation honours bootstrap/weeks/ban/review constraints | MET | The recommendation's core argument is those constraints |
| 26 | FILE 1 kit-screen at 1440 AND 390 in docs/design/launch-kit-proof/ | MET | kit-screen-1440.png + kit-screen-390.png (brief named one file at two widths; delivered as two suffixed files, noted) |
| 27 | FILE 1 reads as publishing destination, recommended pattern, design tokens, type roles | MET | The channel desk: status chips, per-shape composed previews, one action per card; tokens from globals.css (gold discrepancy vs the brief's hex reported, token wins) |
| 28 | FILE 1 real composed assets for a real event | MET | Live TEST event "Afrobeats and Brunch: Sunday Sessions", its real cover, real $85 tier, real description facts; the one cover photo genuinely recomposed per shape |
| 29 | FILE 2 publish-flow.png, every state, honest taps | MET | publish-flow.png: stations 0-4, three lanes with per-step tap counts (2 taps / 4 taps), wants-a-clip, fallback, posted states, refusals strip |
| 30 | Read current implementation, report file paths, no rebuild | MET | Plan section 7; nothing existing was modified |
| 31 | Write LAUNCH-KIT-PLAN.md with the six required parts | MET | Sections 2 (API table), 6 (patterns + recommendation), 4-5 (caption + media approach), 7 (exists today), 8 (build sequence with hours) |
| 32 | STOP: report and wait; no renderer, no src, no build drive | MET | No build performed; awaiting founder approval on proofs + recommendation. Docs committed per the mid-task founder directive |
| 33 | No seating file touched | MET | Zero seating paths in the change set |
| 34 | TEST only | MET | Only reads: TEST REST queries for the real event; zero writes to any database |
| 35 | Australian English; no em/en dashes | MET | Grep of plan doc: 0 em, 0 en, 0 exclamation. Mock copy same (the 14 "!" hits are HTML comments + doctype, not copy) |
| 36 | No competitor named in public-facing copy | MET | Proof PNGs name only the platforms being posted to; competitor names confined to internal docs, marked INTERNAL |
| 37 | No fabrication; URL + date per source; NOT VERIFIED discipline | MET | Throughout; secondary sources labelled secondary |
| 38 | Founder vision as premise | MET | Plan section 1 restates it as the bar; the desk + kit-link + honesty lanes are designed to it |

## Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| S1 | No em/en dashes anywhere | MET | Machine-checked on both deliverables (0 hits) |
| S2 | Banned c-word nowhere new | MET | Not present in plan, mocks, or this ledger |
| S3 | No exclamation marks in user-facing copy | MET | Machine-checked (0 in copy) |
| S4 | Funds-holding engine untouched | MET | No payment file in change set |
| S5 | DESIGN-LOCK: no existing surface changed | MET | Zero src changes |
| S6 | Zero AI tells in copy written | MET | Mock captions + plan prose checked against the lexicon; researched tell phrases appear ONLY as quoted lexicon-candidate data in section 4, never in voice |
| S7 | Frontend-design skill: deliberate choices, one signature | MET | Signature element: the channel desk (one photo visibly recomposed per platform shape with status chips); everything else quiet within the locked design system |

## Adversarial pass

- Silent drops: none found; ledger rows 1-38 all appear in the plan or the report.
- Interpretation drift: one naming deviation (kit-screen.png at two widths delivered as two suffixed files), stated, not hidden. One scope note: A1 durations are honestly NOT VERIFIED because no platform publishes them; secondary figures are labelled.
- Match-vs-surpass: vs Eventbrite share flow (auto-post, no event link) and Luma kit (assets + attribution, manual post): the proposed desk is AHEAD on per-platform composed captions + tracked attribution + honest tap states; claim grounded in section 3.2 citations, testable when built.
- Unverifiable claims: "under 60 seconds to first post" is stated as a TARGET with a measurement plan, not a claim of fact.
- Generic test: the desk could not be mistaken for a generic scheduler screen: navy/gold system, the one-photo-every-shape rail, plain-words reach, Australian register.
- AI-tell sweep: 0 in voice (see S6).
- Regression sweep: nothing existing changed.
- Founder-cost test: no dashboard errands created; the one open founder decision (exclamation marks in organiser captions) is flagged with a recommendation, not a question mark.
- Evidence visibility: three PNGs at named paths; the plan at a named path; this ledger at a named path.

## Phase 4 gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.

## Phase 5 decision evidence

Competitor: sections 2-3 (cited, dated). Market: tool pricing + organiser expectations (3.1). Engagement: caption/behaviour research (4.1). Trend: 2026-dated sources throughout. Our code: section 7 file paths. Test plan: section 8 metrics with thresholds and named A/B candidates.
