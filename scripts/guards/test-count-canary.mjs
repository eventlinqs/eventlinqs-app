/**
 * THE CANARY: the suite may not quietly run fewer tests than it used to.
 *
 * WHY THIS IS THE LAYER THAT ACTUALLY CLOSES THE CLASS. Twice in two days a test
 * file reported healthy while running nothing:
 *
 *   1. A shebang on a module a test imported made the file fail to parse, so
 *      tests/unit/security/rls-column-exposure.test.ts collected ZERO tests for
 *      the entire life of the branch. Seventeen assertions about who can read a
 *      sensitive column were simply not running, and the guard for that class was
 *      therefore not running either.
 *   2. A file vanishing mid-walk threw at module scope, so
 *      tests/unit/dashboard/no-clock-during-render.test.ts collected zero and its
 *      twenty four tests silently did not run.
 *
 * Different causes, identical signature: vitest reports a collection failure as
 * "no tests", the file count still looks plausible, and a human reading
 * "2251 passed" has no way to know that yesterday it was 2251 and today it is
 * 2227. Guarding the known walkers fixes the two instances. It does not stop a
 * third cause, and there will be a third cause.
 *
 * So this does not care WHY the count dropped. It cares that it dropped.
 *
 * WHAT VITEST ALREADY DOES, stated honestly so this guard is not credited with
 * more than it earns. A file that fails to COLLECT is reported by vitest as a
 * failed suite and the run exits non-zero, so with the pre-push hook in place
 * that particular path is already blocked. Both incidents above got through for a
 * different reason: in the first, nobody ran the suite at all; in the second, the
 * run did go red and the reduced count was not the thing anyone looked at.
 *
 * The hole this closes that NOTHING else does is the quieter one: a file that
 * collects perfectly well and simply registers FEWER tests than it used to. An
 * `it` commented out, a `describe` left empty by a bad merge, a conditional skip
 * that starts always skipping. Every one of those is green, exits zero, and runs
 * less than yesterday.
 *
 * THE NUMBERS BELOW ONLY EVER RISE. That is the whole discipline. If a test is
 * legitimately deleted, the founder rules on it and the baseline moves down with
 * a note saying who decided and why. Lowering it to make a red build green is the
 * exact move this file exists to prevent, so it is spelled out rather than left
 * to judgement.
 *
 * Run standalone:  node scripts/guards/test-count-canary.mjs
 */
import { spawnSync } from 'node:child_process'

import { gitEnv } from '../lib/git-env.mjs'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * THE COMMITTED BASELINE. Raise it when the suite grows. Never lower it without
 * a founder ruling recorded on the line below.
 *
 * 2026-08-14: 185 files / 2251 tests, measured on Node 24.19.0 after the
 * rls-column-exposure file was restored (it had been collecting zero) and after
 * the vanish race was guarded. Both of those RAISED the count, which is the
 * point: the previous green run of 2227 was green while running less.
 *
 * 2026-08-14 (later, same day): 186 files / 2254 tests. Two changes, both
 * upward. `tests/unit/guards/guard-registry.test.ts` had `every registered guard
 * exists on disk` restored from `test.skip` to `test`, which this guard caught
 * and which put back 1 test. `tests/unit/security/githooks-executable.test.ts`
 * is new and adds 3, asserting the hooks are mode 100755 in the git index after
 * both were found committed as 100644, a state in which a POSIX checkout runs
 * NEITHER of them and says nothing.
 *
 * 2026-08-15: 187 files / 2260 tests. Six added: two in fixture-integrity
 * asserting the homepage density fixture is not stale, and four in the new
 * fixture-fallthrough file pinning that a stale fixture falls through to the
 * live query instead of blanking the homepage. That defect had the deployed
 * preview serving an empty homepage over a database holding 184 upcoming events.
 *
 * 2026-08-15 (third): 189 files / 2275 tests. Added the seat-map cross-tenant
 * pins (a genuine IDOR: saveSeatMap wrote sections into another organisation's
 * chart because a zero-row update is not an error) and widened the sale-gate
 * cases to the five fields the charge precondition actually requires.
 *
 * 2026-08-15 (fourth): 190 files / 2284 tests. The sales-attribution
 * reconciliation: nine cases pinning that the three buckets sum to the order
 * ledger exactly, that an order carrying two conversion rows is counted once,
 * and that one exported SOLD_STATUSES decides what a sale is (three different
 * definitions were live at the same time).
 *
 * 2026-08-15 (later): 188 files / 2265 tests. Five added in the new
 * tests/unit/events/sale-gate-source.test.ts, pinning the defect where a
 * security fix silently turned off ticket sales on every paid event: the anon
 * embed lost the two Stripe columns the sale gate reads, so saleBlocked was true
 * platform-wide.
 */
/*
 * 2026-08-15: raised 2300 -> 2305. Five tests added by the ONE FEE pass, all in
 * tests/unit/ai-layer.test.ts: every assistant carries the live fee label, every
 * assistant refuses to quote a figure when the live lookup fails, no assistant
 * ASSERTS a second fee or carries a deleted figure, and two on the knowledge
 * base rendering with and without a live fee. The canary asked for the floor to
 * be raised on the push that introduced them, which is the point of it: a floor
 * that is not raised stops being a floor.
 */
/*
 * 2026-08-15: raised 191/2305 -> 192/2331. External ticketing support: a new
 * file (tests/unit/payments/external-ticketing.test.ts, 23 tests pinning the
 * five non-negotiables and the destination validator) plus three added to
 * sales-attribution for the exclusion of external events from the sold-ticket
 * buckets.
 */
/*
 * 2026-08-15: raised 192/2332 -> 194/2345. Two drill files, both of which spawn
 * real child processes rather than reading source, because both guard runtime
 * behaviour that a source-reading test would pass against while broken.
 * tests/unit/security/production-write-preflight-approval.test.ts (8) proves the
 * production approval cannot be parked in a --env-file, and re-measures the two
 * Node behaviours that fix depends on.
 * tests/unit/guards/migration-collision-guard.test.ts (5) makes the collision
 * guard go red on a real two-file version collision and pins that a skipped
 * remote check never prints ALL GREEN.
 */
