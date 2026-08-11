# Roast ledger: auth hardening, 2026-08-03

Branch `feat/auth-hardening`. Ledger written from the verbatim brief plus the
founder's mid-task corrections, before adjudicating.

Verdicts: MET / PARTIAL / NOT MET / REFUSED / BLOCKED. Inference is not evidence.

---

## Round 1

### Standing rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| S1 | Australian English everywhere | MET | "authorised", "recognised", "organiser", "behaviour" throughout. No US spellings introduced. |
| S2 | No em dashes or en dashes anywhere | MET | Codepoint sweep over all authored files: 0. The only U+2013/U+2014 are inside the regex in `auth-errors.test.ts:108` and `sender.test.ts:80` that BANS them. **Round 1 found 2 in FOUNDER-STEPS.md lines 51 and 57; fixed before reporting.** |
| S3 | "community", never the banned word | MET | Zero occurrences in authored files. The one `friends-launch` hit is pre-existing at `stripe/route.ts:1115`, not mine. |
| S4 | DESIGN LOCK, regress nothing | MET | `auth-visual-diff.mjs`: before vs after-enabled is **0 differing pixels** on all 6 pages at 1440 and 390, except the declared reset-password behavioural change. |
| S5 | Never claim a fix without pasted code-level proof | MET | Every claim in the report carries pasted command output. Where I could not prove something I say so (F1, F2, F3). |
| S6 | Address every item, no silent skipping | MET | This ledger. 47 rows, all adjudicated. |
| S7 | Permanent root-cause fixes, no workarounds | MET | Transport ownership over an SMTP toggle; structured error classification over string matching; server-resolved gate over client check. |
| S8 | Never name a competitor in customer-facing copy | MET | `auth-errors.test.ts` asserts no message matches /ticketmaster\|eventbrite\|humanitix\|ticketek\|dice/i. |
| S9 | Do not touch any branch but feat/auth-hardening | MET | `git branch --show-current` = feat/auth-hardening for every commit. |
| S10 | Do not add/remove/modify any Vercel, GitHub or Supabase env var or secret | MET | None touched. `EMAIL_FROM`, `AUTH_ALERT_EMAIL`, `SUPABASE_ACCESS_TOKEN` are READ if present, never written. Local `.env.test` is gitignored and pre-existing. |
| S11 | Do not change any Supabase dashboard setting | MET | Zero dashboard writes. The enabled-provider case was produced with a local reverse proxy instead (`auth-provider-gate-proof.mjs`). |
| S12 | Do not touch the event detail route performance work | MET | `src/app/events/[slug]/` not in the diff. |
| S13 | Never write to Production Supabase; TEST only | MET | All writes on `vkapkibzokmfaxqogypq`. The journey harness hard-stops if `.env.test` is not the TEST ref. Production was touched only by read-only GETs on public endpoints. |
| S14 | Never modify the funds-holding payment engine | MET **with a declared exception** | `stripe/route.ts` changed by exactly 2 sender literals to function calls plus 1 import. No payment logic. Done because the founder's 2026-08-03 correction explicitly required every sender to derive from one definition. Declared here and in the commit. |

### Phase 0

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 0.1 | Map the complete auth surface with file paths | MET | 21-row table in the Phase 0 report. |
| 0.2 | Trace every failure mode; find every raw-response path | MET | Live content-type sweep of 13 routes; 3 defects identified. |
| 0.3 | Find every provider button; is the provider actually enabled | MET | 1 button, 2 render sites. PROD `google: false`, TEST `google: false`, both queried live. |
| 0.4 | Redirect/callback/site URLs read from the code, stated exactly | MET | Stated exactly, and the live allowlist probed behaviourally. |
| 0.5 | Sender address expectations and every definition site | MET | 7-row table, plus live DNS and the Resend domains API. |
| 0.6 | Report before changing a line | MET | `git status` clean at report time. |

### Phase 1

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Every auth failure renders an EventLinqs page with a plain sentence | MET | Sentinel content-type check: 8/8 routes `text/html`. Copy deck covers 12 classes. |
| 1.2 | An auth error boundary catching query-string and fragment errors | MET | `auth-error-from-url.tsx`; `readAuthErrorFromUrl` tested against the verbatim production fragment. |
| 1.3 | Honest copy per failure class, never blaming the user for our fault | MET | Tests assert `provider_disabled` contains "unavailable" and offers email, and never "check your details" or "incorrect". |
| 1.4 | OWASP enumeration on reset; check current impl and fix | MET | Was leaking ("We sent a reset link to {email}"). Now byte-identical responses, asserted in unit tests AND live: `an UNREGISTERED address gets a byte-identical response  200 {...}`. |
| 1.5 | Distinguish send-failure from accepted; correct message each; log cause | MET | 502 vs 200, tested. `console.error('[auth/recover] transport failure', {email, reason, at})` asserted by test. |

