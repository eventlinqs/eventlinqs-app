# Roast ledger: rebasing feat/auth-hardening onto origin/main

Date: 2026-08-05
Task: rebase seven auth-hardening commits from old main (414d801) onto
origin/main (88c6683), reconciling with PR #108 and PR #109.

Ledger written BEFORE adjudication, from the brief verbatim.

---

## Phase 1: the requirement ledger

### Conduct standards (standing, non negotiable)

| # | Requirement |
|---|---|
| C1 | Australian English everywhere |
| C2 | No em dashes or en dashes anywhere |
| C3 | Use "community", never the banned alternative |
| C4 | Change only what resolving the rebase requires |
| C5 | No claim without pasted proof |
| C6 | Permanent root cause fixes, no workarounds |
| C7 | Never write to the Production Supabase database |
| C8 | Never modify the funds holding payment engine logic beyond what the conflict genuinely requires, and flag it clearly if it does |

### Task requirements

| # | Requirement |
|---|---|
| 1a | Read docs/ENV-DOCTRINE.md on main before resolving |
| 1b | Read src/lib/env/destinations.ts on main before resolving |
| 1c | Read this branch's sender identity commit before resolving |
| 1d | Understand what each was trying to achieve before resolving anything |
| 2a | Resolve so that BOTH intents survive |
| 2b | Keep ONE definition for each concern, not delete one branch's work |
| 2c | If they belong together in one module, say so and do it deliberately |
| 2d | If they belong apart, keep them apart and make the boundary explicit in a comment |
| 3a | Do not contradict R4: sending domain is eventlinqs.com; eventlinqs.com.au cannot send; canonical web host is www.eventlinqs.com.au; the split is deliberate |
| 3b | Do not contradict R2: no personal address as a literal in shipped source |
| 3c | Do not contradict R2: the in-code fallback to a proven-deliverable brand address must stay |
| 3d | alerts@eventlinqs.com must never become a default anywhere |
| 4 | Complete the rebase, resolving each conflict as it arises (expect more than the two already seen) |
| 5a | Full test suite, paste the result |
| 5b | Full lint, report warning count before and after, prove none added |
| 5c | Clean production build, exit zero, all prebuild guards passing |
| 5d | node scripts/check-env-stores.mjs and every other env guard, paste the output |
| 5e | Confirm the auth sentinel works alongside PR #109's manifest check, and that they do not duplicate or contradict |
| 6a | Run brief-roast, hostile about the resolution: work silently dropped |
| 6b | Hostile about: a conflict resolved by deleting rather than reconciling |
| 6c | Hostile about: anything that now has two competing definitions |
| 6d | Fix what it finds |
| 6e | Run a second round, report both |
| 7 | Do NOT push, do NOT merge |
| 7A | Report: every conflict, which files, how resolved and why |
| 7B | Report: anything from either branch changed to reconcile them |
| 7C | Report: all verification output |
| 7D | Report: both roast rounds |
| 7E | Report: anything not verified and why |

---

## Phase 2: adjudication

Final state: `c77fa04`. 9 commits on `origin/main` (88c6683).