/*
 * 2026-08-15: raised 194/2345 -> 195/2356. The GIT_DIR incident class.
 * tests/unit/guards/no-inherited-git-env.test.ts is new and adds 11. It proves
 * the MECHANISM first (a git child inheriting GIT_DIR answers about the wrong
 * repository, and gitEnv() makes it answer about the right one) and only then
 * the guard, because a guard drilled without its mechanism proven is a guard
 * that might be enforcing nothing. It is drilled with GIT_DIR deliberately set,
 * which is the one context a clean shell cannot reproduce and the one context
 * where the original defect actually fired.
 */
/*
 * 2026-08-16: raised 195/2356 -> 197/2377. The two blocking checks on PR #118,
 * both of which turned out to be gates that could not tell two opposite states
 * apart.
 * tests/unit/ci/types-drift-analyse.test.ts is new and adds 16. The types-drift
 * guard reported PENDING MIGRATIONS (expected, and the committed types are
 * correct) and STALE TYPES (a defect) as one failure with one remedy, and that
 * remedy destroys correct work in the first case. These pin the classification
 * in BOTH directions, including the case the old guard could not see at all: a
 * committed column that no migration in the tree creates.
 * tests/unit/ci/seo-audit-coverage.test.ts is new and adds 5. SEO stopped being
 * a categories:seo floor, because that floor is unreachable on a preview that is
 * noindex by design. It is now asserted audit by audit, and a hand-written list
 * is weaker than a category floor the moment a line goes missing from it, so
 * these bind lighthouserc.json to the reviewed baseline.
 */
/*
 * 2026-08-16: raised 197/2377 -> 198/2396. The listing window.
 * tests/unit/events/listing-window.test.ts is new and adds 19. Every discovery
 * query filtered `start_date >= now`, so an event left the platform the moment
 * it began; the founder's 16 August event vanished that way and the missing
 * cover was blamed for it. These pin the rule (listed until it has ENDED), the
 * DST transition where a single-guess offset is wrong by an hour, and the
 * agreement between the SQL predicate and the JavaScript one, which are two
 * expressions of a single rule and would otherwise drift apart silently.
 *
 * The live proof against TEST in the same file is registered ONLY under
 * LISTING_PROOF=1 rather than skipped, because this canary allows zero skipped
 * tests by design and a conditional `describe.skip` would have cost that.
 */
/*
 * 2026-08-16: raised 198/2396 -> 200/2415. Two new files, 19 tests, both from
 * the exclusion-audit night. tests/unit/events/preset-window.test.ts pins the
 * date presets (a window that includes today starts at the START of today, and
 * every boundary is computed in the platform zone) and the price filter's
 * paginate-in-memory decision, all three of which had surviving copies of the
 * defect the previous pass claimed to have closed.
 * tests/unit/broadcast/cover-format.test.ts pins the fourth card format out of
 * the organiser download set and out of the public route guard.
 *
 * 2026-08-16 (later, same day): raised 200/2415 -> 201/2420.
 * tests/component/thin-categories-note.test.ts, 5 tests. It exists because the
 * VISIBLE branch of that component cannot be photographed on a dense preview:
 * at real density it renders nothing at all, by design. So the branch that only
 * appears on a thin catalogue is proven in the DOM rather than asserted from
 * the source.
 */
/*
 * 2026-08-17: raised 201/2420 -> 202/2424.
 * tests/unit/events/generated-cover-labels.test.ts, 4 tests, from wiring the
 * designed cover into the organiser form. They pin that the cover prints the
 * organiser CURRENT wall clock with no zone conversion, because converting it
 * and back is what puts a 9pm Perth event on the wrong day.
 */
/*
 * 2026-08-17 (later): raised 202/2424 -> 202/2425. One assertion added to
 * tests/unit/broadcast/cover-format.test.ts, stating the cover frame property
 * as arithmetic rather than as a number: the authored ratio must be no wider
 * than any frame the platform crops a cover to. The first version of that
 * format was 4:3 and clipped the event name in the 4:5 card crop.
 */
/*
 * 2026-08-18: raised 202/2425 -> 206/2481, the launch-blocker night. Four new
 * files, 56 tests, one per defect closed.
 *
 * tests/unit/payments/sale-refusal-truthfulness.test.ts, 12. Every paid event on
 * production refused to sell, behind a message naming a sale window on a
 * platform that has no sale-start column on an event. The reservation guard
 * named events.external_ticket_url in a select, the column did not exist because
 * 20260815000001 was unapplied, PostgREST failed the whole request, and the call
 * site discarded the error. These pin that a failed read is reported as its own
 * cause, that each cause has a distinct message, and that a refusal takes the
 * checkout away rather than sitting above a live one.
 *
 * tests/unit/dates/zoned-input-round-trip.test.ts, 15, and
 * venue-timezone.test.ts, 18. An organiser typed noon and the page said 2am. A
 * zoneless datetime-local value read through new Date() takes the offset of
 * whatever runtime evaluates it, so every edit moved the event one offset
 * earlier. Both sides of the 4 October DST transition are pinned, in seven
 * zones, because a fixed-offset implementation passes one half and fails the
 * other. The Sydney cases pass even on the broken code when the machine runs on
 * Sydney time, which is exactly how it survived review.
 *
 * tests/unit/events/revalidate-event.test.ts, 10. Five of the seven event
 * mutations invalidated nothing, so an organiser saved and the public page did
 * not change.
 */
/*
 * 2026-08-18 (later): raised 206/2481 -> 206/2483. Two tests, no new file, from
 * closing the incomplete-row class in sale-status.test.ts. They pin the two
 * halves that were collapsed twice in one week: the verifier NAMES which fields
 * are absent, and presence is decided by the KEY rather than the value, so a
 * null country still refuses the sale while a missing country column is a
 * programming error instead of a verdict about the organiser.
 */
