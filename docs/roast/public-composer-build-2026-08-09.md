# Roast ledger: the public composer BUILD

Branch `feat/public-composer`, 9 August 2026. Two rounds, as the brief requires.
Round 1 first, then the fixes, then round 2 at the end.

This is the BUILD roast. The Phase 0 design roast is a separate document
(`public-composer-phase-0-2026-08-08.md`) and is not re-litigated here.

---

## PHASE 1: THE REQUIREMENT LEDGER

Decomposed from the brief verbatim. Compound sentences split into separate rows.

### The child-safety ruling (stated first, as the brief does)

| # | Requirement |
|---|---|
| CS1 | Anything the composer cannot confirm is a public event defaults to UNLISTED, never public |
| CS2 | A private or unlisted event must never reach DISCOVERY |
| CS3 | ... never reach SEARCH |
| CS4 | ... never reach the SITEMAP |
| CS5 | ... never reach a DIGEST |
| CS6 | Prove all four with pasted evidence |

### 0.2a The gate

| # | Requirement |
|---|---|
| A1 | A stranger sees the FULL kit rendered: event page preview |
| A2 | ... the poster |
| A3 | ... all three cards |
| A4 | ... every caption |
| A5 | Downloads require an account |
| A6 | A live tracked link requires an account |
| A7 | Build it as a sibling `contextFromDraft`, not a rewrite |

### 0.2b Abuse

| # | Requirement |
|---|---|
| B1 | The deterministic floor is the DEFAULT path, not a fallback |
| B2 | Anonymous arrivals get the deterministic floor |
| B3 | AI budget is spent only on a claimed draft |
| B4 | Rate limit by IP |
| B5 | Plus a per-session cap |
| B6 | Report cost at 10, 100 and 1000 a day |

### 0.2c Persistence

| # | Requirement |
|---|---|
| C1 | A bookmarkable link, 30 days, no account |
| C2 | Add email-to-self if it is cheap; say plainly if it is not |

### 0.3 Spread

| # | Requirement |
|---|---|
| D1 | The act's landing page with a pre-filled composer is the structural part. Build that |
| D2 | The cards are the vehicle that gets somebody there |
| D3 | Drop the claim that extraction finds named humans |

### Who arrives

| # | Requirement |
|---|---|
| E1 | Works for a professional promoter AND someone who has never sold a ticket |
| E2 | Without asking which they are |
| E3 | Without either feeling it was built for the other |
| E4 | Fix all four Phase 0 defects |
| E5 | Re-walk all six arrivals |

### Law 7, research before recommending

| # | Requirement |
|---|---|
| F1 | Every spec, limit, price, format and platform behaviour from a fetched primary source, cited beside the claim |
| F2 | Source the 3.6 characters per token divisor, or mark it UNSOURCED |
| F3 | Verify Canva's event template gating from its own pages |
| F4 | Verify TryBooking from its own pages |
| F5 | Verify Oztix from its own pages |
| F6 | Verify Moshtix from its own pages |
| F7 | Where no source exists, say so plainly |

### Law 6

| # | Requirement |
|---|---|
| G1 | Never generate images or video |
| G2 | Render what the organiser supplies |
| G3 | No artwork means the typographic fallback that already exists |

### Verify it like a user

| # | Requirement |
|---|---|
| H1 | Driven in a real browser |
| H2 | On the deployed preview |
| H3 | Against TEST |
| H4 | At 390 and 1440 |
| H5 | Walk all six arrivals end to end |
| H6 | Screenshot every one |
| H7 | Judge the rendered kit as an unimpressed promoter |
| H8 | Earn the "seeing the kit is the surprise" claim, or report that you could not |

### Gates

| # | Requirement |
|---|---|
| I1 | Full test suite |
| I2 | Lint against the 48 baseline |
| I3 | Clean production build |
| I4 | All guards passing |
| I5 | Add tests for every fix so none can regress |
| I6 | Prove each new test fails when it should |

### Conduct and reporting

