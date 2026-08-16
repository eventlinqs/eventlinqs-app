# Roast ledger: the signup generic error

Task: the founder could not sign up as an organiser on production. Every signup
failure collapsed into "Something went wrong on our side."

Branch `feat/launch-kit-artefacts`, commits f4afff8, 52a8d5c, abde90f, d9e08da.

## Phase 1: the requirement ledger

Decomposed from the brief verbatim. Compound requirements split.

### JOB 1: find out why it actually failed

1. Read the signup path end to end: the form, the action, the Supabase call, the email send, every rate limit, every guard.
2. Enumerate every condition that produces that generic message.
3. Say which of those conditions are reachable in production today.
4. Determine whether THIS attempt failed because the email already exists, or for another reason.
5. If you have log access, use it. If not, say so.
6. Reproduce on TEST with an email that already exists and one that does not.
7. Report which reproduces the founder's exact message.

### JOB 2: the message itself

8. Fix the collapse: every failure must stop resolving to one sentence that says nothing.
9. Research it properly BEFORE designing: fetch how Eventbrite, Humanitix and TryBooking handle a failed signup.
10. Cite what you find.
11. Be aware account enumeration pulls against clarity; say how you resolve the tension rather than picking a side silently.
12. At minimum a person must know whether to try a different email, a different password, wait, or contact us.
13. Cover every case and say what each now shows: email already registered.
14. ... password fails the policy.
15. ... the rate limiter fired.
16. ... the verification email could not be sent.
17. ... Supabase was unreachable.
18. ... anything else you find.
19. Walk it in a real browser on the DEPLOYED PREVIEW.
20. At 390 and at 1440.
21. Trigger every case.
22. Screenshot what a person sees.
23. Standing rule: not done until each message has been seen on screen.
24. Add a test per case so none can regress into the generic message again.

### Standing rules that apply without being restated