/*
 * 2026-08-19: raised 206/2483 -> 208/2511. Two files, 28 tests, from the refund
 * session.
 *
 * tests/unit/payments/refund-post-disbursement.test.ts, 7. The clawback that runs
 * when a refund lands AFTER the organiser has already been paid had no test at
 * all. The load-bearing one asserts it can never reverse more than was actually
 * transferred, because over-reversing is not a rounding error, it is inventing
 * money against a connected account.
 *
 * tests/unit/payments/refund-failure-plain-words.test.ts, 21. Both refund actions
 * returned the caught error's own message, so an organiser could read a Stripe
 * charge id or a database status enum in the refund dialog. The leak test fails
 * for any future failure mode somebody forgets to translate, which is the half
 * that keeps working after this session is forgotten.
 */
/*
 * 2026-08-19 (later): raised 208/2511 -> 209/2517. One file, 6 tests.
 *
 * tests/unit/payments/event-access-matches-refund-scope.test.ts. The dashboard order
 * route gated on organisations.owner_id alone while resolveRefundScope and
 * create_refund_request both admitted owner, admin and manager, so a manager passed
 * every authorisation check the refund path performs and still never saw the button.
 * The divergence was never a logic bug, it was two lists of roles in two files that
 * nothing compared, so these tests compare them: the shared gate against
 * ORG_MEMBER_ROLES, and both against the role list inside create_refund_request.
 */
/*
 * 2026-08-19 (later still): raised 209/2517 -> 210/2521. One file, 4 tests.
 *
 * tests/unit/events/publish-gate-matches-sale-gate.test.ts. Publishing a paid event
 * and selling a ticket used to disagree: the publish gate allowed
 * charges_enabled && payout_status <> restricted, two loose checks where the sale gate
 * makes five strict ones, so an organiser on hold could publish an event that could
 * never take a cent. It is a PROPERTY test over all 96 combinations of the five gate
 * columns rather than a list of cases, so a future edit to either predicate fails here
 * without anybody having to think of the case.
 */
/*
 * 2026-08-19 (later again): raised 210/2521 -> 211/2528. One file, 7 tests.
 *
 * tests/unit/rate-limit/event-create-wiring.test.ts. Event creation had no limiter at
 * all until this morning, and the one it was given was keyed by address while its
 * rationale said "per organiser". These tests drive the real limiter with the real
 * policy numbers against a real counting store and require a refusal on the
 * thirty-first call, then prove with the store removed that the same run does NOT
 * refuse, so the refusal was the limiter and not the harness. They also pin the call
 * order, limiter after the auth check and before the first write, and prove that
 * ordering check can fail.
 */
/*
 * 2026-08-19 (last of the day): raised 211/2528 -> 212/2547. One file, 19 tests.
 *
 * tests/unit/rate-limit/payouts-read-wiring.test.ts, plus two extra cases in
 * tests/unit/payouts/api-routes.test.ts. `payouts-read` was keyed by the forwarded
 * address on all three payouts routes while its rationale said "per user", the same
 * defect event-create carried the same morning. The founder ruling re-keyed it to the
 * organisation, which meant moving the limiter BELOW resolveOrganiserScope, because a
 * bucket cannot be named until the scope names it.
 *
 * The new file drives the real limiter with the real policy numbers against a real
 * counting store, requires a refusal on the sixty-first call, then proves with the
 * store removed that the same run does NOT refuse, so the refusal was the limiter and
 * not the harness. It pins the identifier at all three call sites, pins the ordering,
 * and proves BOTH of those checks can fail on a deliberately broken sample.
 *
 * The two added cases in api-routes.test.ts replace one that asserted the OPPOSITE
 * ordering (`expect(resolveScopeMock).not.toHaveBeenCalled()`). It was inverted rather
 * than deleted: the ordering is the contract, and a deleted test lets it drift back.
 */
/*
 * 2026-08-20: raised 212/2547 -> 213/2579. One file, 32 tests.
 *
 * tests/unit/refunds/policy.test.ts, for the per-event refund policy that the buyer
 * request path and automatic approval are both decided by. It covers the request
 * window from both sides of the cut-off, the cancelled-event override that beats a
 * no_refunds policy (Eventbrite states the same rule in the same breath as the
 * option), the ordering of that override BEFORE the window check, and the ten-case
 * one-way table.
 *
 * THE ONE-WAY TABLE IS DRIVEN TWICE. The same ten cases run through the TypeScript
 * copy here and through public.refund_policy_is_looser_or_equal in
 * scripts/verify/refund-policy-drill.mjs, because the rule exists in two places by
 * design and two copies of a rule drift. The drill then does what a pure function
 * cannot: it drives a real UPDATE against a real published event and requires the
 * trigger to refuse it, with controls proving the trigger does not simply refuse
 * everything.
 *
 * tests/unit/ci/event-detail-gate-causes.test.ts, for the three deterministic
 * failures the mobile Lighthouse gate reported on the event-detail route on
 * 2026-08-21 - a container opacity dragging an interactive control's contrast
 * to 4.48:1, a first-run coach resizing the bottom-anchored container it sits
 * in, and 54,778 bytes of Supabase client pulled on mount for a closed modal.
 * All three lived in SHARED components, so all three were live well beyond the
 * one URL the gate measures. The assertions are absences, so each detector is
 * first shown failing on a sample that does contain what it looks for.
 *
 * RAISED AGAIN 2026-08-23, 217/2630 to 218/2660, for
 * tests/unit/growth/nationwide-from-day-one.test.ts plus four wording
 * assertions added to tests/unit/broadcast/digest-audience.test.ts, covering
 * the founder ruling that opened the platform in every Australian city and
 * state from day one: the founding-invite city gate (application AND the
 * database CHECK behind it), the launch-queue consent wording, and the offer
 * copy that tied a founding spot to Geelong or Melbourne. Every absence
 * assertion in that file carries a negative control that feeds it the exact
 * superseded wording, so none of them can pass vacuously.
 *
 * The last four of those tests are the ones that matter most, and they exist
 * because the first pass at this ruling MISSED a gate. Every other assertion
 * measures a constant or a string, and all of them were green while the admin
 * waitlist bridge still ran `.in('city_slug', ['geelong', 'melbourne'])`, so
 * the founder's invite list silently held nobody outside those two cities.
 * The sweep walks all of src/ for that shape rather than checking one file.
 */