| # | Verdict | Evidence |
|---|---|---|
| C1 | MET | Australian English throughout. No US spellings introduced |
| C2 | MET | 0 em or en dashes in added prose. The 4 occurrences in the branch diff sit inside regex character classes in tests that ASSERT copy is free of those characters, so the pattern has to name them. They are pre-existing branch content and follow the same convention as main's own `copy-tell-gate.test.ts` |
| C3 | MET | `git diff origin/main..HEAD \| grep -ciE "\bcultur"` returns 0 |
| C4 | MET | Every change is traceable to a conflict, a gate failure, or an explicit brief requirement. Pre-existing defects found during the audit were reported, not fixed, and are listed under Observations |
| C5 | MET | Every claim in the report carries pasted command output. Two of my own assertions were falsified by gates mid-task and corrected: the R2 comment leak and the duplicate props |
| C6 | MET | The safe-origin fix changes the resolution chain rather than special-casing a symptom. The send.ts resolution removes the second definition rather than syncing two |
| C7 | MET | Builds ran against TEST (`vkapkibzokmfaxqogypq`), verified in the build log. No `.env.local` exists in this worktree. No write to any database was issued |
| C8 | MET, FLAGGED | The Stripe webhook diff is 3 hunks: one import plus comment, and two literal-to-function swaps inside `sendRefundConfirmationEmail`. No payment logic, order state, funds-holding path or fee maths touched. Full diff pasted in report section B |
| 1a | MET | `docs/ENV-DOCTRINE.md` sections 0 to 5 read on main before any resolution |
| 1b | MET | `src/lib/env/destinations.ts` read in full on main |
| 1c | MET | `git show 33aaf1e` read in full |
| 1d | MET | The read found three collisions the brief did not name, including main's competing sender single-source in send.ts |
| 2a | MET | Both survive. Sender identity from `sender.ts`; main's `stampSender`, `stampSubject`, `senderDomain`, `senderDomainsInUse`, `resolveFrom` all retained and still feeding the email health check |
| 2b | MET | One definition each. `DEFAULT_FROM`/`TRANSACTIONAL_FROM` were the second sender definition and are gone as literals, not as capability |
| 2c | n/a | They belong apart, so 2d applies |
| 2d | MET | Boundary comments in `send.ts` (three modules, three concerns), in `destinations.ts` (why PLATFORM_INBOX must not follow the sending domain), and in the auth sentinel check D (why it does not duplicate the health check) |
| 3a | MET | Sending domain unchanged at `eventlinqs.com`. `DOMAIN-DECISION.md` corrected: it presented the canonical-host question as open when it was ruled 2026-07-25 and executed on main |
| 3b | MET | `tests/unit/env-store-exposure.test.ts` R2 block passes with the auth sentinel added to its call-site list |
| 3c | MET | `alertDestination()` falls back to `PLATFORM_INBOX`, never to empty. Asserted by the R2 test |
| 3d | MET | `alerts@eventlinqs.com` appears nowhere as a default. Asserted by the R2 test's bounce case |
| 4 | MET | 5 conflicts across 3 commits, all resolved. 7/7 replayed. `origin/main` is an ancestor of HEAD |
| 5a | MET | 125 files, 1370 tests, 0 failed |
| 5b | MET | Before 42 warnings 0 errors, after 42 warnings 0 errors. Baseline measured by running eslint in a throwaway worktree at `origin/main`, not assumed |
| 5c | MET | `BUILD EXIT=0`, all 4 guards PASS, pricing lock ok, 132 static pages |
| 5d | **BLOCKED** | Run and pasted, but it exits 1 for two environmental reasons: the Vercel CLI is not logged in and `CRON_SECRET` is not in this shell. Neither is a code fault. See UNFULFILLED |
| 5e | MET | 6 sentinel check names vs 11 health check ids, zero collision. The `manifest` check has no counterpart. The one genuine overlap is sender-domain verification, and both readers now resolve from one module |
| 6a | MET | Round 1 found a real R2 violation and a stale ruling doc |
| 6b | MET | Nothing was resolved by deletion. Main's drift guard was rewritten to a stronger assertion, not removed |
| 6c | MET | Three competing definitions found: sender constants, origin resolution, destination vs sender domain |
| 6d | MET | All three fixed in `c77fa04` and `43021f8` |
| 6e | MET | Round 2 below |
| 7 | MET | Not pushed, not merged. `git status`: ahead of origin/main by 9, nothing pushed |

---

## Phase 3: ROUND 1, the adversarial pass

**Silent drops.** Suspected one: `.claude/skills/brief-roast/SKILL.md` vanished from
the branch diff. FALSE ALARM, and my first check was wrong. `git ls-tree`
proves main carries the identical blob `76c336c0`: PR #109 fixed the same
filename bug independently, so git correctly dropped the redundant hunk. The
file is present and tracked. Residual cosmetic issue: commit `2633f39` is still
titled "Restore the brief-roast skill" while no longer containing it. Left
alone; rewriting history to fix a message is more churn than value.