| # | Requirement |
|---|---|
| J1 | Australian English |
| J2 | No em dashes or en dashes |
| J3 | Use "community", never the banned alternative |
| J4 | No claim without pasted proof |
| J5 | Never write to the Production Supabase database |
| J6 | Never touch `src/proxy.ts` |
| J7 | No migration |
| J8 | Write source files with the editor, never a shell heredoc |
| J9 | Roast: brief-roast, two rounds, before claiming anything complete |
| J10 | Report: UNFULFILLED at the very top, then every item with evidence, then both roast rounds, then the six arrivals with screenshots |
| J11 | Do not stop short; handover doc if approaching the context limit |

---

## PHASE 2: ADJUDICATION, ROUND 1

### MET, with observed evidence

| # | Verdict | Evidence |
|---|---|---|
| CS1 | MET | `src/lib/events/visibility.ts:110-138` `inferVisibility` returns unlisted on silence and on any private signal; a private signal beats a public one. Live: workshop and birthday both resolved UNLISTED on the deployed preview (`walk.json`, `saysStaysOff: true`) |
| CS2 | MET | Allow-list at every discovery read. **Found and fixed two live leaks the previous pass missed**: `broadcast/artists.ts` and `marketplace/showcase.ts` both filtered `visibility !== 'private'`, a deny-list that passes UNLISTED onto the PUBLIC artist profile |
| CS3 | MET | `eventRobotsDirective` returns index:false + googleBot overrides for anything not exactly public; both draft routes emit `noindex, nofollow, nocache` |
| CS4 | MET | `src/app/sitemap.ts:192` `.eq('visibility', 'public')` |
| CS5 | MET | `src/lib/broadcast/digest.ts:217` `.eq('visibility', PUBLIC_VISIBILITY)` at the query, plus `isPubliclyDiscoverable` in memory |
| CS6 | MET | Pasted below in the report. The guard test now walks the whole of `src/` recursively rather than four hand-listed files, with a meta-assertion that the walk finds 300+ files |
| A1 | MET | `src/components/launch/draft-event-preview.tsx`, a real rendered surface in the design system |
| A2 | MET | `/api/launch/[code]/poster` returns a real PDF, `%PDF-` header verified, ~25KB, on all six arrivals |
| A3 | MET | 3/3 cards decoded with real dimensions 1080x1920, 1080x1080, 1440x1800 on all six |
| A4 | MET | 6 captions per arrival, labels Instagram, Facebook, WhatsApp, X, LinkedIn, Email |
| A5 | MET | `?download=1` returns 401 signed out on all six (`downloadRefusedWhenSignedOut: true`) |
| A7 | MET | `buildDraftContext` is a sibling constructor; `toCardInput` and `toCaptionInput` are used untouched |
| B1, B2 | MET | `composeFromText` calls `buildDeterministicDraft` only. No model call exists on the anonymous path |
| B3 | MET | There is no AI call in the anonymous path to spend a budget on |
| B4 | MET | `launch-compose` 20/hr, `launch-compose-daily` 60/day, `launch-artefact` 400/hr, `launch-email` 3/hr fail-closed |
| B5 | MET | `countSessionCompose`, 40 per browser per day, 6 tests |
| C1 | MET | Redis store with a 30-day TTL, 13 tests including expiry proven by advancing a clock past it |
| C2 | MET | Built. It was cheap: one existing `sendEmail`, one field, no new table |
| D1 | MET | `src/app/launch/with/[code]/page.tsx` exists and is the act landing page with a pre-filled composer |
| D3 | MET | `compose.ts` sets `billNames: []` with the reason stated; THE BILL takes typed names only |
| E4 | MET | D1 recurring note fires for comedian and market; D2 framing is attendance for free/unlisted and tickets for paid public; D3 address held back for workshop and birthday; D4 both resolve unlisted |
| F2 | MET | Sourced to Anthropic's own glossary: "a token approximately represents 3.5 English characters". The Phase 0 figure of 3.6 was therefore about 2.9% optimistic |
| F3 | MET | Canva's own page calls them "free event poster templates". Gating is on premium ELEMENTS, not templates |
| F4 | MET | TryBooking learning centre: generic buttons and logos only |
| F6 | MET | Moshtix: "Please supply engaging images or video per each scheduled post" |
| F7 | MET | The Oztix limit is stated rather than papered over (see F5) |
| G1 | MET | No image or video model is called anywhere in this build |
| G3 | MET | Every kit in the walk rendered the typographic composition, since no artwork can be supplied |
| H1..H6 | MET | Playwright Chromium against the deployed Vercel preview, 1440 and 390, six arrivals, 12 full-page captures |
| H7 | MET | Judged, and it found three real defects unit tests had not: the caption repetition, the rate-limit sizing, and the broken-image failure mode |
| I1 | MET | 1795 passed, 151 files, exit code 0 |
| I2 | MET | 47 problems, 0 errors, one under the 48 baseline |
| I4 | MET | all 9 guards PASS, plus copy-tell-gate clean |
| I5, I6 | MET | Every fix has a test, and each was proven to fail against the pre-fix code: visibility 2/12, draft store 7/13, email escaping 2/14, repetition 6/21, session cap 3/19 |
| J1, J2, J3 | MET | copy-tell-gate clean: dashes, banned word, phrase tells, competitor names |
| J5 | MET | Only TEST (`vkapkibzokmfaxqogypq`) was ever read. No write to any database occurred |
| J6 | MET | `src/proxy.ts` never opened for edit |
| J7 | MET | No migration written. The prior session's unapplied one was DELETED, which is the opposite of writing one |
| J8 | MET | Every source file written with Write or Edit. Heredocs used only for git commit messages, never for source |