/*
 * RAISED AGAIN 2026-08-23 (later, same day), 218/2660 to 218/2675, for the
 * founder ruling that ONE EVENT SHOWS THE RAIL, reversing the RAIL_MIN ruling
 * of 16 August recorded in docs/roast/RAIL-MIN-RULING-2026-08-16.md.
 *
 * The file count did not move because this is a SWAP, and the swap is the
 * point. tests/component/thin-categories-note.test.tsx and its component were
 * DELETED, minus 5 tests: that note existed only to name the categories the
 * threshold suppressed, so when the threshold went there was nothing left for
 * it to name and it would have rendered nothing for ever.
 * tests/unit/growth/one-event-shows-the-rail.test.ts replaces it, plus 20,
 * sweeping all five rail-bearing surfaces for any count threshold that would
 * hide a rail carrying a single event, and pinning invitationFillCount so a
 * rail of one still renders four cards rather than looking like a broken
 * shelf. Every absence assertion carries a negative control fed the exact
 * thresholds that shipped (>= RAIL_MIN, >= 4, < 3, < 5).
 *
 * The last eight of those pin the INVITATION ANGLES, and they exist because
 * removing the threshold exposed a second defect the threshold had been
 * hiding: a rail of one asks for three invitation cards, only two angles
 * existed, so the first and third rendered word for word identical side by
 * side. Their negative control runs the exact two-angle expression that
 * shipped and asserts that it DOES repeat.
 */
/*
 * RAISED AGAIN 2026-08-23 (third time that day), 218/2675 to 219/2691, for
 * tests/unit/seo/event-structured-data.test.ts, 16 tests, from the
 * discoverability pass.
 *
 * They exist because a production audit that day found every one of the 36 live
 * event pages VALID on Google's required set and yet missing `performer` on all
 * 36, and `offers.validFrom` on 26 of them, while the event page was already
 * loading the lineup in order to render it visibly. A source grep for the schema
 * component would have passed the whole time: the component was rendered, it was
 * simply handed less than it had.
 *
 * So these tests run the REAL payload builder (buildEventSchemaPayload, exported
 * for exactly this) through the SAME validator the deployed-site audit uses,
 * scripts/verify/event-structured-data-audit.mjs, so the test and the audit
 * cannot drift into disagreeing about what valid means. The absence assertions
 * (no empty-string venue field, no performer key when there is no lineup, no
 * previousStartDate without EventRescheduled) each carry a negative control.
 */
/*
 * RAISED AGAIN 2026-08-23 (fourth time that day), 219/2691 to 220/2718, for
 * tests/unit/refunds/postponed-event-ladder.test.ts, 27 tests, from the
 * postponed-event ladder.
 *
 * The competitor-parity audit called this the only launch-blocking gap, and the
 * measurement before the build confirmed both halves: policy.ts overrode the
 * organiser's refund policy for a CANCELLED event and had no branch at all for
 * a POSTPONED one, and findDisbursableEvents() selected on end_date alone and
 * did not even SELECT events.status, so a postponed event was paid out once its
 * ORIGINAL end date passed.
 *
 * Each of the three overrides carries a negative control that runs the SAME
 * order against a LIVE event and asserts it IS refused, by policy_no_refunds or
 * window_closed. Without those, "the refund was allowed" would also pass on a
 * policy module that allowed everything, which is exactly what a permissive
 * default looks like from the outside.
 *
 * TWO DEFECTS IN THIS PASS WERE CAUGHT BY EXISTING GATES RATHER THAN BY ME, and
 * both are recorded here because they are the argument for keeping those gates:
 *   - no-clock-during-render caught a toLocaleDateString with no timeZone in
 *     the new module. Server renders in UTC, the browser in the visitor's zone,
 *     so an evening Sydney deadline printed as the previous day.
 *   - this canary's own sibling signal caught an unhandled ECONNREFUSED: the
 *     seo test imports the audit script for its validator, and that script
 *     called main() at the top level, so importing it ran a live HTTP audit.
 *     Every test still PASSED and vitest exited 1 on the rejection alone.
 */
/*
 * RAISED AGAIN 2026-08-23 (fifth time that day), 220/2718 to 221/2747, for
 * tests/unit/events/jurisdictional-completeness.test.ts, 29 tests, from the
 * founder's standing rule that this platform operates in ALL of Australia and
 * a partial list is a defect rather than an abbreviation.
 *
 * The defect it was written for: the event-creation form carried a
 * hand-written list of five Australian timezones and omitted Australia/Hobart
 * and Australia/Darwin, so an organiser in Tasmania or the Northern Territory
 * could not select their own zone and had to pick somebody else's.
 *
 * For Darwin that was an hour of real error, not a cosmetic gap, and the test
 * asserts the arithmetic rather than describing it: the NT does not observe
 * daylight saving so Australia/Darwin is +09:30 all year, while
 * Australia/Adelaide, the nearest zone the form did offer, is +10:30 for the
 * whole daylight-saving season. Every event a Darwin organiser created between
 * October and April carried a start time an hour out.
 *
 * The negative control runs the five-zone list that shipped and asserts it
 * misses exactly TAS and NT.
 */