25. Law 0: read the governing constitution sections and STATE which laws govern, before editing.
26. Law 0: verify-first, state how the result will be verified, confirm against the real environment.
27. Australian English; no em-dashes or en-dashes anywhere; no exclamation marks in user-facing copy; the word "culture" banned.
28. Law 5: zero dead links. Every link rendered must resolve 200.
29. Law 1 / Definition of Done: no placeholders, nothing partial reported as done.
30. TEST-only writes. Never write to the production database.
31. axe-core 0 serious/critical violations; touch targets 44px or larger.
32. Gates: typecheck, lint, tests, build.

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Read `src/app/(auth)/signup/page.tsx`, `src/components/auth/signup-form.tsx`, `src/app/api/auth/signup/route.ts`, `src/lib/auth/auth-errors.ts`, `src/lib/rate-limit/middleware.ts` + `policies.ts`, `src/lib/redis/rate-limit.ts`, `src/lib/supabase/admin.ts` + `env.ts`, `src/lib/email/auth-emails.ts` + `send.ts`, `src/lib/auth/safe-origin.ts`, `src/lib/auth/dispatch-auth-link.ts`. |
| 2 | MET | Seven producing conditions enumerated in the report table and in `docs/auth/SIGNUP-FAILURE-CONTRACT.md`. |
| 3 | MET | Reachability stated per condition; the `email_exists` and `weak_password` paths proven reachable by TEST reproduction, the missing-service-role path by reading `createClient` throw behaviour. |
| 4 | MET | Production runtime log, 2026-08-08 20:01:08 UTC, `POST /api/auth/signup 400`, `reason: 'A user with this email address has already been registered'`. One occurrence, one user, in a 7-day window. |
| 5 | MET | Vercel MCP runtime logs used; project `prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ`, deployment `dpl_2W29Vbb3TQ8zoy6cC8MbwJsxwKHL`. Log access existed and was used. |
| 6 | MET | `probe-signup.cjs` against TEST: existing address returns `email_exists`/422; fresh address succeeds with a minted token; a third probe covered the unconfirmed-account case. |
| 7 | MET | The existing-address case reproduces the exact message; the fresh address does not fail at all. All three substring tests print `false`. |
| 8 | MET | `classifySignupError` in `src/lib/auth/auth-errors.ts` returns `Exclude<AuthFailureClass,'unknown'>`; the generic sentence is unreachable from this route. Swept by the test at `tests/unit/auth/signup-failures.test.ts` "not one failure in this suite showed the generic sentence". |
| 9 | MET | All three walked live in a browser on 2026-08-09 before the design was written. |
| 10 | MET | Cited in `docs/auth/SIGNUP-FAILURE-CONTRACT.md` with URLs and verbatim observations. |
| 11 | MET | Resolved in the "Account enumeration" section of the contract doc and in the `classifySignupError` docblock, with the reasoning stated rather than the side picked. |
| 12 | MET | Test "every sentence shown tells the person what to do next" asserts every message matches /try again\|sign in\|check\|wait\|choose\|enter\|contact/. It failed twice during the build and forced two copy rewrites. |
| 13 | MET | 409, own sentence, under the email field, with Sign in and Reset your password links. |
| 14 | MET | Both bounds: `weak_password` and `password_too_long`. |
| 15 | MET | 429 with the real Retry-After, and the machine token no longer reaches the screen. |
| 16 | MET | 502 `mail_transport_failed`, account rolled back. |
| 17 | MET | 503 `service_unavailable`, covering thrown fetch, status 0, 5xx, and a missing service-role key. |
| 18 | MET | Four found and fixed: the `rate_limited` token leak; the uncaught admin-client throw; both schema ceilings answered by the floor's message; error messages surviving the correction. Plus one found and fixed outside the form: WCAG AA contrast on every auth alert. |
| 19 | MET | All walks against `https://eventlinqs-app-git-feat-launch-ef8ee0-...vercel.app`, the deployed preview. |
| 20 | MET | Both viewports for every case. |
| 21 | MET | Nine cases. Five live end to end, four stubbed with the payloads the route returns, labelled. |
| 22 | MET | 18 PNGs in `docs/auth/walk-2026-08-09/`. |
| 23 | MET | Each message read off the captures and printed in the walk output. |
| 24 | MET | 26 tests in `tests/unit/auth/signup-failures.test.ts`. |
| 25 | **NOT MET** | I invoked systematic-debugging and read the constitution sections, but I never stated in the session which laws govern this task before editing. Law 0 item 2 is explicit that this is required and that failing to name them means not enough was read. Recorded here rather than quietly skipped. Governing laws, stated now: Law 0, Definition of Done, Law 1 (no generic), Law 2 (evidence-driven, the competitor research), Law 5 (zero dead links, the recovery links), Copy and banned content, Design system (the colour token), Verification and gates. |
| 26 | MET | Verification stated before writing code (logs, then TEST reproduction, then browser walk) and confirmed against the real environment throughout. |
| 27 | MET | Dash scan across all changed files: 0. No exclamation marks in the copy deck. No occurrence of the banned word in any changed file. |
| 28 | MET | `/contact` 200, `/login?email=...` 200, `/forgot-password?email=...` 200, `/signup?role=organiser` 200. The Sign in link was additionally clicked through in a browser and lands prefilled. |
| 29 | MET | No placeholders introduced. Partial items are named in this ledger. |
| 30 | MET | Only the TEST project was written to. Probe users created were deleted. Production was read-only (runtime logs). |
| 31 | MET | `scripts/verify/signup-error-axe.mjs`: 0 violations at both viewports in both error states, after fixing the 4.13:1 contrast failure it found. |
| 32 | MET | tsc clean, eslint clean on changed files (2 pre-existing warnings elsewhere, unrelated), 1514 tests pass, production build succeeds. |

## Phase 3: the adversarial pass

**Silent drops.** Requirement 25 was about to go unmentioned. It is now the first
thing in the report. Nothing else in the ledger is absent from the report.

**Interpretation drift.** One genuine instance. The brief says "research it
properly under Law 7". **There is no Law 7.** The constitution has Laws 0 to 5.
I did not invent one or quietly skip the instruction: I read it as Law 2
(evidence-driven, capture the competitor before you design) and did the research
that Law 2 demands, first-hand and before writing any copy. The founder should
know the reference does not resolve, in case a law was intended to be added and
was not.

Second, smaller: the brief said "trigger every case" in a real browser. Four
cases cannot be triggered on a running preview (our mail transport, a Supabase
outage, an unmodelled GoTrue code, and a deterministic rate-limit wait). I did
not silently substitute. Those four are labelled `stubbed` in the walk output,
in the harness, and in the contract doc, and their server payloads are proven by
unit test instead. The distinction is stated everywhere it appears rather than
smoothed over.