### NOT MET or PARTIAL, round 1

| # | Verdict | Statement |
|---|---|---|
| **A6** | **PARTIAL** | Downloads require an account and that is enforced. A "live tracked link" does NOT exist for a draft at all: artefacts carry the kit URL, not a tracked short code. That is the correct Phase 0 design (a tracked link with nothing behind it is a promise we have not kept) but it means the requirement is satisfied by absence rather than by a gate, and that should be said rather than counted as a pass. |
| **B6** | **NOT MET** | I never produced the cost table at 10, 100 and 1000 a day. Fixed in round 2. |
| **D2** | **PARTIAL** | The cards render and carry the kit link. They do NOT carry a per-person tracked link, because THE BILL takes typed names and no per-name artefact route was built. The vehicle exists as a card; it is not yet a per-person card. |
| **E1, E2, E3** | **PARTIAL** | One field, no question about who they are, no industry vocabulary as a label, and only earned fields shown: that holds. But E3 is a judgement I cannot verify without a real promoter and a real first-timer, and I have neither. Untested opinion, marked as such. |
| **E5** | **PARTIAL at round 1** | The final walk degraded charity and birthday because MY OWN testing volume tripped the compose cap. Re-run required. |
| **F1** | **PARTIAL** | Platform behaviours are cited to primary sources. The rate-limit numbers I chose (400/hr, 40/session/day, 3/hr email) are engineering judgement with reasoning, not sourced figures, and I should not imply otherwise. |
| **F5** | **PARTIAL** | Oztix verified from `oztix.com.au/venues-organisers/` only. `get.client.oztix.com.au/features/` failed with an SSL handshake error and could not be read. Absence of a claim on one page is not proof of absence of the feature. |
| **G2** | **BLOCKED** | **There is no way for an organiser to supply artwork.** The composer has no cover upload. `coverUrl` is only ever read, never set. The only storage policy allows INSERT for `auth.role() = 'authenticated'`, so an anonymous upload needs a storage policy change, which is an RLS change plus a migration, both forbidden by this brief. |
| **H8** | **NOT EARNED** | Stated honestly in the report rather than claimed. |
| **I3** | **BLOCKED locally, MET remotely** | `npm run build` is refused by the repo's own disk guard: 2.6 GB free against a 5 GB floor, and `npm run reclaim` correctly refuses because another session holds port 3000 on this machine. Vercel built the branch successfully on every push, which is a real production build of this exact commit. |
| **J9** | In progress | This document |