/*
 * RAISED 2026-08-24, 221/2747 to 222/2754, for
 * tests/unit/refunds/arrival-timeframe.test.ts, 7 tests.
 *
 * The platform stated how long a refund takes on EIGHT buyer-facing surfaces
 * and disagreed with itself on two: the confirmation email said "3 to 5
 * business days" and the cancelled-event banner said "within 5 business days",
 * against Stripe's documented "approximately 5-10 business days"
 * (https://docs.stripe.com/refunds). A buyer refused, then approved, then
 * emailed was told 5-10, then 5-10, then 3-5, and the shortest number was in
 * the email they keep.
 *
 * WORTH RECORDING: an EXISTING test asserted the wrong sentence verbatim, so
 * the defect was PROTECTED by the suite. Correcting the copy failed CI until
 * that assertion was rewritten to compare against REFUND_ARRIVAL_WINDOW rather
 * than a literal. A test that pins a literal pins whatever the literal says,
 * including a mistake.
 *
 * The sweep carries negative controls fed BOTH shipped wordings, and two more
 * proving it does NOT flag the payout figure (3 to 5 business days after an
 * event) or the response SLA (2 business days), which are different promises
 * about different parties.
 */
/*
 * RAISED 2026-08-24, 222/2754 to 223/2764, for
 * tests/unit/ci/gate-url-determinism.test.ts, 10 tests.
 *
 * The Lighthouse gate was a coin toss. scripts/ci/resolve-gate-urls.mjs picked
 * the FIRST /events/<slug> the preview sitemap listed, and the sitemap query
 * had no ORDER BY, so "first" was whatever Postgres returned that day. Two
 * consecutive runs on the same branch audited DIFFERENT pages:
 *
 *   135be599  /events/seat-proof-fifty-nwltxi   0.83, 0.75, 0.73  PASS
 *   8044480b  /events/cat-indie-sounds-...      0.74, 0.73, 0.73  FAIL
 *
 * Nothing about event-page performance changed between them; the floor
 * aggregates optimistic (best of three), so 0.83 cleared 0.80 and 0.74 did not.
 * It blocked two merges.
 *
 * The selection is now a pure function of the SORTED slug list, and the gate
 * audits THREE event pages instead of one. The test pins that widening as a
 * FLOOR, because the cheap way to make this gate green is to audit one fast
 * page, and a future pass must not be able to do that quietly.
 *
 * Its negative control runs the OLD head-of-list behaviour over the same two
 * slugs in two orders and asserts that it does disagree with itself.
 */
/*
 * RAISED 2026-08-28, 223/2764 to 230/2849, measured on integration/launch at
 * b883d239. The canary reported the growth itself on the push before this one
 * and asked for the floor to be moved; a floor left below the real count is a
 * canary that would not notice seven files being deleted.
 *
 * The newest of those files is tests/unit/guards/source-scanner-eol.test.ts,
 * 6 tests, and it is worth naming because it pins a failure this canary is a
 * cousin of. This repository stores LF, sets core.autocrlf=true and carries no
 * .gitattributes, so a scanner pattern containing a literal `\n` matched on the
 * CI runner and matched nothing on Windows. Two guards went red there and green
 * on CI from identical bytes; a third, pricing-derive, failed claiming the fee
 * document disagreed with its own lock block and told the reader to rewrite
 * that document. The figures were identical once the line endings were.
 *
 * The count is the whole point in both cases: a scanner that reads nothing
 * reports no problems, exactly as a suite that runs nothing reports no
 * failures.
 */
/*
 * 2026-08-28: raised 230/2849 -> 231/2852. One file, three tests:
 * tests/unit/media/cover-pipeline.test.ts. It pins the cover and share-card
 * pipeline, which failed on this date with sharp reporting "Input buffer
 * contains unsupported image format" and took EVERY event's share preview down
 * with it. Two of the three assert that image bytes are sniffed by magic number
 * rather than trusted from a content-type header; the third renders TWICE in one
 * process, because a single render always passed and the whole class of defect
 * is a resource consumed on first use.
 */
/*
 * 2026-08-28 (later): raised 231/2852 -> 232/2857. One file, five tests:
 * tests/unit/events/publish-gate-never-connected.test.ts. An organiser who had
 * never connected Stripe was told "We could not check your Stripe status just
 * now ... Nothing is wrong with your account ... Try again shortly", on the last
 * press of a seven-step wizard. Every clause was false and waiting could never
 * clear it. Three of the five pin those exact clauses out of the message.
 */
/*
 * 2026-08-29: raised 232/2857 -> 233/2868. One file, eight tests, plus three
 * added to the env-manifest suite by the new variable:
 * tests/unit/orders/order-access.test.ts. It pins the token that lets a GUEST
 * buyer act on their own order. The properties are the ones that matter if it
 * is wrong: a token for order A must not open order B, and with no secret in
 * production it must refuse to mint AND refuse to honour rather than fall back
 * to the public dev constant.
 */
/*
 * 2026-08-29: raised 233/2868 -> 237/2914. Four files, forty-six tests, from
 * the journey-8 session:
 *   tests/unit/checkout/discount-math.test.ts   the discount arithmetic, pinned
 *     as a pure function after the checkout path spent three months reading a
 *     column migration 20260520000001 had DROPPED, returning NaN for a
 *     percentage code and undefined for a fixed one, both marked valid: true.
 *     The first test in the file is that exact post-migration row shape.
 *   tests/unit/email/transport-ready.test.ts    whether a deployment can send
 *     mail at all. Four senders each returned silently on a missing
 *     RESEND_API_KEY, above every transport, so the buyer ticket email could
 *     not be observed locally and, on a deploy without the key, was dropped for
 *     every buyer with nothing in any log. Includes the empty-string key, which
 *     is the shape a dashboard variable actually takes when it goes wrong.
 *   the guest half of tests/unit/tickets/transfer.test.ts, including the attack
 *     that matters: a correctly signed order-access token for a DIFFERENT order
 *     must move nothing.
 */