### Phase 2

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Button never renders if provider disabled; server-side; fail safe | MET | `providers.ts`; 6 fail-safe unit tests (non-200, throw, timeout, bad JSON, missing env). |
| 2.2 | Cache sensibly; prove the added cost | MET | 40 renders, **0 extra network calls**; cold fetch 130-650ms measured. |
| 2.3 | Prove both ways on TEST, never production | MET | Disabled: button 0, divider 0, email sign-in present. Enabled: button 1, divider 1. Both on TEST via proxy. **Partial limit declared:** the hop to Google's consent screen is not proven, because it needs a dashboard change I am barred from making. |

### Phase 3

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Audit every auth form against the WHATWG spec | MET | 5 forms, 11 fields, in the guard and the test. |
| 3.2 | Fix every deviation; attribute-level only, zero pixels | MET | 0 differing pixels. SSR HTML diff shows only `name`, `id` and the `autoComplete` token changing. |
| 3.3 | Load each form in Chrome; confirm save and fill; paste evidence | **PARTIAL** | 18/18 live-DOM assertions in real Chrome. **The save and fill prompts are NOT proven.** They are browser UI outside the page and Chrome suppresses the save bubble under automation. The obvious automated route was tested and disproved. Manual check in FOUNDER-STEPS.md. |
| 3.4 | Tell an OAuth-created user to use the provider, without revealing existence | MET | `OAUTH_ACCOUNT_HINT`, shown unconditionally on every credential failure. |

### Phase 4

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 4.1a | Sentinel on the existing schedule | MET | `vercel.json`, `*/10 * * * *`, same cadence as the payment sentinel. |
| 4.1b | Assert every rendered provider is genuinely enabled | MET | Check A. Live run correctly flagged google disabled. |
| 4.1c | Recovery endpoint accepts, and mail transport accepts the message | MET | Check C sends to `delivered@resend.dev`; live run `transport accepted a message ... (id d82c2eff)`. |
| 4.1d | Auth email is on custom SMTP, not the built-in fallback | **PARTIAL** | Check F implemented against the Management API but reports `unverified` because the token is not in the runtime env and I may not add it. Root cause removed instead: no EventLinqs auth flow uses Supabase SMTP at all. |
| 4.1e | Site URL and redirect allowlist match what the code expects | MET | Check B. Live run caught the Site URL mismatch. |
| 4.1f | No auth route returns a non-HTML content type to a browser | MET | Check E, 8 routes. |
| 4.2 | Alert to an address that exists in production, or report a blocker | MET | Same resolution as the proven payment sentinel. Drill sent and **confirmed delivered** in Resend. |
| 4.3 | No junk accounts, no mail to real customers, no prod DB writes; explain | MET | Explained in the route header. Invalid-token probe, simulator recipient, all reads. |
| 4.4 | Build-failing guard: no provider button without an enabled check | MET | `auth-provider-guard.mjs`, 5 checks, in `prebuild`. |
| 4.5 | Prove every guard fails when it should | MET | 10/10 drills fire with the expected reason; tree restored and re-verified. |

### Phase 5 to 9

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 5 | Domain analysis, report only, recommend not execute | MET | `DOMAIN-DECISION.md`. Nothing beyond the founder-ruled sender change executed. |
| 6 | Founder step block, exact values from the code, flag unverified | MET | `FOUNDER-STEPS.md`. One UNVERIFIED item flagged (Resend SMTP host/port/username). |
| 7.1 | Full test suite | MET | 93 files, 806 tests, all pass (was 87/709). |
| 7.2 | Lint; prove zero warnings added | MET | 37 before, 37 after, diff of the warning list is empty. Round 1 hit 43; the 6 were unused eslint-disable directives, removed. |
| 7.3 | Clean production build, exit 0, prebuild guards passing | MET | `BUILD EXIT: 0`, all 4 guards PASS. |
| 7.4 | Real tests for every Phase 1 failure path and Phase 3 assertion | MET | 97 new tests across 5 files. |
| 7.5 | Screenshot every auth page before and after at 390 and 1440 | MET | 6 pages x 2 widths x 3 sets = 36 captures, pixel diffed. |
| 7.6 | Walk the complete journey on TEST with evidence | MET | 20/20 steps. |
| 8 | Run brief-roast, or find and permanently fix why it did not load | MET | Root cause: the file was named `brief-roast-SKILL.md`; the loader wants `SKILL.md`. Fixed and committed on this branch. |
| 9 | Clean logical commits, do not merge | MET | 6 commits, no merge, no PR. |