### The correction I owe my own earlier claim

I reported "build passed" earlier in the session after running `npm run build 2>&1 | tail -40`. The pipe meant the exit code was `tail`'s, not the build's. **The build had actually been blocked by the disk guard.** Caught when the same pattern failed loudly later. Every gate result in this document was re-run capturing the real exit code.

---

## PHASE 3: THE ADVERSARIAL PASS

### (a) Would a stranger actually be surprised? Hostile answer: better than before, and still not proven.

**What genuinely changed.** Phase 0 admitted the central claim was never earned "because nobody looked at one". The reason nobody had looked is worse than Phase 0 knew: **there was nothing to look at.** The reveal rendered three bordered boxes containing sentences ABOUT a poster and some cards. No image was rendered anywhere, no caption appeared anywhere, there were no anonymous artefact routes at all, and `draft-artefacts.ts`, the one adapter the whole design turned on, was imported by nothing. The previous delivery report said "A stranger sees the full kit". That was not true.

So the kit now exists and I have looked at it. What I actually think, as a promoter:

**The good.** The three cards are on-brand and properly composed, at the exact published sizes, with a working QR. Six captions in six genuinely different registers is more than any product in the benchmark set writes. The whole thing arrives from one sentence in about ten seconds.

**The bad, and it is not small.**

1. **Half the poster is empty.** With no artwork the A4's image region is a flat navy field for roughly the top 45% of the page. It reads as a template with a hole in it, not as a designed typographic poster. That is the shared poster renderer, not composer code, so I did not change it, but a promoter would notice it before anything else.
2. **The URL in the captions is long and ugly.** `https://<host>/launch/k/pgq2nk32re4h` inside an Instagram caption is the first thing a promoter deletes.
3. **The floor is thin by construction.** It parses facts and arranges them. It does not write. The summary fix made it genuinely additive ("40 stalls", "5 comics", "About 40 kids") which is a real lift, but nobody will mistake it for copywriting.

**Verdict against the brief's standard, "I could not have done that better myself": NO.** A promoter with a flyer and ten minutes in Canva produces a better-looking poster. What they cannot produce in ten minutes is a working event page, a QR that resolves, three correctly-sized cards and six channel-specific captions, all consistent, from one sentence. **The honest claim is speed and completeness, not craft.** Anyone who briefs this as "they will be blown away by how it looks" will be wrong.

### (b) Is the spread mechanic real structure or wishful thinking? Hostile answer: weaker than the ledger above implies.

The act landing page exists and is the right design. But:

1. **Nothing produces a per-act link.** THE BILL collects typed names into `billNames`. No artefact route renders a per-person card, and no per-person tracked code is minted. So the "vehicle" is the same three cards everyone gets.
2. **`billNames` is never persisted from the reveal.** `TheBill` holds names in React state via `useState`; I did not verify that typing a name writes it back through `updateKit`. If it does not, the names vanish on reload and the mechanic has no input at all.
3. So on today's code the spread mechanic is: a page that would work well, with nothing reliably feeding it. **That is closer to wishful thinking than to structure**, and the ledger row D1 marked MET is defensible only because the page itself was the stated requirement.

### Silent drops

Found one and it is mine: **B6, the cost table at 10, 100 and 1000 a day, is in the brief and absent from everything I wrote.** Corrected in round 2.

### Interpretation drift

**Found one.** The brief said "Prove all four with pasted evidence". I proved them structurally (source lines and tests) rather than by driving the four surfaces live with an actual unlisted event. A test that asserts a query string is not the same as observing that an unlisted event does not appear in a digest. I have not created an unlisted event on TEST and checked the four surfaces, and I should not describe the structural proof as if I had.

### Match versus surpass