/*
 * 2026-08-29 (second raise): 237/2914 -> 238/2921. One file, seven tests.
 *   tests/unit/security/upload-size-gate.test.ts   the server-side upload size
 *     refusal and, more importantly, WHERE IT SITS. The break attempt "upload
 *     an image far over the size limit" sat at READ NOT DRIVEN because its only
 *     evidence was somebody reading upload.ts:106. The browser drive that now
 *     exists (scripts/verify/oversize-upload-drive.mjs) reaches the CLIENT gate
 *     and can never reach the server one, because the client refuses first and
 *     no request is sent. So this pins the part that can silently rot: the size
 *     test must come BEFORE arrayBuffer() and before the permission check, so
 *     oversized attacker bytes are never read into memory and never handed to
 *     the native decoder. That is an ordering property, and ordering is exactly
 *     what a refactor moves without changing any return value a normal test
 *     would look at.
 */
/*
 * 2026-08-29 (third raise): 238/2921 -> 240/2940. Two files, nineteen tests,
 * both from opening the Launch Kit artefacts.
 *   tests/unit/flags/flag-cache-cannot-switch-off.test.ts   the flag cache must
 *     never be able to decide a feature is OFF. readCache collapsed every
 *     unrecognised value to false and returned it as a DECISION, without ever
 *     asking the database, so /api/organiser/events/[id]/poster answered 404
 *     feature_off on three runs in four while the row AND the cached value both
 *     said the flag was on. Deleting the cache key made it 200 four times in
 *     four. The eight nonsense shapes are the ones a real store produces.
 *   tests/unit/broadcast/social-card-renders.test.ts   every card format renders
 *     a decodable JPEG at its published size, typographic AND photographic.
 *     Written to separate a broken artefact from a broken environment: the
 *     route was answering 500 with a zero-byte body on a machine whose build
 *     directory OneDrive had demonstrably corrupted, and "the cards are broken"
 *     could not honestly be claimed without running the renderer outside the
 *     server. It passes, so the renderer is sound.
 */
/*
 * 2026-08-29 (fourth raise): 240/2940 -> 241/2943. One file, three tests.
 *   tests/unit/guards/guards-do-not-need-git.test.ts   no guard may require git
 *     to be present. no-silent-submit shipped listing its files with a git
 *     spawn, and VERCEL'S BUILD CONTAINER IS NOT A GIT REPOSITORY, so the call
 *     died with "fatal: not a git repository" and took the whole guard runner
 *     with it. FIFTEEN consecutive preview deployments failed; the deployment
 *     for the commit immediately before it succeeded. Locally there is always a
 *     git repository and the Actions checkout has one too, so lint, typecheck,
 *     build and test were all green throughout. Neither a lint rule nor the
 *     pre-push hook could have caught it: the code is correct, it just cannot
 *     run where it has to run.
 */
/*
 * 2026-08-29 (fifth raise): 241/2943 -> 242/2950. One file, seven tests.
 *   tests/unit/checkout/discount-claim-ordering.test.ts   the discount use is
 *     CLAIMED when the code is applied to the reservation, not after the money
 *     moves. These are ORDERING tests on purpose: the claim itself is SQL under
 *     a row lock, driven for real by scripts/verify/discount-claim-drive.mjs,
 *     and a unit test cannot take a row lock. What they pin is what a refactor
 *     moves silently and where this defect actually lived: the claim must sit
 *     BEFORE the PaymentCalculator call, and the confirmation path must CONVERT
 *     the hold rather than incrementing a second time, which would exhaust an
 *     organiser's code at half its stated limit.
 */
/*
 * 2026-08-29 (sixth raise): 242/2950 -> 245/2961. Three files, eleven tests,
 * from the resvg rasteriser swap.
 *   tests/unit/broadcast/card-raster-parity.test.ts   renders every format
 *     through BOTH rasterisers and compares pixel by pixel. The old path can
 *     only be exercised in vitest, because inside the Next server sharp cannot
 *     decode SVG at all, which IS the defect.
 *   tests/unit/broadcast/card-raster-diff.test.ts     writes both images and an
 *     amplified difference map to docs/verification/card-raster/ so a person can
 *     LOOK rather than argue about a number.
 *   tests/unit/health/capability-is-probed-not-read.test.ts   no source file may
 *     branch on a DECLARED capability table, and the health sentinel must prove
 *     the image pipeline by round-tripping real bytes in the deployed runtime.
 *     sharp.format.svg.input reported true while an 8x8 red rectangle failed.
 */
/*
 * 2026-09-03 (seventh raise): 245/2961 -> 246/2964. One file, three tests.
 *   tests/unit/broadcast/card-raster-double-init.test.ts pins the fix for a
 *   REAL production incident on 2 September 2026: all eighteen social cards
 *   answered HTTP 500 with "Already initialized. The initWasm() function can be
 *   used only once." A fresh process served them all again, so the bytes were
 *   fine and the PROCESS was poisoned. "Already initialised" was being treated
 *   as a failure, the memoised promise nulled itself so the next request
 *   retried, the retry called initWasm a second time, and resvg refused for the
 *   life of the lambda. One transient hiccup became permanent and took the
 *   whole Launch Kit down with it.
 *
 *   Raised during the launch-worthy sweep. The canary had been reporting the
 *   growth correctly on every push since the file landed; nothing was broken,
 *   the floor had simply not been moved up to hold the new work.
 */