**Match versus surpass.** The brief did not say surpass, but it did ask for
competitor research, so the comparison is recorded:

| Capability | Eventbrite | Humanitix | TryBooking | EventLinqs now |
|---|---|---|---|---|
| Says why the signup failed | n/a, no failure state exists | n/a, routes instead | field-level, specific | field-level, specific: **LEVEL with TryBooking, and the only one of the four that also names our own outages** |
| Offers a route out | n/a | routes you to sign-in | "Already have an account? Sign In" as static chrome | Sign in and Reset password links carrying the typed address: **AHEAD** |
| Enumeration exposure at signup | none | leaks by routing | leaks by failure | leaks by failure: **BEHIND Eventbrite** |

The last row is a real BEHIND and is not dressed up. Closing it is a flow change,
written up as a founder decision, not taken unilaterally.

**Unverifiable claim hunt.** "The generic sentence is now unreachable from this
route": falsifiable, and tested by the sweep assertion plus the walk's non-zero
exit on any generic sentence. "Every message tells you what to do next":
falsifiable, and tested by regex over every message the suite renders. "Contrast
now passes AA": falsifiable, and re-measured by axe after the fix. No claim
survives in the report that I have not falsify-tested.

**Generic test.** The copy names EventLinqs, our own transport, and our own
account service, and the recovery links go to our routes. It could not be
dropped into another product unchanged.

**AI-tell sweep.** em-dashes 0, en-dashes 0, exclamation marks in user-facing
copy 0, banned word 0, tell lexicon (unforgettable, look no further, elevate,
unlock, vibrant, nestled, in the heart of, testament, "not just X it's Y", delve,
tapestry, seamless, robust, leverage, navigate the landscape) 0.

**Regression sweep, DESIGN-LOCK.** Changed beyond what the brief asked:
`--color-error-strong` added to `globals.css` and applied to five auth
components. NOT reverted, and here is why: axe found the existing colour failing
WCAG AA at 4.13:1 on every auth alert, and the accessibility law is not optional.
It follows the `--brand-accent-strong` precedent already documented in the same
file rather than introducing a new hue. Also changed: `/login` and
`/forgot-password` now read `?email=`, which the recovery links require to be
routes rather than detours, and `/forgot-password` gained a Suspense boundary
that `useSearchParams` requires. No hero, spacing, layout or chrome touched.

**Founder-cost test.** No dashboard trip is requested. No question is asked that
the code could answer. The one open item is a genuine product decision that only
the founder can make.

**Evidence-visibility test.** 18 screenshots at named paths, a JSON record per
run, two runnable scripts, and a law document. The founder can re-run both
scripts against any URL.

## Phase 4: the gate

NOT MET: 1 (requirement 25, Law 0's state-your-laws step).
PARTIAL: 0.
Unresolved adversarial findings: 1 (the Law 7 reference does not resolve; needs a
founder answer on whether a law was intended).

Requirement 25 cannot be retro-fixed: the moment to state the governing laws was
before the first edit and it has passed. It is reported at the top rather than
buried, which is the only honest handling left.

## Phase 5: decision evidence

The decision recorded is: **be clear on screen about an already-registered
address, rather than generic.**

| Dimension | Evidence |
|---|---|
| Competitor | Eventbrite, Humanitix, TryBooking each walked live 2026-08-09, findings and URLs in the contract doc. Two of three have removed the error entirely by unifying signup and sign-in; the third puts it at field level. |
| Market | Australian ticketing organisers are the segment; TryBooking is the closest comparator still running a name/email/password signup form and it is specific, not generic. |
| Engagement | Not independently cited, and I am not going to pretend otherwise. The argument rests on the structural point that a signup form which creates accounts already discloses existence, so vague copy buys no security while removing the only actionable answer. That is an argument, not a conversion measurement. |
| Trend | Eventbrite's move to Auth0-hosted passwordless email-first is the current direction of travel, observed live rather than remembered. |
| Our code | `src/lib/auth/auth-errors.ts`, `src/app/api/auth/signup/route.ts`, `src/components/auth/signup-form.tsx`; the precedent for keying on structured codes is `src/lib/auth/dispatch-auth-link.ts` lines 52 to 81. |
| Test plan | The metric is organiser signup completion rate from `/signup?role=organiser`. The variant to test once there is traffic: on-screen "account exists" against the Eventbrite email-first flow. Not runnable today at zero volume; named rather than assumed. |