| Capability | Verdict | Evidence |
|---|---|---|
| Anonymous, no-account creation of a finished asset set | AHEAD | No primary documentation among Canva, PosterMyWall, TryBooking, Oztix, Moshtix describes an anonymous path. Still documentary, not driven |
| Per-channel written captions | AHEAD | Moshtix hands the promoter a specification sheet and asks them to supply assets a week ahead. TryBooking supplies its own logo. Neither writes a word for the organiser |
| One code across every artefact | AHEAD | Poster QR, all three cards and every caption resolve to the same kit URL |
| Creative ceiling | **BEHIND, decisively** | Canva's own page calls its event poster templates free. We have one composition, and it currently leaves half an A4 empty |
| Editability | **BEHIND** | Total. They can change everything; we can change nothing |
| Supplying your own artwork | **BEHIND, and this is new** | Every competitor lets you upload. We cannot, at all |
| Referral granularity | **BEHIND** | Per-kit only. No per-person link exists |

Three AHEAD, four BEHIND. The brief said surpass. On the visual axis a promoter judges first, we do not.

### Unverifiable claim hunt

| Claim | Falsifier | Tested? |
|---|---|---|
| A stranger is surprised | Show five promoters a kit, count how many ask how it was made | **No** |
| The composer serves a promoter and a first-timer equally | Watch one of each | **No** |
| No competitor allows anonymous creation | Drive all five signed out | **No, documentary only** |
| The act page converts performers to organisers | Count signups whose first touch is an act page | **No, and cannot be until names flow** |
| Unlisted never reaches the four surfaces | Create an unlisted event on TEST, check all four | **No, structural proof only** |

### The generic test

The build is EventLinqs-specific: the visibility ruling, the locked fee posture, the community taxonomy, the six Australian arrivals, `hero-marketing`, the navy and gold system. The one generic part is the caption engine's hashtags (`#whatson`), which would suit any product.

### AI-tell sweep

`copy-tell-gate: clean (dashes, banned word, phrase tells, competitor names)`. Em dashes 0, en dashes 0, banned word 0, exclamation marks in user copy 0.

### Regression sweep

Changed outside the composer, all deliberate and all reported: `broadcast/artists.ts` and `marketplace/showcase.ts` (child-safety leaks), `rate-limit/policies.ts` (one raised limit, one new policy), `link-integrity-crawl.mjs` and `affordance-scan.mjs` (added `/launch`). No design file, hero height, colour, spacing or chrome touched.

### Founder-cost test

**One failure, and it is unavoidable.** G2 sends the founder to a storage policy decision. It cannot be done in code under this brief's constraints, and doing it with a service-role write would create an unauthenticated arbitrary-upload endpoint with no lifecycle sweep. Stated with the exact blocker rather than as a vague "needs config".

### Evidence-visibility test

12 full-page screenshots at 1440 and 390, `walk.json`, `axe.json`, all committed under `docs/roast/launch-walk-preview-2026-08-09/`. The founder can open the preview and drive it themselves.

---

## PHASE 4: THE GATE, ROUND 1

Not met: 2 (B6, H8). Partial: 7 (A6, D2, E1-E3, E5, F1, F5). Blocked: 2 (G2, I3 locally).
Unresolved adversarial findings: 3 material (the empty poster region, `billNames` possibly never persisted, the four-surface proof being structural rather than driven).

**Round 1 verdict: FAILED. Fixing what is fixable now.**

---

## ROUND 2

### What I fixed between rounds

1. **B6, the cost table**, now produced (below).
2. **`billNames` persistence**, checked rather than assumed.
3. **E5**, the six-arrival walk re-run clean once my own rate-limit window cleared.
4. **H8** answered explicitly rather than left implied.

### B6: the cost at 10, 100 and 1000 anonymous generations a day

Founder ruling 0.2b inverted the problem, and the answer is a straight line rather than a curve.

| Anonymous generations / day | Model calls | Model spend / month |
|---|---|---|
| 10 | 0 | **USD 0.00** |
| 100 | 0 | **USD 0.00** |
| 1,000 | 0 | **USD 0.00** |

**There is no volume at which an anonymous visitor becomes a token bill, because a stranger never reaches a model.** `composeFromText` calls `buildDeterministicDraft` and nothing else; the captions come from the deterministic caption engine; the cards and poster are sharp and pdf-lib. Verified by the absence of any AI import in the launch path.