/*
 * 2026-09-03 (eighth raise, same day): 246/2964 -> 247/2969. One file, five
 * tests. tests/unit/scanner/ticket-code-alphabet.test.ts.
 *
 *   This one is worth reading. gen_ticket_code() in the ticketing migration
 *   emits the alphabet '23456789ABCDEFGHJKMNPQRSTUVWXYZ'. The door's parser
 *   accepted 'ABCDEFGHJKLMNPQRSTVWXYZ23456789'. The two had drifted: the
 *   generator emits U, the door rejected it.
 *
 *   Measured against 128 real tickets, 30 of them, 23.4 percent, could not be
 *   admitted AT ALL, on the QR path and by hand alike, because both share one
 *   validity check. Roughly one holder in four would have been turned away at
 *   the door holding a valid ticket.
 *
 *   Nothing caught it, because each file was internally consistent and the
 *   defect lived in the space between them. The test therefore reads the real
 *   alphabet OUT OF THE MIGRATION rather than restating it, so it cannot drift
 *   with the thing it checks. Found by driving journey 6, which until the same
 *   day could not be run at all.
 */
/*
 * 2026-09-03 (ninth raise, same day): 247/2969 -> 248/2977. One file, eight
 * tests. tests/unit/events/paid-publish-blocked.test.ts.
 *
 *   The Publish button was disabled only for isSubmitting, an empty title and
 *   a missing cover, so an organiser with a paid tier and no connected Stripe
 *   account saw a live gold Publish button, pressed it, and was refused by the
 *   server. The refusal was announced and linked, but the control looked
 *   available right up to the press.
 *
 *   Most of these eight pin the ways the new rule must NEVER invent a refusal
 *   of its own: free events, edit mode, no tiers, and a half-typed price must
 *   all stay publishable. The server gate remains the only thing that decides.
 *
 * 2026-09-03 (Scope v5 completion build, item A1): 250 files / 2984 tests. Two
 * files, seven tests, both upward. tests/unit/ci/vercel-git-deployments.test.ts
 * pins vercel.json so the ops/session-log branch can never trigger a
 * production-project build again (six of twenty recent deployments were that
 * branch failing at prebuild). tests/unit/ops/repair-order-access-secret.test.ts
 * pins the repair script that unblocked production on 3 September: the value it
 * mints is judged by the manifest's own shape object, its refusals stay in the
 * source, and the secret is never interpolated into anything printed.
 *
 * 2026-09-04 (Scope v5 completion build, item A2): 257 files / 3052 tests. Seven
 * files, sixty-eight tests, all upward, for virtual and hybrid delivery.
 * tests/unit/stream/{access,embed,countries,publish-rule}.test.ts pin the bearer
 * gate, the stream link classifier, the reach and the publish refusal;
 * tests/unit/email/virtual-confirmation.test.ts pins that the confirmation mail
 * carries a watch link and never a stream address;
 * tests/unit/guards/schema-ahead-of-code.test.ts pins the guard that refuses a
 * build whose database lacks an object the code reads by name; and
 * tests/unit/stream/room-time-label.test.ts pins that the room stamps a message
 * in the event's zone, after no-clock-during-render caught the runtime-zone form.
 */
const MIN_FILES = 257
const MIN_TESTS = 3052

/**
 * SKIPPED TESTS ALLOWED: NONE. This closes a hole in the two counts above.
 *
 * The counts are a FLOOR, so they catch a test that disappears. They do not
 * catch a test that disappears while another one arrives, because the total is
 * unchanged. Adding one test and skipping one test nets to zero, and a skipped
 * test is a test that is not running.
 *
 * That is not hypothetical. This guard caught exactly it on 14 August 2026:
 * `tests/unit/guards/guard-registry.test.ts` had `every registered guard exists
 * on disk` changed from `test(` to `test.skip(` with no comment and no reason.
 * That is the check which catches a guard being registered in the runner while
 * its file is absent, so disabling it disables the thing that notices a guard
 * protecting nothing. Un-skipped, it passes, so the skip was hiding nothing and
 * had simply been left behind.
 *
 * A legitimate skip is therefore a founder decision recorded here, exactly like
 * lowering the counts. Raising this to 1 to make a push go green is the move
 * this constant exists to stop.
 */
const MAX_SKIPPED = 0

/*
 * Written to a file, and to a REPOSITORY-RELATIVE one.
 *
 * Two things were learned the hard way here. `--outputFile=-` does not stream to
 * stdout in vitest 4, and an ABSOLUTE path into the system temp directory is not
 * honoured either: vitest resolves the option against the project root and the
 * file simply never appears, which this guard then reports as "vitest wrote no
 * report". A dotfile in the repo root works, and is removed in `finally` so a
 * crashed run cannot leave it behind for git to notice.
 */
// NOT a dotfile: a leading dot in --outputFile produced no report at all, with
// no error, which is its own small lesson about trusting a silent success.
const REPORT_NAME = `test-count-canary-${process.pid}.json`
const REPORT = join(ROOT, REPORT_NAME)