**Systematic drop check.** Every file the original branch touched compared
pre-rebase to post-rebase by line count. No branch file shrank. Every file that
grew is accounted for by a named main addition or a named fix.

**Confirmed findings, all fixed:**

1. **R2 VIOLATION.** The auth sentinel hardcoded the founder's personal address,
   reintroducing the exact literal PR #109 removed from two other files. Fixed
   to `alertDestination()`; the sentinel added to the R2 test's call-site list so
   the rule is enforced rather than satisfied by luck. My own explanatory comment
   then leaked the address again and the gate caught that too.
2. **DUPLICATE PROPS.** Both branches gave the digest checkbox an id and a name;
   git merged both. React silently takes the last, so there was no symptom.
   eslint caught it: 2 errors against a baseline of 0.
3. **STALE RULING DOC.** `DOMAIN-DECISION.md` asked the founder to rule on the
   canonical web host. Ruled 2026-07-25, executed on main. Every row of its
   consequences table verified already done. Corrected.
4. **ORIGIN, TWO DEFINITIONS.** `safeAuthOrigin` fell through to request headers
   when `NEXT_PUBLIC_SITE_URL` was unset, which main's manifest declares
   OPTIONAL and correct on production. Reachable in production. Fixed at the
   root with 9 tests.
5. **DESTINATION VS SENDER.** Both resolve to `eventlinqs.com` and look
   mergeable. Boundary written down: sending is not receiving.

**Interpretation drift.** One caught. I initially reasoned that the sender-domain
overlap between the two sentinels was "benign duplication" and nearly left it
undocumented. That was substituting the easier task. The boundary is now stated
in the code.

**Founder-cost test.** One failure found and fixed: `DOMAIN-DECISION.md` would
have sent the founder to re-decide a settled question.

**AI-tell sweep.** 0 across all added lines. Exclamation marks in added `src`
lines: 32, all operators, 0 in user-facing copy.

---

## Phase 3: ROUND 2

Run after the round 1 fixes were committed.

| Hunt | Result |
|---|---|
| Conflict markers left anywhere | None. `grep` across src, tests, scripts, docs, package.json, vercel.json |
| Is the rebase genuine and linear | Yes. `git merge-base --is-ancestor origin/main HEAD` passes |
| Branch work lost in auto-merged files | None. Per-file line-count comparison, no file shrank |
| Main work reverted | None. `name="email"`, `name="password"`, organiser-terms link, `stampSender`, `stampSubject`, `getAppUrl`, kit-draft activation metric all verified present |
| Build still green after the safe-origin change | `BUILD EXIT=0` |
| Guards still fire after the rebase | 10/10 drills fired correctly, tree restored clean |
| Further competing definitions | Three pre-existing, none caused by this branch. See Observations |
| Did the safe-origin fix create a new inconsistency | No, it removed one: the sentinel's redirect probe already built from `getSiteUrl()` while the endpoints could emit a different origin |

**Round 2 found no new defect attributable to the rebase.**

---

## Observations: pre-existing, reported not fixed

Found during the audit, all identical to `origin/main`, none caused by this
branch. Not fixed because conduct standard C4 limits this change to resolving
the rebase, and each needs its own change and its own proof.

1. `src/app/guides/page.tsx:45` and `src/app/guides/[slug]/page.tsx:57` emit
   `https://eventlinqs.com/guides/...` in JSON-LD `url` and `mainEntityOfPage`.
   That is structured data naming a host that 301s to the canonical one.
2. `src/app/api/webhooks/stripe/route.ts:487` still has
   `process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'`. It passes
   main's HARD-07 test only because that test's pattern matches localhost
   fallbacks specifically. It sits in the payment path, so it is flagged rather
   than touched.
3. Around 30 `mailto:` contact addresses on `.com` in page copy. Deliberately
   out of scope of the sender guard, documented as such in the guard itself.