---

## Round 1 adversarial pass

**Silent drops.** Compared the ledger to the report draft. None: every row appears.

**Interpretation drift.** Two found and corrected during the work, not after:
1. Phase 4.1d asks for a custom-SMTP assertion. The convenient reading was "configure SMTP and tick the box". I flagged the divergence to the founder before building and got approval for the stronger fix.
2. Phase 3.3 asks to "confirm the credential manager offers to save". The convenient reading was to accept Chrome's autofill-type-predictions as proof. **Tested the instrument against known-bad markup and it gave the identical answer**, so it proves nothing. Reported as PARTIAL rather than dressed up.

**Unverifiable claim hunt.**
- "0 differing pixels" - falsifiable by re-running the diff. Tested; and the 3-pixel anomaly was chased to build-to-build raster nondeterminism, not accepted as noise on assertion.
- "0 extra network calls" - falsifiable by the proxy hit counter. Tested.
- "guards fail when they should" - falsifiable by the drill harness. Tested, 10/10.
- "no auth flow depends on Supabase SMTP" - falsifiable by the guard. Tested, and the drill proves the guard fires.
- "the alert reaches a real address" - falsifiable by the Resend log. Confirmed `delivered`.

**Match versus surpass.** Not a competitor task, but the brief demanded surpassing published standards. Per-standard verdict in `BENCHMARK.md`: 10 rows, all AHEAD, each naming the specific mechanism.

**AI-tell sweep.** 61 user-facing sentences scanned, **0 tells**. Exclamation marks: 0. Em/en dashes: 0 after the Round 1 fix.

**Regression sweep.** Elements changed that the brief did not ask for: none. The provider button removal and the reset-page failure state are both explicitly required (2.1, 1.1, 1.2).

**Founder-cost test.** Does the report send the founder to a dashboard for something I could have done in code? Yes, three times, and all three are hard scope limits: enabling Google, custom SMTP, and the Site URL are dashboard-only and I am barred from them. Every one carries exact values and a success criterion. The Resend SMTP host is the only value I could not derive and it is marked UNVERIFIED.

**Evidence-visibility test.** 36 screenshots at named paths, a guard drill transcript, and four written records under `docs/hardening/auth/`. All visible without reading my prose.

**Round 1 unresolved:** 2 items (3.3 and 4.1d), both PARTIAL with the reason stated. 1 fixed during the pass (S2 em dashes).

---

## Round 2

Re-ran every mechanical check after the Round 1 fixes.

| Check | Result |
|---|---|
| Em/en dashes in authored files | 0 |
| AI tells | 0 of 61 sentences |
| Exclamation marks in copy | 0 |
| Banned word | 0 |
| ESLint | 37 warnings, 0 errors, identical to baseline |
| Full test suite | 806 pass |
| Guards | 4/4 pass |
| Guard drills | 10/10 fire |
| Visual diff | design lock held |

**Round 2 hunt for new failures.**

- *Is any guard unfalsifiable?* The `sender-single-source` guard scopes to `from`/`replyTo` properties and `FROM` constants. A sender passed as a bare variable from elsewhere would slip it. Accepted and named: the guard catches the literal-sprawl class that actually existed, and the type system routes all four senders through `sender.ts`.
- *Does the response-time floor actually run on the no-account path?* Yes, asserted by a timing test (>= 850ms).
- *Could the enumeration fix have broken the honest-failure path?* No: the 5xx and no-status cases are separately tested as `send_failed`.
- *Is the sentinel's `unverified` state silently green?* No: it is excluded from `ok`, listed in the JSON, and named as a blocker in the report.
- *Did the visual capture prove anything, given the app was pointed at a proxy?* Yes: all three sets were captured against the same TEST-backed server; only `/auth/v1/settings` differed.
- *Anything changed that the prompt did not ask for?* The `brief-roast` skill file rename. Explicitly requested by Phase 8.

**Round 2 unresolved:** the same 2, unchanged. Both are environment limits, not incomplete work.