/*
 * vitest is invoked through its own JS entry point rather than through npx.
 *
 * `spawnSync('npx.cmd', ...)` on Windows under Node 24 fails SILENTLY: both
 * stdout and stderr come back empty and the exit status tells you nothing,
 * because Node now refuses to spawn a .cmd without an explicit shell. The first
 * symptom was this guard reporting "vitest wrote no report", which points at the
 * reporter and not at the spawn. Calling node on vitest.mjs needs no shell, so
 * there is nothing to get wrong and nothing to quote.
 */
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
// env: gitEnv() BECAUSE THIS IS WHAT CARRIES GIT_DIR INTO THE SUITE.
// This file is spawned by .githooks/pre-push, so its own environment contains
// the GIT_ variables git exports for a hook. Without this, every one of the
// 2345 tests below inherits GIT_DIR, and any of them that shells out to git
// operates on the real repository whatever cwd it was given. That is exactly
// how a drill set core.bare=true on the shared config and broke `git status`
// in all nine worktrees at once. Clearing it here severs the class for every
// current and future test at once.
const result = spawnSync(
  process.execPath,
  [VITEST, 'run', '--reporter=json', `--outputFile=${REPORT_NAME}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: gitEnv() },
)

if (!existsSync(REPORT)) {
  console.error(`[test-count-canary] vitest wrote no JSON report at ${REPORT_NAME}, so nothing can be counted.`)
  console.error('--- vitest stdout (tail) ---')
  console.error((result.stdout ?? '').slice(-1500))
  console.error('--- vitest stderr (tail) ---')
  console.error((result.stderr ?? '').slice(-1500))
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'))
} catch (err) {
  console.error(`[test-count-canary] the vitest report was not parseable JSON: ${err.message}`)
  process.exit(1)
} finally {
  rmSync(REPORT, { force: true })
}

/*
 * PASSED, not TOTAL. Found by drilling this guard rather than by reasoning about
 * it: `numTotalTests` COUNTS SKIPPED TESTS, so adding `.skip` to a test left the
 * total at 2251 and this canary said PASS while one fewer assertion ran. That is
 * the identical failure mode the canary exists to catch, reproduced inside the
 * canary itself. Counting what actually executed and passed closes it, and also
 * catches a test quietly turned into a skip during a merge.
 */
const files = Array.isArray(report.testResults) ? report.testResults.length : report.numTotalTestSuites
const tests = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0

/*
 * `numFailedTests` IS ZERO WHEN A FILE FAILS TO COLLECT, and reading that number
 * alone is how a broken file reads as a clean run.
 *
 * Established from the installed vitest 4.1.5 source rather than assumed.
 * @vitest/runner catches a module-evaluation throw and records it on the FILE
 * (`file.result = { state: 'fail', errors }`), and the JSON reporter computes
 * `numFailedTests` as `tests.filter(t => t.result?.state === 'fail').length`. A
 * file that never collected registered no tests, so it contributes no failing
 * TASK and `numFailedTests` stays 0.
 *
 * This guard reproduced exactly that on 14 August 2026: a deliberate module-scope
 * throw printed `185 files, 2246 tests, 0 failed`. Five tests had stopped running
 * and the failure count said everything was fine. Only the count floor caught it,
 * which means a run that happened to add five tests elsewhere would have hidden it
 * completely.
 *
 * The fields that DO see it are `success`, `numFailedTestSuites`, and a
 * testResults entry whose status is failed. All three are checked.
 */
const failedSuites = report.numFailedTestSuites ?? 0
const reportedSuccess = report.success === true
/** A file that failed while registering no tests at all: a collection failure. */
const collectionFailures = (Array.isArray(report.testResults) ? report.testResults : [])
  .filter(r => r.status === 'failed' && (r.assertionResults ?? []).length === 0)
  // Both sides normalised to forward slashes before stripping: ROOT is a Windows
  // path with backslashes and vitest reports forward slashes, so a raw replace
  // silently matches nothing and prints the absolute path.
  .map(r => (r.name ?? '').replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''))
const skipped = report.numPendingTests ?? 0
if (skipped > 0) console.log(`[test-count-canary] ${skipped} test(s) skipped, which do not count as run`)

console.log(`[test-count-canary] ${files} files, ${tests} tests, ${failed} failed, ${skipped} skipped`)
console.log(`[test-count-canary] baseline ${MIN_FILES} files, ${MIN_TESTS} tests, ${MAX_SKIPPED} skipped`)

const problems = []
if (collectionFailures.length > 0) {
  problems.push(
    `${collectionFailures.length} FILE(S) FAILED TO COLLECT, registering zero tests:\n` +
      collectionFailures.map(f => `        ${f}`).join('\n') + '\n' +
      '      This is the silent shape. The file threw at module scope, so it has no\n' +
      '      failing test to count and numFailedTests reads 0. Every test it holds\n' +
      '      simply did not run.',
  )
}
if (failedSuites > 0 && collectionFailures.length === 0) {
  problems.push(`${failedSuites} test SUITE(S) failed. Read the vitest output.`)
}
if (!reportedSuccess) {
  problems.push('vitest reported success=false for this run.')
}
if (failed > 0) {
  problems.push(`${failed} test(s) FAILED. This runs the suite, so it reports failures too.`)
}
if (files < MIN_FILES) {
  problems.push(
    `only ${files} test FILES ran, baseline is ${MIN_FILES}.\n` +
      '      A file that fails to COLLECT is reported by vitest as "no tests", not as a\n' +
      '      failure, so this is very often a file that crashed at module scope rather\n' +
      '      than a file somebody deleted.',
  )
}
if (tests < MIN_TESTS) {
  problems.push(
    `only ${tests} TESTS ran, baseline is ${MIN_TESTS}.\n` +
      '      Tests that do not run cannot fail, so a green suite that runs fewer tests\n' +
      '      is not evidence of anything.',
  )
}
if (skipped > MAX_SKIPPED) {
  problems.push(
    `${skipped} test(s) SKIPPED, the allowance is ${MAX_SKIPPED}.\n` +
      '      A skipped test is a test that is not running. This is checked separately\n' +
      '      from the counts above because adding one test while skipping another\n' +
      "      leaves the total unchanged, so the floor alone would not notice.\n" +
      '      Find the `.skip` and either remove it or get it ruled on.',
  )
}

if (problems.length > 0) {
  console.error('\n[test-count-canary] FAILED. The suite is running LESS than it used to.\n')
  for (const p of problems) console.error(`  - ${p}\n`)
  console.error(
    '  Find the file that stopped collecting before touching the baseline. Run\n' +
      '  `npx vitest run` and look for a file reporting "no tests" or a suite-level\n' +
      '  error rather than a test-level one.\n\n' +
      '  Lowering MIN_FILES or MIN_TESTS to go green is the move this guard exists to\n' +
      '  stop. It needs a founder ruling and a note on the constant.\n',
  )
  process.exit(1)
}

if (files > MIN_FILES || tests > MIN_TESTS) {
  console.log(
    `[test-count-canary] the suite has GROWN (${files}/${tests} against ${MIN_FILES}/${MIN_TESTS}).\n` +
      '[test-count-canary] raise the baseline in this file so the new floor is held.',
  )
}

console.log('[test-count-canary] PASS - nothing stopped running.')