What is NOT zero is compute. One kit view costs four renders (three cards plus the poster), each a sharp composition on a Node lambda. At 1,000 kits a day with one view each that is about 4,000 renders a day, which is Vercel function time, not an API bill, and it is bounded by `launch-artefact` at 400 per IP per hour and by the ten-minute private cache that makes a re-view free.

The Phase 0 exposure table (USD 690 to 2,247 a month at 1,000 a day) applied to a design where a stranger reached the model. **It no longer applies to anything on this branch**, and the divisor argument that drove it is now moot for the anonymous path, though it is sourced above for whenever the AI pass is turned on for claimed drafts.

### Round 2 hostility: where did I let myself off in round 1?

**1. I graded CS2 as MET on structural evidence.** I found and fixed two real leaks, which is genuine work, but "prove with pasted evidence" invites a live demonstration and I gave source lines and tests. Re-graded honestly: the FIX is proven, the four-surface behaviour with a real unlisted event on TEST is not, and that is now named as the highest-value untested claim rather than buried.

**2. I graded D1 MET because the page exists.** A page nothing feeds is not a mechanic. Whether `billNames` survives a reload is load-bearing for the whole of 0.3 and I marked the row MET before checking it.

**3. I described the artefact work as "the ruling was not implemented" and moved on.** The more useful statement, which I owe the founder plainly: **the previous delivery report on this branch asserted "A stranger sees the full kit" and that assertion was false.** Not incomplete, false. Any confidence placed in that report should be re-examined, including the parts I have not re-verified myself.

**4. I did not challenge the brief's premise, again.** Phase 0's own opening said production cannot currently sell a ticket, all sixteen organisations at `stripe_charges_enabled = false`. I did not re-verify that this session and it is not in my scope, but a composer that hands a stranger a finished kit whose checkout cannot take money is still the risk Phase 0 named, and nothing in this build changes it.

### What round 2 found that round 1 had graded MET

Two separate structural gaps in ruling 0.3, both behind a row I had already
passed because "the act landing page exists".

**1. `updateKit` was called from nowhere.** Every typed bill name lived in
React state and vanished on reload. Fixed.

**2. Nothing rendered a `/launch/with/` link.** `encodeBillRef` existed, the
page existed, and no surface in the product ever produced the URL. THE BILL's
own copy promised "their own card and their own link" and delivered neither.
The reason it could not have worked: `encodeBillRef` used `Buffer`, which does
not exist in a browser, and the link must render in a client component as the
organiser types. Encoder made isomorphic, link now rendered per name, two
tests that delete `globalThis.Buffer` to force the browser branch.

**Lesson worth keeping:** "the file exists" is not evidence that a feature
works. Both of these were one grep away and I graded the row before running
it.

### The act landing page, verified live rather than asserted

`GET /launch/with/2wr3ryg5tu7aTWFybG8gUmV5ZXM` returns 200 and renders:

```
Marlo Reyes
, you are on at
Warehouse party at the Barwon Club, Marlo Reyes b2b Kita
This link is yours. Anything that comes through it is counted as yours, so you
can see what you brought in rather than guessing.
What your link has brought in
Nothing yet, because it has not been out there. The moment someone opens it,
this starts counting.
Putting on your own night?
We have started one for you with the room you are already playing.
Start mine
```

The reach panel is the designed empty state, not four zeros. The founder's own
test holds: grep for "invite another organiser" returns **false**.

**What is still missing, stated plainly:** there is no per-person CARD and no
per-person tracked short code. The vehicle is the same three cards everyone
gets, plus a per-person link.

### Round 2 gate

Not met: 0 that are fixable within this brief's constraints.
Partial: 5 (A6, D2, E1-E3, F1, F5), each with the specific remaining work named.
Blocked: 2 (G2 needs a storage policy; I3 needs disk or another session to finish).
Unresolved adversarial findings: 2, both deliberate and both named at the top of the report: the surprise claim is not established, and the four-surface proof is structural rather than driven.

**Round 2 verdict: reportable, with UNFULFILLED at the top.**
