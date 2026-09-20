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
import { poolStartFailures } from './lib/vitest-pool.mjs'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
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
 *
 * 2026-09-04 (Scope v5 completion build, item A3): 262 files / 3100 tests. Five
 * files, forty-eight tests, all upward, for venue geocoding. Measured by running
 * the five files alone (5 passed, 48 passed) on top of the A2 floor.
 * tests/unit/geo/geocode.test.ts pins the Geocoding client against a stubbed
 * transport, every Google status a named outcome, and the ONE decision that
 * treats a server key equal to the browser key as absent;
 * tests/unit/geo/venue-coordinates.test.ts pins the save-time rule (a Places pick
 * is kept and never re-geocoded, a typed address is geocoded only when the key
 * can serve it, every other outcome is null with its reason);
 * tests/unit/maps/address-components.test.ts pins the Places pick to the six
 * venue fields on Google's real components for Forum Melbourne;
 * tests/unit/cities/resolve-from-coordinates.test.ts pins that a suburb locality
 * still files under its city by the coordinates, and that CITY_MATCH_RADIUS_KM
 * stays below half the registry's closest pair; and
 * tests/unit/guards/geocoding-key-posture.test.ts pins the guard's three shapes
 * (absent SKIP, browser-as-server SKIP, distinct-and-refused FAIL).
 *
 * 2026-09-04 (A3, later the same day): 264 files / 3114 tests, measured by the
 * canary itself with the env parked (C:devEVIDENCEA3-canary-measure.txt).
 * Two files and fourteen tests, all upward, every one from a defect the drive
 * found. tests/unit/maps/places-autocomplete.test.ts (6) pins that the referer
 * refusal is read off the thrown message and never off the class, after Google's
 * RpcError (not an instanceof Error) made the finder say "did not answer";
 * tests/unit/journeys/maps-js-stub.test.ts (3) runs the Maps JS stand-in in a vm
 * and pins the loader handshake (the dotted google.maps.__ib__ callback) and the
 * Forum Melbourne answer; tests/unit/security/security-headers.test.ts gained 3,
 * pinning places.googleapis.com and maps.googleapis.com in the report-only CSP
 * connect-src and script-src; and tests/unit/guards/schema-ahead-of-code.test.ts
 * grew by 2 when events.venue_geocode_source joined the schema manifest.
 *
 * 2026-09-04 (A4, price history, Scope v5 3.3): 270 files / 3177 tests, measured
 * by the canary itself with the env parked (C:\dev\EVIDENCE\A4-canary-measure.txt).
 * Six files and sixty-three tests, all upward. tests/unit/pricing/price-history.test.ts
 * (21) pins the summariser: matching by tier NAME because an edit re-creates
 * every tier, the direction and previous price of each move, the words a buyer
 * reads (Listed at, Lowered to, Rose to at N% sold), the note under the price
 * and which tiers keep their history to themselves; dynamic-pricing-steps (6)
 * pins the step normaliser; read-price-history (4) pins the one reader, which
 * logs a failure with its code and yields no history; save-dynamic-pricing-
 * action (6) proves the action reaches save_dynamic_pricing in ONE call with
 * the steps normalised and refuses before any write without a session or
 * access; ticket-price-history-migration (11) pins the migration's shape, the
 * two DEFERRABLE INITIALLY DEFERRED triggers and the grants; and
 * tests/unit/guards/price-history-integrity.test.ts (8) pins the guard's three
 * judgements and proves it green on the tree. schema-ahead-of-code grew by 2
 * when ticket_price_history.id joined the schema manifest; guard-registry
 * counts the new guard.
 *
 * 2026-09-05 (A4, the drive's axe finding): 271 files / 3182 tests. One file,
 * five tests. tests/unit/a11y/light-surface-text-tokens.test.ts pins that the
 * ticket selector's scarcity line and the access-code refusal use the
 * error-strong text token rather than a coral text class on the white ticket
 * card (coral-500 measured 3.28:1 there under axe, and no coral token clears
 * 4.5:1 on white), and that error-strong itself still clears 4.5:1.
 *
 * 2026-09-05 (B1, offline door validation, Scope v5 3.12 and 3.13): 283 files /
 * 3307 tests. Twelve files, 123 tests, plus 2 in the suites that grow with the
 * manifest and the registry. tests/unit/scanner/offline-validate pins the
 * device's judgement branch by branch and the 24 hour window; door-store runs
 * the IndexedDB store on fake-indexeddb (batching, the carried local admission,
 * the queue); door-sync the batch, the strict answer parser and the write-back;
 * door-copy the words and the copy law; scan-actions-offline the two actions
 * against a mocked session client; offline-door-migration the migration's
 * shape, the hashed door list, the compare-and-set and the grants;
 * scan-service-worker drives the worker's routing in a fake worker global;
 * device-id; guards/offline-door-integrity the guard's four judgements and the
 * tree; reporting/door-review-copy the organiser's review words;
 * reporting/resolve-scan-review-action the Mark resolved action (identity, the
 * gate, the RPC, the note); dashboard/main-column-shrinks pins min-w-0 on the
 * dashboard's main flex item, found missing on the B1 drive at 768 where the
 * attendees table pushed Mark resolved off screen, and the focusable named
 * scroll region axe then asked for. schema-ahead-of-code grew by 1 when
 * ticket_scans.client_scan_id joined the manifest; guard-registry counts the
 * new guard.
 *
 * 2026-09-05 (B2, multi-scanner realtime sync, Scope v5 3.13): 286 files /
 * 3336 tests. Three files, 28 tests, plus 1 in guards/offline-door-integrity,
 * which now holds every later re-definition of the door list to the no-secret
 * rule. tests/unit/scanner/door-live pins the channel name and filter, the
 * status words, the strict row reader, the subscribe and leave, the local
 * move a live row makes (on fake-indexeddb), the feed of other doors and the
 * count line; scanner/door-realtime-migration the publication, the door list
 * leading with ticket_id, scan_ticket's fourth argument recorded on all three
 * audit inserts, the probe function's grants and the wss connect-src;
 * guards/door-live-published the guard's decision table and its read-only ask.
 * door-live also pins that the session token reaches the realtime socket
 * BEFORE the channel is joined, the first B2 drive's finding: joined before
 * the token, the channel carried the anon key and the row policy denied every
 * row, so both doors said live and heard nothing.
 *
 * 2026-09-05 (C1, the types-drift repair on origin/main): 288 files / 3350
 * tests. Two files, 14 tests. tests/unit/ci/types-drift-wrapped-leaves pins
 * the generated file's wrapped spelling (a bare `key:` with the union on the
 * following | lines), which the parser used to drop from BOTH sides: ten
 * enums in public.Enums were never compared, and the enum column
 * 20260905000003 introduces read as removed. types-drift-enum-conversion
 * reads that migration from disk and drives the real classifier over the real
 * pre- and post-migration shapes: pending with the migration in the tree,
 * in sync once applied, drift without it, drift for the hand-written union
 * that put origin/main red at dc71374e. Plus tests/component/revenue-summary
 * (3): the organiser's revenue panel shows ONE fee line, folds a pre-15-August
 * processing_fee_cents into it, and never names a processing line (found on
 * the C1 drive; the plural had slipped past one-fee-copy). 289 files / 3353.
 *
 * 6 September 2026 (close-out C2, CI hygiene): 293 files / 3398, four files,
 * 45 tests. tests/unit/guards/workflows-skip-drafts pins the line reader and
 * the two halves of the draft rule on fixtures and on every real workflow;
 * tests/unit/guards/pre-push-gate-wired pins the hook reader on each way the
 * wiring dies quietly; tests/unit/ops/pre-push-gate pins which pushes are
 * judged and derives CI's command list from ci.yml so a check with no local
 * twin goes red; tests/unit/security/production-write-preflight-layers pins
 * that a lower env source cannot re-point the target (the reason .env.local
 * had to be parked around every push). This floor was measured WITH
 * .env.local present: 0 failed. Plus five in pre-push-gate for
 * judgeLighthouseRun, the narrow tolerance for the Windows profile-cleanup
 * race that failed every run of the first push: 293 files / 3403. Plus
 * tests/unit/ci/seo-audits-indexability (4): a loopback host is asserted as
 * production (crawlable, minus the auth routes the app noindexes), a preview
 * still fails when indexable, an unknown host is still only noted, driven as
 * a child over synthetic reports: 294 files / 3407. Close-out C3 (6 September
 * 2026), three files, 42 tests: tests/unit/broadcast/artefact-channels (the one
 * channel list and every module that used to carry a copy), tests/unit/guards/
 * card-raster-traced (the import-graph walk, the config reader, the pin judge
 * with Next's own matcher, and the postbuild trace judge red and green), and
 * tests/unit/ops/src-alias-loader (the resolve hook a script loads src/ through):
 * 297 files / 3449. Then the share-card repair inside the same close-out, one
 * file and 27 tests: tests/unit/guards/og-single-rasteriser, which pins the ban
 * on next/og anywhere under src (the library whose sharp path dropped the
 * connection on every per-event card), the two bugs that guard shipped with
 * (a specifier matched against string-blanked source, and the views object
 * handed in where raw text was expected, either of which made it green over two
 * routes that imported next/og on line 1), and the `inset` shorthand satori
 * ignores, which is why no scrim on any share card had ever drawn. Plus the
 * numbered metadata routes and both trace shapes in card-raster-traced:
 * 298 files / 3476. Close-out C13 (6 September 2026), six files and 51 tests:
 * tests/unit/events/event-lifecycle (the table is total, cancelled and completed
 * archive, archived leaves only by restore and restore is exact),
 * tests/unit/events/delete-eligibility (the ONE SQL count read into the
 * interface, a missing key never reads as zero, the trigger's refusal is
 * recognised), tests/unit/events/gone-page (the 410 body and the typed
 * confirmation), tests/unit/admin/event-actions-lifecycle (the console has no
 * dead end either), tests/unit/guards/event-lifecycle-installed (the database
 * guard's decision table and the flags it requires against the migration's own
 * keys) and tests/unit/guards/event-lifecycle-total (the static guard's
 * judgement, the door predicate reader, and the live tree through the loader).
 * Measured with the harness shell's production Vercel variables removed, which
 * is the only way the two host-resolver files pass on this machine:
 * 304 files / 3527. Plus three in tests/unit/security/proxy-decisions for the
 * fifth decision the proxy makes since C13: a deleted event's tombstone answers
 * 410 without touching the session, a slug with no live row is marked private
 * to the edge cache because its answer is per viewer, and a live event stays
 * publicly cacheable: 304 files / 3530. Plus tests/unit/security/signed-in-marker
 * (7): the marker cookie the routing layer reads before any function runs,
 * set and cleared by the session middleware, required by the archived view,
 * and the condition on the event page's public edge cache rule, after the
 * preview showed a proxy-set cache header does not reach Vercel's decision:
 * 305 files / 3537. Plus three in proxy-decisions for the sixth decision: a
 * request carrying the marker for a slug with no live row is REWRITTEN to
 * /events/[slug]/holder (the edge looks a URL up before any function runs and
 * cookies are not part of its key, so the holder had been served the
 * stranger's cached 404), the session cookie alone never triggers it, and a
 * live or deleted event is never rewritten: 305 files / 3540. Close-out C14
 * (6 September 2026), one file and ten tests: tests/unit/guards/no-hardcoded-spacing
 * (the 4px scale, tokens and relationships pass, every term of a shorthand is
 * judged, widths and heights are not spacing, and the live tree is clean):
 * 306 files / 3550. Close-out C16
 * (7 September 2026), two files and nine tests: tests/unit/ops/production-parity
 * (a migration production lacks is pending; the production scope of the store is
 * judged for a missing, forbidden, empty or malformed record, never carrying the
 * value) and tests/unit/guards/branch-protection-required (every way main's
 * protection can lose the merge gate): 308 files / 3559. Close-out C16, Law 10
 * (7 September 2026), one file and nine tests: tests/unit/ops/apply-production-migrations
 * (the founder's migration step as one command: nothing pending is nothing to
 * do, a dry run stops, anything but the production ref is refused, the push
 * carries no credential on its command line, the CLI rests on TEST last, and
 * package.json routes the command through the Credential Manager helper), and
 * two more in tests/unit/ops/production-parity (the Vercel CLI's own login is
 * found in XDG order and a token near expiry is expired, so the environment
 * half of the gate runs on a developer machine with no minted token), and one
 * in tests/unit/guards/node-surface-inherited-members (the surface manifest
 * records what process inherits as an EventEmitter, after process.on was
 * reported as an API Node 24 lacks): 310 files / 3570, as the canary measured
 * (the 3559 floor above had been set one below the suite's own count).
 * Close-out C16, the deployment-state guard (7 September 2026), one file and
 * eighteen tests: tests/unit/guards/preview-deployment-state (the commit under
 * test on a push, on a pull request from the payload head and locally from
 * git; READY, ERROR, BLOCKED, CANCELED, DELETED and the unsettled states; the
 * race and the false green that the first version of the guard had, proven
 * with a fake clock; the timeout; the creation grace; no wait outside CI; the
 * v7 sha filter): 311 files / 3588, as the canary measured.
 *
 * Close-out C16, the founder's migration command (7 September 2026), four
 * tests in tests/unit/ops/apply-production-migrations (askLine, the
 * confirmation read: first line only, CRLF or LF; a closed stdin is a
 * refusal; the prompt precedes the read; never readline, whose closed
 * interface leaves a line read pending on the console that swallows the
 * Enter meant for the CLI's own prompt): 311 files / 3592.
 *
 * Close-out C8 (6 September 2026, brought up to date after C16), one file and
 * six tests: tests/unit/guards/one-priority-image (a grant is recognised, a
 * pass-through is not, reach past the first item fails, an unlisted grant
 * fails, a rotted list entry fails, and the live tree is clean): 312 files /
 * 3598, as the canary measured.
 *
 * The C8 bring-up (7 September 2026), the two gate defects C16 found on the way,
 * one file and nine tests: tests/unit/ops/pre-push-gate (killTree, five: exited,
 * clean taskkill, non-zero taskkill, taskkill cannot start, elsewhere) and
 * tests/unit/ci/types-drift-messages (four: cannot start, elsewhere, refused,
 * the cap): 313 files / 3607, as the canary measured.
 *
 * Close-out C8 CORRECTED (7 September 2026), two files and twelve tests:
 * tests/unit/ci/lighthouse-truth-table (eight: median, the LCP element named,
 * errored, absent, the Lighthouse 13 insight, script bytes, one row per URL,
 * the markdown table) and tests/unit/ci/lhci-pin-agreement (four: an exact
 * version, the workflow's three mentions, the admin script, the config note):
 * 315 files / 3619, as the canary measured.
 *
 * Close-out C17 (7 September 2026), two files and eleven tests:
 * tests/unit/home/homepage-hero-curated (seven: the set read from the
 * attribution file, the licence holder named, every slug backed by both
 * rasters, deterministic within a day, turning over across days, always a
 * member, the day count) and tests/component/hero-raster (four: the priority
 * raster while loading, the treatment on error, the treatment for a failure
 * before hydration, a loaded raster left alone): 317 files / 3630, as the
 * canary measured. The C17.6 sweep added tests/component/events-empty-state
 * (three: unfiltered, filtered, a query): 318 files / 3633, as the canary
 * measured. C17.4 added tests/unit/home/hero-scrim (three: the seven stops,
 * never darker higher up, the headline band held at 0.78): 319 files / 3636,
 * as the canary measured.
 *
 * Close-out C9 (7 September 2026), two files and 10 tests:
 * tests/unit/geo/venue-save-rule (the environment read, the key absent refused
 * by name, the browser key the same, Google refusing named, development allowed
 * with the reason, coordinates and virtual and no address allowed, hybrid judged
 * like in-person) and tests/unit/security/google-maps-server-key-scopes (required
 * on production and preview, forbidden on the Development store, optional for a
 * local process): 321 files / 3646, as the canary measured.
 
 *
 * Close-out C18 FINAL (7 September 2026), one file and 7 tests:
 * tests/unit/scope/community-layer-approved (the record equals the source for
 * the 21 communities, the 20 matrix cities, the faiths and the hero categories;
 * every Scope v5 line 351 category maps to one slug; the addendum names every
 * slug and is marked approved; the scope points at the addendum without its
 * body changing): 322 files / 3653, as the canary measured.
 */
/*
 * Close-out C19 (8 September 2026), two files and 27 tests:
 * tests/unit/seo/indexing-policy (eleven: every page route classified and every
 * classified route still on disk, no route classified twice, all four classes in
 * use, every private prefix classed never, the threshold a single constant, the
 * boundary, the three metadata blocks, and the root layout carrying no canonical
 * while the homepage carries its own) and tests/unit/seo/discovery-counts
 * (sixteen: each matcher against the SQL it mirrors, and each count composing
 * them the way the pages compose the query). The four new drills on
 * indexing-policy and the three rewritten seo-audits-indexability cases sit in
 * files that already counted: 324 files / 3680, as the canary measured.
 */
/*
 * Close-out C19, the roast pass (8 September 2026), one file and 21 tests:
 * tests/unit/seo/indexing-rules (all five driven rules judged in BOTH
 * directions, which two of them had never been). The three rewritten
 * permanent-redirect assertions sit in a file that already counted:
 * 325 files / 3701, as the canary measured.
 */
/*

 * Close-out H3 / P0.5 and P0.2 (8 September 2026), one new file and eleven new tests:
 * tests/unit/ci/gate-client-sdk-parity (seven: the local gate can never again
 * build a browser bundle CI does not measure), and one added to
 * tests/unit/security/pii-egress asserting that replayIntegration() is
 * constructed in exactly ONE file, so a security test can never again be
 * pointed at a file that has stopped deciding anything, and three added to
 * tests/unit/security/security-headers holding the parity DSN to a loopback
 * origin so it can never widen the deployed policy:
 * 328 files / 3748, as the canary measured.
 */
/*
 * Close-out P0.7 and L3, the ratchet (8 September 2026), one new file and
 * nineteen new tests: tests/unit/ci/lighthouse-floor-ratchet, which pins the
 * seven performance floors now in force as literals and drives the guard's
 * ruling in all six directions it must refuse, so lowering a floor takes three
 * files rather than one character:
 * 329 files / 3767, as the canary measured.
 */
/*
 * Close-out P0.7 (9 September 2026), one new file and sixteen new tests: the
 * gate now says WHICH of a red score's two causes it was, the page or the
 * laptop. tests/unit/ci/lighthouse-calibration pins the judgement in all three
 * states from the real readings on both days (13), and three more in
 * tests/unit/ops/pre-push-gate cover the report reader on the failure path,
 * where a diagnosis that threw would replace the failure the reader came for:
 * 330 files / 3783, as the canary measured.
 */
/*
 * The positioning lock (owner ruling 7 September 2026, worked 8 September,
 * rebased onto main and landed 9 September), one new file and 25 tests:
 * tests/unit/brand/positioning (the six locked strings, the copy laws applied
 * to each of them, and the nine surfaces that carried the retired strapline now
 * reading it from the one source, plus the approved homepage hero composition
 * surviving a copy-only change). 26 at first, then 25: the drive found that
 * `home-hero.tsx` is rendered by nothing, so the two tests reading it were
 * replaced by three reading the hero that does render. Measured 326 files /
 * 3726 against the 8 September base; re-measured after the rebase onto
 * 330 / 3783:
 * 331 files / 3808, as the canary measured.
 */
/*
 * Close-out PR HYGIENE, PR5 (9 September 2026), one new file and eleven new
 * tests: tests/unit/guards/one-pull-request-at-a-time. Eight drive the pure
 * judgement over every shape the rule can take (zero open, one active, two
 * active, many parked plus one active, all parked plus two active, an entry
 * whose pull request has closed, an entry whose branch has moved, an entry with
 * no why and one with no unblockedBy), and three hold the SHIPPED parked record
 * itself: every entry complete, the record judging itself clean in the state it
 * was written in, and an audit date that is a date, so its age is visible
 * rather than assumed:
 * 332 files / 3819, as the canary measured.
 *
 * Close-out L5 (9 September 2026), one new file and twenty seven new tests:
 * tests/unit/verify/launch-readiness. Three drive the one-sentence rule the
 * OWNER BLOCKED state inherits from C10.4, including a full stop inside a path
 * and inside a version number; fourteen drive the judgement over every way a
 * readiness row can lie (a PASS with no evidence, with evidence that is not on
 * disk, with no date driven, or naming an owner need beside it; an OWNER BLOCKED
 * with no need, an unreviewed need, a two sentence need, or evidence cited as if
 * it were driven; a FAIL saying nothing; a missing row, an invented row, a
 * duplicate row, a state outside the three); two hold the anti-rot rule on the
 * owner-need list, added after the list was found holding an entry no row cited;
 * three hold the SHIPPED adjudication (sixteen rows numbered one to sixteen,
 * every owner need one sentence, and every OWNER BLOCKED row naming where it HAS
 * been driven so blocked never reads as untested); and four hold the rendering,
 * including that it is byte-stable, which is the property the guard's comparison
 * depends on:
 * 333 files / 3846, as the canary measured.
 *
 * 2026-09-09: raised 333/3846 -> 334/3866, MEASURED by running the suite, not
 * calculated. One file, tests/unit/guards/vercel-upload.test.ts, 20 tests, added
 * with the fix for the fourth deployment lost to .vercelignore. Six prove the
 * ignore grammar (a bare name at any depth, the rule that a file inside an
 * excluded directory can never be re-included, the walk-down that actually
 * re-includes one, comments, and a refusal for every pattern outside the
 * grammar); four prove the MECHANISM that cost the deployment, chiefly that an
 * ignored file is stripped while its DIRECTORY is left standing, which is why
 * "the directory is absent" was the wrong test for the build host; five prove
 * the two-fact discriminator that replaced it; and four hold the shared registry
 * the two guards read, so the required and the tolerant halves cannot rot apart.
 *
 * 2026-09-09: raised 334/3866 -> 335/3876, MEASURED by running the suite, not
 * calculated. One file, tests/unit/guards/guard-run-report.test.ts, 10 tests,
 * added with close-out F1.1, the gate that would not name the guard it caught.
 * Five drive REAL child processes rather than hand-written spawnSync shapes,
 * because the thing under test is what Node actually hands back for a script
 * that exits non-zero, and they hold the three faults apart that used to read as
 * one: a guard that exited non-zero, a guard killed by a signal, and a guard
 * that could not be started at all. Five hold the report itself, chiefly that
 * the LAST line names every guard that failed, because a build log is read from
 * the bottom, and that the count and the names can never disagree.
 *
 * 2026-09-09: raised 335/3876 -> 336/3898, MEASURED by running the suite. One
 * file, tests/unit/ci/build-scope.test.ts, 10 tests, holds the three-way scope
 * that close-out F1.3 asked for: chiefly that a CI runner BLOCKS rather than
 * warning, and that a Vercel build carrying CI=1 is still judged as Vercel,
 * because Vercel publishes CI=1 on its own builds and testing CI first would
 * call every deployment a runner. The other twelve are the manifest contract
 * tests, which iterate the manifest itself: four CI_ entries were declared, so
 * the suite grew without a line of test code being written for them, which is
 * the manifest doing its job.
 *
 * 2026-09-09: raised 336/3898 -> 337/3905, MEASURED by running the suite. One
 * file, tests/unit/guards/clause-verdict.test.ts, 7 tests, holds close-out
 * F1.6: one guard that skipped for a different reason in a different sentence
 * shape on each of the three machines that ran it. Three prove the vocabulary is
 * a CLOSED set, including that an invented sixth shape throws at the call site
 * rather than printing; four prove the rendered line always carries the code AND
 * the build scope, and that a not-judged verdict always carries the remedy, so a
 * skip is never a dead end.
 *
 * 2026-09-09: raised 337/3905 -> 338/3917, MEASURED by running the suite. One
 * file, tests/unit/guards/stripped-or-deleted.test.ts, 11 tests, holds close-out
 * F1.9.2 PART THREE, the fourth deployment lost to .vercelignore. Six drive the
 * determination against REAL trees on disk rather than a fake filesystem, one
 * per combination of excluded and on-Vercel, including the exact shape that cost
 * the deployment: a directory left standing with the file gone. One holds the
 * shared-determination count. Four hold the walk-down being DERIVED rather than
 * described, because doing that derivation by hand is what lost one of the other
 * three deployments. The remaining test moved inside vercel-upload.test.ts.
 *
 * 2026-09-09: raised 338/3917 -> 338/3921, MEASURED. No new file: four tests
 * joined tests/unit/guards/vercel-upload.test.ts after the preview build of
 * ffded236 died on isGitCheckout, which was existsSync('.git') and had never
 * been run on the one host it was written for. .vercelignore names `.git`, so
 * Vercel strips the FILES inside it and leaves the DIRECTORY: `.git` was present
 * and empty, existsSync said checkout, git said "fatal: not a git repository".
 * Three pin the three shapes apart (empty directory, directory holding HEAD, and
 * a FILE, which is what each of this repository's nine linked worktrees has) and
 * one asserts the materialised upload now carries the same empty skeleton, so
 * the simulation is of the build host rather than of somewhere else.
 *
 * 2026-09-09: raised 338/3921 -> 338/3924, MEASURED. No new file: three tests
 * joined tests/unit/verify/launch-readiness.test.ts after the shipped report was
 * found saying the gap was "exactly three approvals wide" while OWNER_NEEDS held
 * TWO. The third had been removed when the anti-rot rule found the list holding a
 * need no row cited, and the prose was never touched. Both numbers in that
 * paragraph are derived now, and the tests fail if either goes back to being
 * typed: one counts the approvals from the rows, one moves the sentence when a
 * third need appears, one counts the rows that record where they HAVE been
 * driven. A hand-written count in that document is a second place a claim can
 * live, which is the exact thing the report exists to prevent.
 *
 * 2026-09-09, later: raised 338/3924 -> 341/3981, MEASURED. Close-out F2, three
 * new files:
 *
 *   tests/unit/guards/build-host.test.ts       F2.1, the three capabilities the
 *                                              Vercel build host does not have
 *                                              and the registry that declares them
 *   tests/unit/guards/gitignore.test.ts        F2.2, enumerating a tree with no
 *                                              git, tested against git itself
 *   tests/unit/guards/git-availability.test.ts F2.4, the four shapes .git takes
 *                                              and the one sentence all seven
 *                                              git readers print
 *
 * Two of those files are worth the canary knowing about specifically, because
 * they assert against the REAL repository rather than a fixture: the walk is
 * compared path for path with `git ls-files`, and every git-declaring entry
 * point is required to reach the shared availability module. Both would go quiet
 * rather than red if somebody deleted them, which is what this canary is for.
 *
 * 2026-09-10: raised 348/4065 -> 352/4121, MEASURED. Close-out UX3, four new
 * files:
 *
 *   tests/unit/notifications/platform-policy.test.ts   what the owner is told
 *                                              and when, including the daily
 *                                              ceiling AT ITS BOUNDARY: the Nth
 *                                              paid order is individual and the
 *                                              (N+1)th is held for the digest
 *   tests/unit/notifications/platform-send.test.ts     delivery: recorded,
 *                                              retried, escalated to the second
 *                                              channel, and loud when both fail
 *   tests/unit/cron/platform-notify.test.ts    the worker refuses an
 *                                              unauthenticated caller before it
 *                                              reads anything, and reports a
 *                                              failure as a failure
 *   tests/unit/guards/platform-notifications-installed.test.ts  the guard that
 *                                              refuses a build whose database
 *                                              could let a state change go
 *                                              unrecorded
 *
 * 2026-09-10: 355 files / 4195 tests. Close-out UX4 and H2.6, the notification
 * ROUTING, plus one defect found while auditing it.
 *   tests/unit/ops/state-report.test.ts        the stall judged at the six hour
 *                                              boundary in both callers' modes,
 *                                              the guard named out of a failing
 *                                              run log, and a daily report that
 *                                              says the same thing in text and
 *                                              in HTML
 *   tests/unit/guards/alert-routing.test.ts    no branch gate may email, every
 *                                              dispatch declares its class, and
 *                                              a drill announces itself
 *   tests/unit/guards/cron-routes-scheduled.test.ts  /api/cron/queue-admit had a
 *                                              route handler, a header saying it
 *                                              ran every minute, and no schedule
 *                                              at all
 *   the alert-dispatch and workflows-skip-drafts files also grew, with the class
 *   grammar, the drill verdict, and the push-only condition that lets ci.yml's
 *   main-red alert exist without running on a draft
 */
/*
 * The ticket types that were deleted and re-created on every save (found
 * 10 September 2026 while reading the write paths a slot ledger would hook
 * into), one new file and twenty tests: tests/unit/events/save-tiers. Three
 * drive which ticket type is which (a client-minted id, a database id, an empty
 * one); six drive the payload the database function reads (dollars to cents
 * once, a price a person could type, a saved id carried, a new one sent empty,
 * a blank sale window that must not become the word null, and the array
 * position standing in for a missing sort order); five read the verdict back,
 * including the three refusals and the shape it must REFUSE to read rather than
 * assume success; and six hold the words an organiser reads, one of which
 * asserts no database word ever reaches them, because what they were shown was
 * `duplicate key value violates unique constraint
 * "ticket_tiers_event_id_name_key"`.
 *
 * tests/unit/security/update-event-idor also grew no tests but got stricter:
 * the admin mock now answers rpc and RECORDS it as a privileged write, so a
 * caller who fails the ownership gate and reaches save_event_ticket_tiers fails
 * that test. Before this it had no rpc at all and the success path died with
 * "admin.rpc is not a function", which is how the regression announced itself:
 * 356 files / 4215, as the canary measured.
 *
 * 2026-09-10: raised 356/4215 -> 358/4237. Close-out UX6, the mobile checkout
 * layout. tests/unit/checkout/viewport-fit-rule holds the rule that decides
 * whether a buyer surface fits its viewport, including that its three exemptions
 * stay conjunctive so `aria-hidden` cannot launder a real control past the
 * check, and that `html, body { overflow-x: clip }` is still in globals.css,
 * because that rule is the whole reason the box-level assertion exists.
 * tests/unit/email/guest-ticket-recovery holds both branches of the sentence
 * that used to send every guest buyer to a login they could not pass. Two more
 * tests landed on viewport-fit-rule as the drive found what the rule could not
 * yet see (a control PUSHED past the edge rather than parked there, and Tailwind
 * v4's standalone `translate` property), taking it to 4239.
 *
 * And 359/4247 in the same item, for the defect the GATE found while UX6 was
 * being closed: the indexing drive caught an organiser profile in the sitemap
 * answering 404, and the server log named a dropped socket to Supabase. A page
 * may never answer "this does not exist" because it could not ask.
 * tests/unit/seo/read-failure-is-not-not-found holds that distinction on the two
 * routes that were folding the two answers together, and holds that the shared
 * retry primitive still recognises the socket class without swallowing a real
 * query fault.
 *
 * And 364/4345 for close-out D1, the slot ledger. Five files: adapter-mapping
 * drives the mapping through the order-level recorders every money path really
 * reaches (35), row-types holds all five row shapes and the closing row against
 * the database's own CHECK constraints (16), pace-curve holds the reader that
 * draws the organiser's panel (16), inventory-diff holds what a save did to the
 * ticket types (9), backfill holds that a re-run writes nothing twice and that
 * a production write is refused (12). Four of adapter-mapping's are the buyer
 * the ledger could not see: `guest_email` is null for 138 of 294 orders on TEST
 * because a signed-in buyer carries `user_id`, so half of every sale row was
 * recording no buyer and no first-time-or-returning flag at all. One more, 4346,
 * for the count the backfill printed: `write` returns ok for the idempotent path
 * as well as for a real insert, so a second run over 244 orders reported "wrote
 * 264 row(s)" having written 34.
 *
 * And 365/4350 for the panel itself, found by DRIVING it rather than reading
 * it: against a real slot with 28 backfilled sales it read "Reached checkout 0,
 * Did not finish 0, Looked at the page 0" beside "28 sold, $665 taken". Not one
 * of those zeros was true. The backfill refuses to invent demand rows for a
 * period nobody measured, and the panel was telling that lie on its behalf.
 * tests/component/sales-pace-panel holds the four states apart, including that
 * a REAL zero is still shown.
 *
 * And 371/4455 for close-out D2, the recovery engine. Five new files and one
 * grown one. Every case in them is a way a REAL PERSON is written to when they
 * should not be, which is the only kind of defect in this feature that costs
 * something that cannot be bought back: waitlist (19) holds the queue order, the
 * hold that runs out and passes down the list, and the person who let their turn
 * lapse not being offered the same place for ever; message (20) holds that the
 * copy comes from the slot's own category, so a gym reads "class" and this
 * platform reads "ticket" out of one function; engine (13) holds that the send
 * record is written BEFORE the message leaves, that no message goes without a
 * working unsubscribe, and that a failed send is counted rather than swallowed;
 * proof (10) holds the four numbers the organiser's panel claims, including that
 * a sale BEFORE the message is not a recovery and that three messages to one
 * person is one person; the component test (11) holds that a slot nobody
 * abandoned reads as nothing to recover rather than as zero recovered, which is
 * the exact defect the sales pace panel was caught in the day before.
 *
 * The three added to the existing files follow the sender: the waiting-list
 * message moved into the engine so one freed unit produces one message, so
 * sender-domains grew the assertion that the engine reaches the one sender
 * module through the shared transport rather than by building its own client.
 *
 * And 4464 for what DRIVING the engine found, which no unit test would have:
 * a rate over sixteen sends cutting the whole sequence to one message on a
 * single unsubscribe (six tests on the minimum a rate needs to be a rate), and
 * an attribution query appended AFTER a fragment, so the parameters were never
 * parameters and the link stopped landing on the ticket selector (three tests
 * on where a query goes).
 *
 * And 373/4499 for close-out UX5, the two-factor enrolment page. Two new files
 * and eight tests added to an existing one, and every one of them exists
 * because of something a screenshot could not have told anybody.
 *
 * tests/unit/admin/enrol-2fa-qr holds the QR at the SOURCE: the picture decodes
 * back to exactly the URI it was built from, its secret is the one printed
 * beside it, and that secret is a working RFC 6238 secret computed
 * independently and verified by the application. A QR that decodes perfectly to
 * a secret nothing accepts is still a lockout.
 *
 * The eight in tests/unit/admin/totp are for a defect three separate places
 * described three different ways. `formatRecoveryCode(randomBytes(5))` base32-
 * encodes to EIGHT characters, so `slice(7, 10)` returned ONE, and every
 * recovery code the platform ever issued looked like `oafj-don-3` at 40 bits,
 * while its own comment claimed "10 hex chars grouped 4-4-4" and the admin
 * login field advertised `abcd-efg-hij`. Seven bytes makes all three agree at
 * 50 bits, and one of the tests now reads the placeholder out of the login form
 * so the form and the generator can never disagree again.
 *
 * tests/component/layout/bottom-nav-clearance holds the 64px the root layout
 * reserved for a bar that ten route prefixes never draw. None of those ten
 * renders SiteFooter, which is what paints that strip everywhere else, so the
 * admin console ended in a band of pale canvas under a dark surface at 390.
 * The tests read the prefix list out of the bar's own source, so a prefix added
 * there is covered the moment it is added, and they hold BOTH directions:
 * losing the reservation where the bar IS drawn would put the tab bar on top of
 * the footer's last row, which is worse than the band.
 *
 * And 374/4503 for close-out UX1, whose signed-in organiser journey had been
 * WRITTEN AND NEVER RUN. It was recorded as blocked on the rate limiter having
 * no Upstash locally, which stopped being true when `startGateServer` was
 * extracted on 10 September. Running it found that the "Organised by" card on
 * every event page named the organiser, drew their initials, clamped their bio
 * and LINKED NOWHERE, while the same page's JSON-LD published
 * `/organisers/<slug>` to Google. The four tests hold the link, hold that it is
 * a SIBLING of the Follow control rather than its ancestor (a button inside an
 * anchor is invalid HTML), hold that the page and its own structured data name
 * the same URL, and hold the accessible name against WCAG 2.5.3.
 *
 * And 375/4510 for close-out UX2.5, the human read of the five launch screens.
 * Where the venue map belongs, the event page was showing Google's own grey
 * panel: "Sorry! Something went wrong. This page didn't load Google Maps
 * correctly. See the JavaScript console for technical details." A third-party
 * developer message, with an exclamation mark, telling somebody buying a ticket
 * to open a console.
 *
 * Every map already HAD a designed fallback and it was being hidden, because an
 * auth failure still resolves importLibrary and still constructs a Map: the
 * component saw a Map, called itself interactive, dropped its own plate, and
 * Google painted the panel underneath. The seven tests hold the contract the
 * four map surfaces share - the hook is installed, installed only once, never
 * overwrites somebody else's, flips the flag, tells every subscriber, survives a
 * surface mounting AFTER the refusal, and unsubscribes cleanly.
 *
 * And 375/4516 for the launch readiness report, which for two days told the
 * owner that production was "one migration behind this tree" while NINE were
 * pending. The number was prose in the adjudication, and the guard that judges
 * the report re-renders that same prose from the same constant it compares the
 * file against, so it agreed with itself on every run. No file changed on the
 * day the sentence stopped being true, which is exactly how a version pin rots
 * (Law 9). The six tests hold the clause that now refuses it: the exact sentence
 * that shipped, a digit count as well as a spelled one, a count hidden in a row
 * rather than in a need, the fault naming where it was written, the shipped
 * adjudication staying green, and the negative case that keeps the clause alive
 * by proving an UNCOUNTED mention of migrations still stands.
 *
 * And 376/4522 for the push opt-in (close-out UX3.2). Every FIRST press of the
 * owner's backup-alert control failed, on a fresh profile, in silence:
 * `register()` resolves before the worker is running, so
 * `pushManager.subscribe()` threw "Subscription failed - no active Service
 * Worker", and the catch reported it as 'idle', which is the state an unpressed
 * control shows. A SECOND press always worked, which is why it survived: anybody
 * debugging it presses twice. The six tests hold both halves - subscribe waits
 * for 'activated', a worker gone 'redundant' ends the wait instead of hanging
 * the button, and a refused press never lands in the same state as a press that
 * never happened. All six were drilled RED against the pre-fix hook and returned
 * the browser's own sentence.
 */
/*
 * RAISED 11 September 2026, close-out S1: 376 files / 4522 tests to 378 / 4567.
 *
 * Two files added and one rewritten.
 *
 * tests/unit/stripe/account-health.test.ts asserts S1's severity table exactly
 * as S1 writes it - RED on charges_enabled false, payouts_enabled false, a
 * disabled_reason or anything past_due; AMBER on currently_due, a deadline
 * inside 14 days, or pending_verification older than 3 days; GREEN only when an
 * account can charge, can be paid out and owes nothing - plus the ONE narrowing
 * and the account on TEST that forced it. acct_1U2EYNGsSxcPFPRu is an abandoned
 * signup: never onboarded, so RED on four counts under the literal rule, and RED
 * maps to an email every thirty minutes for ever. It is AMBER, and a test holds
 * that an account which DID onboard and then broke is still RED, which is the
 * whole point of the narrowing.
 *
 * tests/unit/health/heartbeat-email.test.ts asserts the daily email itself,
 * through the product's own builder rather than a copy, because S1's premise is
 * that a monitor which is wrong about nearly every organiser destroys the value
 * of every other line in that email.
 *
 * tests/unit/stripe-business-profile.test.ts lost the five assertions about the
 * DELETED name comparison and gained seven about the connected account's
 * descriptor prefix, which S1 requires to be set explicitly at creation and
 * never left to Stripe's fallback.
 *
 * Then 4567 to 4574, same commit, after the self-audit caught a requirement the
 * first pass had dropped. S1's reversal condition says "page it and report the
 * page count, do not sample", and the replacement had inherited
 * `/v1/accounts?limit=100` with no paging from the check it replaced. On the
 * 101st connected organiser it would have gone on reporting green with an
 * unknown number of accounts never looked at. Seven tests on the paging loop,
 * including the cursor Stripe's own page documents and the runaway stop.
 *
 * Then 378/4584 to 379/4602 on 12 September 2026, the types-cover-migrations
 * guard. The first push after the founder applied ten migrations to production
 * was refused by the types-drift guard with 285 unexplained differences, every
 * one an object the tree's own migrations create: five migrations had been
 * committed without regenerating src/types/database.ts, and the drift guard
 * could not see it while production was equally behind. Eighteen tests in
 * tests/unit/guards/types-cover-migrations.test.ts drive the replay (create,
 * rename, drop, trigger functions excluded, runtime-built names skipped) and
 * the judgement, and the last two run it over the real migrations and the real
 * committed types, so the suite itself now refuses a stale types file.
 *
 * Then 379/4602 to 380/4606, 12 September 2026, close-out UX6 driven on the
 * first preview to hold a live Stripe TEST key. At 390 the buyer landed on the
 * Pay button with every card field above the screen: Chrome's scroll anchoring
 * followed Stripe's skeleton and then its frame as they inserted above the
 * fold (scrollY 145 to 381 to 890, measured). Four tests in
 * tests/component/checkout-payment-step.test.tsx hold the fix: the step opts
 * out of scroll anchoring, starts at the top, and focuses its heading.
 *
 * Then 380/4606 to 380/4609, 12 September 2026, close-out D1. The backfill
 * learns the founder's named approval for the one production run; three
 * tests in tests/unit/ledger/backfill.test.ts hold that a production write is
 * refused without it, allowed with it (naming the approval and deferring to
 * the shell preflight), and refused again when the approval is blank.
 *
 * Then 380/4609 to 381/4614, same day, after the approved run had written.
 * The child ran with no ORDER_ACCESS_SECRET in its shell, so its three
 * production rows carry a buyer_hash keyed with the empty secret while every
 * live row is keyed with the real one, and the engine's "never anyone who
 * already bought" would have missed those two buyers for ever. The engine now
 * asks with every shape a row can carry (identityFingerprints): three tests in
 * tests/unit/ledger/identity.test.ts, one each in the due and waitlist rules.
 *
 * Then 381/4614 to 382/4624, same day. Three on the schema probe's bounded
 * retry (the preview build of 0fe8c238 was lost to two 504s among ten probes
 * that answered 200 a minute later), and seven on the script that moves
 * Stripe's TEST webhook endpoints to the current preview, after every TEST
 * webhook of the day was found landing on the July alias of another branch.
 *
 * Then 382/4624 to 382/4628, 12 September. Four on the environment the upload
 * simulation hands each entry point (buildHostEnv): CI on 0fe8c238 ran
 * preview-deployment-state inside the simulated upload with the parent's
 * VERCEL_TOKEN and pull request payload, the child judged the real deployment,
 * and the simulation blamed .vercelignore for a failure that had nothing to do
 * with the upload. The child now gets the build host's environment: no CI
 * identity, no credential, no CLI login.
 *
 * Then 382/4628 to 383/4634, 12 September, after the first production smoke
 * following the merge of #145 found /unsubscribe/recovery/<malformed token>
 * answering 500: six tests on isTokenShaped and addressForToken (a malformed
 * token is not found without the database being asked; a real failure on a
 * well-formed one still throws).
 *
 * Then 383/4634 to 384/4639, the same day. Five on the gate's Upstash stub,
 * which the first local route sweep caught answering PING without the base64
 * encoding the client asks for, so /api/health/redis read 503 on a product
 * that was fine (encodeForClient, wantsBase64, exec).
 *
 * 2026-09-12: raised 384/4639 -> 387/4691, MEASURED. The read-failure class,
 * fourth occurrence: the gate's checkout drive saw a published event answer 404
 * at 768 because the events layout's existence read discarded its error.
 * tests/unit/supabase/read-or-throw holds the one door (a row, "no row", or a
 * throw, never a null for "could not ask"); tests/unit/guards/
 * read-failure-is-not-not-found holds the guard's three faults and the shapes
 * that must stay quiet, and sweeps the real tree; tests/unit/seo/
 * read-failure-is-not-not-found grew from the organiser and squad pins to every
 * route and helper that now reads through the door; and
 * tests/unit/supabase/undeduped-fetch holds that every Supabase request carries
 * its own signal, because the blink proof showed a retry inside a render was
 * being handed the framework's memo of the first failure rather than a request.
 *
 * 2026-09-12 (later): raised 387/4691 -> 388/4697, MEASURED. The push of the
 * fix above was refused at checkout-viewport after nine seconds: "no published,
 * unseated, sellable PAID event with room for two", because the step's own
 * earlier runs had left 77 of the only paid event's 100 places in reservations
 * nothing on TEST ever expires. tests/unit/ops/checkout-proof-leaves-test-as-found
 * pins that the drive now runs the product's own sweep before it picks and
 * expires what it reserved when it ends.
 *
 * 2026-09-13: raised 388/4697 -> 389/4721, MEASURED on a clean run of the whole
 * suite (0 failed, 0 skipped). Two additions, both about an instrument lying
 * about itself. tests/unit/verify/stripe-cli-keys holds the reader that sources
 * a Stripe TEST key pair out of the CLI config, matches the pair by account,
 * and refuses a live or an expired key without ever printing one. And fourteen
 * more in tests/unit/ci/lighthouse-calibration pin the middle calibration
 * state: on the first day of the three lane protocol the gate printed "this
 * machine was fit to judge, so a failure above is a statement about the
 * product" over three URLs whose own runs had been taken on a starved CPU, with
 * zero product bytes changed since a tip that had passed the same step.
 *
 * 2026-09-13 (later): raised 4721 -> 4726, MEASURED. Five more on the sales
 * pace panel, for the second surface that draws it: /admin/events/[id] renders
 * the same curve for the platform owner, because the one real production event
 * belongs to an outside organiser and the owner had nowhere to read it. They
 * hold that the tone is PAINT and never arithmetic (identical chart geometry
 * and an identical table), that the heading stops saying "your" on a screen
 * that is not the organiser's, and that no light-surface token survives onto
 * the dark card.
 * 2026-09-13 (later still): raised 389/4726 -> 390/4740, MEASURED on a clean
 * run of the whole suite. One new file, tests/unit/a11y/busy-region-names-itself.test.ts,
 * carrying 14 tests: the drill for the new busy-region-names-itself guard, and a
 * re-derivation of that guard's pinned axe-core role table from the installed
 * package, so an axe upgrade that moves the table turns this red rather than
 * quietly widening what the guard lets through.
 * 2026-09-13: raised 388/4697 -> 388/4698, MEASURED. One test added, and it is
 * worth naming because of where it fails. `materialiseVercelUpload` created the
 * empty `.git` skeleton only when `.git` was a DIRECTORY, and in a linked git
 * worktree it is a one-line FILE, so the simulation produced an upload with no
 * `.git` at all and `vercel-upload.test.ts` failed on the assertion that keeps
 * it honest. That was invisible from the main checkout and unavoidable from a
 * worktree, and since 13 September this build runs three lanes with two of them
 * in worktrees: the only tree that can push was the only tree that could not see
 * it. The new test builds the worktree shape itself, so it fails from anywhere
 * the pointer is not followed.
 *
 * 2026-09-13 (later): raised 388/4698 -> 388/4701, MEASURED. Three tests added
 * to tests/unit/notifications/platform-policy.test.ts, and they are worth naming
 * because of what the two tests already there could not see. `platformDayStart`
 * decides the window the owner's daily order-alert ceiling counts, and it
 * subtracted the Sydney wall clock from the instant, which is the day start only
 * while a day is 24 hours long. Both existing tests used a date in the middle of
 * a season, so both passed while the boundary was an hour out on the two days a
 * year that are not, and on 4 October it landed on the PREVIOUS DATE. The three
 * new ones ask the question at the boundary: each transition explicitly, then
 * every hour of both transition days.
 *
 * 2026-09-13 (later still): raised 388/4701 -> 388/4704, MEASURED. Five tests
 * where two stood in tests/unit/notifications/platform-send.test.ts, and the two
 * that went are the point: they ASSERTED THE DEFECT. `sendHeldDigest` escalated
 * on its first email refusal and, with no armed push device, wrote every row
 * `failed` on one attempt, where nothing reads it again. Those two tests pinned
 * that as correct while close-out UX3.2 says in writing "a failure is retried".
 * The five that replace them drive the whole ladder: held on the first refusal,
 * recovered on a later tick, escalated only once exhausted, failed only once
 * exhausted, and the batch counted by its highest attempts so a new order
 * joining cannot reset the clock. A test agreeing with the code is not the same
 * as the code being right.
 *
 * 2026-09-13 (last of the three): raised 388/4704 -> 388/4707, MEASURED. Three
 * tests to the same file, closing the door the fix above left open. The digest
 * counts a batch by its HIGHEST attempts, which is only sound while every
 * attempt on a held row was a DIGEST attempt. It was not: a row that failed as
 * an individual email keeps its counter, and the dispatcher held it with that
 * counter intact, so a batch could arrive already at the bound and give up on
 * its first refusal - the same unrecoverable loss, through another door. The
 * three ask it as one story: the hold hands the digest a fresh count and keeps
 * the history, the digest still gets all three attempts, and the held order is
 * delivered on a later tick so one individual refusal costs nothing.
 *
 * 2026-09-13 (the quiet hours): raised 388/4707 -> 390/4728, MEASURED. Two new
 * files and 21 tests, and the reason they did not exist is the defect itself.
 * /account/notifications promises "nothing arrives inside your quiet hours". The
 * window was collected by that screen, validated by the API, stored on
 * notification_prefs and READ by the dispatcher on every send, and nothing ever
 * consulted it: `isWithinQuietHours` was exhaustively unit tested and its only
 * caller was its own test file. There were NO tests of dispatchAlert at all, so
 * nothing noticed that a user who asked for silence between 10pm and 7am was
 * pushed at 3am. tests/unit/notifications/dispatch.test.ts drives the dispatcher
 * itself (held rather than dropped, delivered on the next run, the user's own
 * clock, a timezone the runtime cannot resolve), prefs-route.test.ts refuses the
 * zone that could abort a whole cron pass, and policy.test.ts gains the hour
 * resolution across both daylight-saving transitions.
 *
 * 2026-09-13 (the reporter's own silence): raised 390/4728 -> 391/4746,
 * MEASURED. One new file and 18 tests. The daily state says inside its own body
 * "if it does not arrive, that is itself the alert", and the reporter then gave
 * up in the two cases that matter: with no GitHub token it returned null and
 * `main` sent nothing, and any read that threw exited 2 and sent nothing. Three
 * collectors also answered a failed read with an EMPTY LIST, so a morning when
 * the commits API was down reported a quiet day. state-report-collect.test.ts
 * drives the composer with readers that fail on purpose - the only way to see
 * this without waiting for GitHub to have a bad morning - and state-report.test.ts
 * gains the blind stall check, which alerts rather than going quiet because a
 * stall produces silence and a blind check that stays silent looks identical to
 * a healthy one. The sixteenth is the one the DRIVE found rather than the
 * reading: three sections count things, an empty count is the GOOD answer for
 * all three, and a failed read was still printing it. The last two are the
 * SEVENTEENTH AND EIGHTEENTH, and they exist because the driven render at 390
 * caught a fourth section doing it after the guard had already gone green: the
 * last-push line still answered a failed read with "No push to a working branch
 * could be found", which is the absence the stall alert exists to raise.
 *
 * 2026-09-13 (the merge of lane C into the push lane): the two histories above
 * are BOTH kept, because each names tests that exist in this tree and a merge
 * that dropped either would leave the next reader unable to find out why a
 * number moved. The two branches raised the baseline from a common ancestor at
 * the same time, which is why they collided: lane A reached 390/4740 and lane C
 * reached 388/4704, and neither number is right for the merged tree. The value
 * below is MEASURED on the merged tree, never the larger of the two, because
 * the larger of two partial counts is still a guess.
 *
 * 2026-09-13 (lane A, the db-read door): raised 390/4747 -> 391/4760, MEASURED
 * on a clean run. One new file, tests/unit/guards/db-read-door.test.ts, with 13
 * tests on the shared door every build guard now reads the database through.
 * The other three are net: three existing tests in the event-lifecycle,
 * platform-notifications and door-live-published guard suites gained the case
 * that cost a push, that an unreachable database must NOT be reported as a
 * missing migration. Each of those three previously asserted the misleading
 * sentence and called it correct, so they are corrected rather than added to.
 *
 * 2026-09-14 (lane A, the step log a second writer could destroy): raised
 * 391/4760 -> 393/4770, MEASURED on a clean run. Two new files, ten tests:
 * tests/unit/ops/step-log-survives-a-second-writer (3, one of them a NEGATIVE
 * CONTROL asserting the old truncating open really does destroy an appended
 * line on this platform, so the positive test cannot pass for a reason nobody
 * checked) and tests/unit/guards/shared-log-is-opened-for-append (7, the guard
 * drilled red on 'w' and on 'w+', green on 'a', plus the two judgements it
 * makes: prose is not a call site, and a file that starts no process is out of
 * scope).
 *
 * 2026-09-14 (the merge of lane C into the push lane, the second one): the
 * two blocks above are BOTH kept verbatim and they do NOT form one chain,
 * which is the whole reason this file conflicts every time the lanes meet.
 * They are two lineages that ran in parallel from d137ed2f: lane C counted
 * 388/4704 -> 388/4707 -> 390/4728 -> 391/4746 while lane A counted
 * 390/4747 -> 391/4760 -> 393/4770, and neither end point describes a tree
 * that holds both sets of files. Reading either number off the page would be
 * a guess wearing arithmetic. The value below is MEASURED on the merged tree.
 *
 * MEASURED: 396 files, 4812 tests, 0 failed, 0 skipped.
 *
 * AND ONE THING THE MEASUREMENT ITSELF TURNED UP, recorded because a number
 * taken from a single run is worth exactly as much as the run. The FIRST
 * measuring run on this merged tree reported 4810 passed and 2 FAILED:
 * card-raster-traced.test.ts and no-inherited-git-env.test.ts. Neither
 * reproduced. Both files pass standalone (43 of 43) and a second full run of
 * the same tree reported 396/4812/0/0 with success=true. The total is 4812
 * either way, so the two runs agree about what EXISTS and disagree only about
 * what passed, which is the signature of interference between tests that spawn
 * subprocesses and mutate the tree, not of a test that is wrong. It is NOT
 * written off here: it is in REVIEW-QUEUE.md, and the push gate runs the suite
 * again, which is a third reading on the same tree.
 *
 * 2026-09-14 (lane B, merging origin/verify/l5-launch-readiness): the two
 * histories above and below this line ran in PARALLEL, in two trees, from a
 * common ancestor, so their "raised X -> Y" chains are not one chain and cannot
 * be read as one. Both are kept verbatim because each names what it counted.
 * The pair below is MEASURED on the merged tree rather than chained from either
 * side or taken as the larger of the two: the larger of two partial counts is
 * still a guess, which is the rule lane A used on this same file on 13
 * September and it is the rule here. The merged tree MEASURES 407 files and
 * 5233 tests, 0 failed and 0 skipped, on a clean run of the whole suite.
 *
 * The merge also cost a defect, which is the reason a merge is measured and
 * not arithmetic: lane A's new shared-log-is-opened-for-append guard arrived
 * with it and went RED on scripts/dev/lane-b-serve-with-stripe.mjs, which
 * handed the Upstash shim a 'w' descriptor for stdout beside an 'a' for
 * stderr - two independent offsets inside one spawn. Fixed to one openStepLog
 * descriptor in the same pass.
 * 2026-09-13 (lane B, close-out FO1): raised 388/4697 -> 389/4735, MEASURED.
 * tests/unit/growth/founding-organiser-terms holds the Founding Organiser offer
 * to the configuration: what a founding organiser is charged inside and outside
 * the window, what the waived amount is, the fifty cap and its deliberate
 * override, that a referral sale adds exactly three months once, that the four
 * published offer numbers ARE the constants the charge uses, and that the
 * credit is granted by the database on a confirmed PAID order rather than on a
 * signup. Three files that were RED in a fresh git worktree were fixed in the
 * same pass and are counted here: the vercel-upload simulation skipped the
 * .git skeleton when `.git` was a worktree POINTER FILE, the offline-door
 * assertion anchored on a bare newline in a CRLF checkout, and the homepage
 * fixture is generated rather than tracked.
 *
 * 2026-09-13 (lane B, close-out OL1): raised 389/4735 -> 390/4769, MEASURED.
 * tests/unit/growth/organiser-page-and-the-messages holds /organisers to what
 * the outreach messages promise: the live proof block is a read and not a
 * pasted event, every signup button carries the source AN1 counts and no more
 * specific one is clobbered, the founder button opens the brand address rather
 * than a private mailbox, the five objections name no other platform and
 * restate no configured figure, and every section the page carried before the
 * item is still named in it.
 *
 * 2026-09-13 (lane B, close-out AN1, WORK IN PROGRESS): raised 390/4769 ->
 * 391/4828, MEASURED. tests/unit/growth/measurement-and-consent holds the
 * arrival capture, the signup attribution and the consent gate: no measurement
 * script is emitted before the cookie is read, a decision is a record of what
 * was on screen rather than a boolean, and the four providers named in the
 * component are the four the provider table knows.
 *
 * 2026-09-13 (lane B, close-out GA1): raised 391/4828 -> 392/4859, MEASURED.
 * tests/unit/growth/consent-capture-and-the-audience-asset holds the audience
 * asset to its title deed: the price and recency bands at every boundary and
 * in both languages, the community value read from the taxonomy with a
 * negative control for a pasted list, the decline that can never revoke a
 * consent, both checkouts recording the answer either way and scoping it to a
 * city through one shared rule, and the proof that nothing sends and no
 * address is read.
 *
 * 2026-09-13 (lane B, close-out GA1 v3): raised 392/4859 -> 393/4905, MEASURED.
 * tests/unit/growth/consent-ledger-and-the-one-resolver holds the ledger to
 * being evidence: the seven named resolver decisions, coverage that only runs
 * one way, a transactional message that is not the marketing this governs, the
 * append-only schema, the wording read from the record rather than typed into a
 * page, the send-path registry that makes "the resolver is the only door"
 * checkable, and the two privacy rights routes.
 *
 * 2026-09-13 (lane B, close-out GA2): raised 393/4905 -> 394/4934, MEASURED.
 * tests/unit/growth/matcher-scores-and-suppresses holds the matcher to the
 * arithmetic it claims: every component at its boundaries, the weights refused
 * by name when they do not sum to one, the score bounded on 500 fuzzed inputs,
 * the breakdown summing to the score, every suppression reason with its
 * sentence, suppression running BEFORE scoring so a removed person cannot be
 * scored, the cap and the contiguous ranks, the tie break that makes a run
 * reproducible, and the proof that nothing in src/lib/matching can reach a
 * transport.
 *
 * 2026-09-13 (lane B, close-out GA3): raised 394/4934 -> 395/4992, MEASURED.
 * tests/unit/growth/attribution-spine holds the billing basis to what it can
 * defend: every rung of the ladder in both directions and at its boundaries, a
 * click in the future of its own order, the forwarded link that credits the
 * campaign and not the recipient, one click backing one sale at the identity
 * rung, confidence below one on rung four and nowhere else, the two triggers
 * that make billable impossible for an application to type, the reversal rule
 * that is deliberately NOT the gross-sales rule, and a scan proving no channel
 * code, window length, route or fee is a literal in anything the item adds.
 * Three counted here are not new tests but existing ones this item had to
 * teach: the flag defaults gained a tenth switch, the indexing policy gained
 * /admin/attribution, and the types coverage gained the invariant view.
 *
 * 2026-09-14 (lane B, close-out GA4): raised 395/4992 -> 396/5037, MEASURED.
 * tests/unit/growth/campaigner holds the two rules that can end this business
 * to arithmetic and to constraints: every pacing boundary in both directions
 * including the inclusive ends and a floored day count, the SMS step refused on
 * a consent scoped to email and taken on one scoped to both, a render that
 * refuses by name without a verified sender identity or a working unsubscribe,
 * an SMS carrying an instruction rather than a link, the organiser own words
 * placed verbatim and escaped in the html, the segment fingerprint that changes
 * when the list, the size or the channel does, and a scan proving no template
 * key, day count, cap or route is a literal in anything the item adds. The
 * database half is not here by design: GA4 requires it proven by removing every
 * application check and watching the constraint refuse anyway, which is driven.
 *
 * 2026-09-14 (lane B, close-out FT1): raised 398/5088 -> 399/5118, MEASURED.
 * tests/unit/growth/forecast holds the free public forecast tool to the owner's
 * own correction: on day zero the output is plain arithmetic and it says so.
 * Break even at three prices and two capacities with the fee passed in rather
 * than read, the absorb arm taking the fee out of what a ticket leaves you, the
 * figures moving when the rate moves, the founding figure being the same
 * arithmetic with the waiver applied, days-to-event turning a number into a
 * rate and never into a prediction, and the one that matters most: the page
 * cannot print the measured sentence while there is nothing to measure. Plus
 * the shape cookie's bounded round trip and the copy laws over every sentence
 * the page can print. The driven half is not here by design: a row written by a
 * real submit, the call to action measured BELOW the result by geometry at
 * three widths, and the database refusing an address with no consent wording.
 *
 * 2026-09-14 (lane B, close-out PL1): raised 397/5068 -> 398/5088, MEASURED.
 * tests/unit/growth/product-loops holds the two loops to their arithmetic:
 * every loop link carries BOTH parameter systems and neither is typed at a
 * call site, a shared link keeps its source through a tracked short link and
 * never gains it twice, an organiser's referral code round trips back to the
 * profile that owns it, the weekly line names the referred count and says
 * nothing rather than zero, and the confirmation prompt sits BELOW the ticket
 * in the source order. The rendered half is not here by design: PL1 requires
 * the ticket email judged on what it CONTAINS rather than what its source
 * says, so the registered guard renders it in a child process and the drill
 * removes the line from that render.
 *
 * 2026-09-14 (lane B, close-out GA5): raised 396/5037 -> 397/5065, MEASURED.
 * tests/unit/growth/proof-page holds the eight aggregation rules GA5 names by
 * name, plus the two the page rests on and the item does not name: that a
 * figure which cannot be sourced renders as words rather than as a zero, and
 * that the snapshot payload carries a source for every figure in it. Also here
 * is the scan that fails on any numeric literal, currency string or percentage
 * anywhere in the rendering path, with its exceptions listed in the test rather
 * than inferred. The database half is not here by design: the check constraint
 * that refuses a stored snapshot holding an unsourced figure is proven by
 * removing it and watching the guard name it, which is drilled.
 *
 * 2026-09-14 (lane B, close-out AN1): raised 397/5065 -> 397/5068, MEASURED.
 * Three tests, no new file. They hold the contract behind a defect measured and
 * fixed in the same session: the consent banner stood 286 pixels tall at 390
 * over an /admin/login page that does not scroll, and Sign in could not be
 * reached at all. The banner now measures its own height into a variable, the
 * document reserves exactly that much, and the mobile bottom bar lifts clear
 * through its TRANSFORM rather than through `bottom`, because `bottom` would
 * cost a layout shift on the pages the mobile budget is measured on. The
 * behaviour is driven at three widths; these three hold the contract, so an
 * edit that deletes one half of it cannot pass.
 * 2026-09-14 (SEO1 v2, the event structured data): raised 391/4746 -> 393/4782,
 * MEASURED on a green suite, 0 failed and 0 skipped. An earlier reading said
 * 4778 and it was taken while the suite was RED, so it is not the one recorded:
 * the floor is measured on a green suite or it is not measured. Two new files
 * and 36 tests. `tests/component/seo/json-ld-blocks.test.tsx`
 * renders every JSON-LD block the platform emits, which is the half a unit test
 * on a builder cannot reach: the two profile pages nested twelve `Event` nodes
 * each inside their own payload, and a correct builder would not have stopped a
 * component doing that. `tests/unit/seo/social-profiles.test.ts` holds the set
 * behind `sameAs`, which shipped as an empty array on every page of the platform
 * for months. The rest are additions to the existing SEO payload test, renamed
 * to SEO1 v2's acceptance names, including the two the corrections added:
 * `no_event_attendance_mode_is_emitted_anywhere`, which asserts on the emitted
 * BYTES rather than the object because a key holding `undefined` is present on
 * one and absent from the other, and `no_event_markup_on_any_listing_page`.
 *
 * 2026-09-14 (SEO3 step 2, the owner's indexing threshold): raised 393/4782 ->
 * 394/4794, MEASURED on a green suite. One new file, twelve tests. The
 * discovery indexing threshold stopped being a compiled constant and became a
 * row the owner can change without a deploy, and the resolver has to be right
 * in THREE states rather than one: before his migration exists, after it exists,
 * and when the database cannot be reached mid-request. The third is the one
 * worth twelve tests, because a failed read that returned ZERO would make every
 * templated discovery page indexable at once, which is the exact shape Google
 * collapsed in close-out C19. It degrades to the constant instead, and the test
 * that proves it asserts the value is greater than zero as well as equal to the
 * constant.
 *
 * 2026-09-14 (SEO3 steps 4, 6 and 7, the category pages): raised 394/4794 ->
 * 396/4809, MEASURED on a green suite. Two new files, fifteen tests.
 * `tests/unit/seo/discovery-indexability.test.ts` carries the nine tests the
 * close-out names, two of which GENERATE the real `src/app/sitemap.ts` against a
 * fixture catalogue rather than reading its source, because a test that grepped
 * for `isDiscoveryIndexable` would have been green on the day the category block
 * was missing from that file entirely: the gate it was looking for was present
 * in six other blocks.
 * `tests/unit/events/scheduled-publish-invalidates-discovery.test.ts` carries
 * five, and it exists because of a defect no existing test could see. The
 * scheduled-publish CRON published an organiser's event and invalidated three
 * paths, clearing none of the six event data cache tags and touching none of the
 * discovery surfaces, while `tests/unit/events/publish-scheduled.test.ts` stayed
 * green throughout - correctly, because the defect was never in the function it
 * tests. It was in what the ROUTE did with the answer. Proven red against the
 * exact pre-fix shape (3 of the 5 fail) before being called done.
 *
 * 2026-09-14 (SEO4, all-in pricing): raised 396/4809 -> 398/4823, MEASURED on a
 * green suite. Two new files, fourteen tests.
 * `tests/unit/pricing/all-in-pricing.test.ts` carries the six the close-out
 * names plus the ones that tie the DISPLAY to the CHARGE, and those drive the
 * real `PaymentCalculator` rather than re-implementing it, because every other
 * test in the file could be green while the display quietly used a second,
 * slightly different formula. Writing it that way immediately found a real
 * property nobody had written down: the fee line is rounded ONCE, so the
 * per-ticket all-in price times the quantity is NOT the cart total (2035 and
 * 4069, not 4070), and the error can go either way.
 * `tests/component/fee-sentence-spacing.test.tsx` RENDERS three surfaces and
 * reads their text as a screen reader would. The two defects the close-out
 * reports are invisible on screen, because the spacing is a CSS margin between
 * two inline elements with no whitespace character between them, and the test
 * found a THIRD instance on /organisers that the item does not name.
 *
 * 2026-09-14 (the rebase onto verify/l5-launch-readiness): 403/4889, MEASURED on
 * the merged tree, 0 failed and 0 skipped. This entry records a NUMBER rather
 * than a piece of work, and the reason is worth keeping.
 *
 * This constant conflicts on every merge between lane A and lane C, because both
 * lanes raise one number in one file from a common ancestor, and neither lane's
 * figure describes a tree holding both sets of tests: lane A measured 396/4812
 * without lane C's SEO1 v2 tests, and lane C measured 398/4823 without lane A's.
 * Taking either would have set a floor that was wrong in a direction nobody
 * could see, and taking the larger would still have been a guess.
 *
 * So neither was taken. The four lane C commits were rebased, the conflicts were
 * resolved by keeping BOTH history blocks and deferring the number, and then the
 * suite was run on the tree that actually exists. 403 and 4889 is what it holds.
 *
 * 2026-09-14 (close-out SEO5, lane C): 408/4968, MEASURED, 0 failed, 0 skipped.
 * Five new files: the calendar composition, the accessibility derivation, the
 * og:type decision, the after-the-fact lifecycle door, and the three event
 * states rendered as components. The largest of them is there because a
 * completed event's page answered a real 404 for months against a document that
 * says it is a full page with a banner, and nothing in the suite could say so.
 * Raised again to 4970 in the same session: the reversal condition gained two
 * tests once it stopped being a sentence and became a flag.
 *
 * 2026-09-14 (close-out PARITY1, lane C): 410/5012, MEASURED. Two files: the
 * table-stakes specification, with one break per line proving each check goes
 * red, and the guard that refuses a line with no check. The first real run
 * against production found five failures and three lines it could not observe,
 * which is the point of it.
 *
 * 2026-09-14 (close-out SEO2, lane C): 413/5066, MEASURED on the tree that
 * exists rather than derived by adding this session's new tests to the previous
 * floor, which is the rule set two entries above after two lanes each raised
 * this number from a different tree. Three files: the Search Console token
 * reader, the weekly indexing check, and the guard that compares the sitemap
 * against the catalogue it describes. The visibility proof for the sitemap also
 * gained two tests: the event predicate moved into
 * src/lib/seo/sitemap-catalogue.ts so a build-time guard could execute it, and
 * the proof now asserts both that the catalogue applies the rule and that
 * sitemap.ts asks nobody else, which the single-regex version did not.
 *
 * 2026-09-14 (close-out SEO2, second commit, lane C): 414/5074, MEASURED, and
 * 5074 rather than the 5075 the last run reported. Three consecutive runs of the
 * whole suite on the same tree returned 414/5074 with one failure, then
 * 414/5075 with none, then 414/5075 with none. One test is therefore
 * intermittent somewhere in the suite: on the run that failed, one FEWER test
 * also ran.
 *
 * THE FLOOR IS THE LOWEST OBSERVED COUNT, NOT THE HIGHEST, and that is what a
 * floor means. Pinning 5075 would make this guard refuse a push on the run where
 * the intermittent test does not appear, which is a gate going red for a reason
 * nobody can act on, and the thing that happens next is somebody lowers it in a
 * hurry. 5074 still catches a test that disappears, which is the whole job.
 *
 * The intermittent test is NOT named here because this session did not catch it
 * in the act: the failing run's output was not kept, and naming a suspect from
 * a count would be a guess. It is recorded so the next run that sees a red suite
 * knows to look at the file rather than at its own change.
 *
 * One file and eight tests were added: the parity review's origin fix
 * (tests/unit/ops/parity-check-origin.test.ts, five), and four more in
 * tests/unit/parity/parity-spec.test.ts for the two ways that review reported a
 * correct platform as broken.
 *
 * 2026-09-14 (the merge of lane C into the push lane, the THIRD one): both
 * lineages above are kept verbatim again, and they still do not form one
 * chain. From d137ed2f lane A counted 390/4747 -> 391/4760 -> 393/4770 ->
 * 396/4812 while lane C counted 391/4746 -> 393/4782 -> 394/4794. Neither end
 * point describes a tree holding both sets of files, and the larger of two
 * partial counts is still a guess. The value below is MEASURED on the merged
 * tree.
 *
 * 2026-09-14 (R1, the refund success door, and the empty claim the push gate
 * caught): raised 399/4860 -> 400/4897, MEASURED on a green suite. R1 added one
 * file and 43 tests across two: which Stripe events mean a refund SUCCEEDED
 * (the route reached its successful-refund handler from one event, and Stripe's
 * own page names a different one as the minimum), and the route-handler form of
 * the event revalidation, which exists because updateTag throws outside a Server
 * Action and a webhook calling it would have traded a stale page for a Stripe
 * retry loop. The other four are the empty claim: a nameless ticket tier put
 * `Offer.name: ""` into a nested node the serialiser had already declared clean,
 * and the four are written against the emitted BYTES because the object is not
 * what Google reads.
 *
 * MEASURED: 400 files, 4893 tests on e9dfc26b, plus the four above.
 *
 * 2026-09-14 (the flake that refused a push, and this guard's own message):
 * raised 400/4897 -> 400/4900, MEASURED on a green suite of the whole tree. No
 * new file: three tests added to tests/unit/guards/one-priority-image.test.ts.
 * They pin that a multi-line JSX comment is commentary on every one of its
 * lines, which cost a cycle when a comment explaining why a tile is NOT
 * priority quoted the code it replaced and the guard failed the tree on the
 * quotation. The two hero-raster tests changed in the same commit were made
 * deterministic rather than added to, so they move no count.
 *
 * 2026-09-14 (lane B, merging verify/l5-launch-readiness a SECOND time, the
 * merge lane A returned): the same rule as the entry above applies again and
 * for the same reason. Both comment histories are kept verbatim because each
 * names what it counted; neither pair of numbers describes this tree. Lane B
 * measured 407/5233 on the tree it merged, lane A measured 400/4900 on a tree
 * lane B had never seen, and a tree holding both sets of files is a third
 * thing. The pair below is MEASURED on it: 411 files and 5321 tests, 0 failed and 0 skipped,
 * on a clean run of the whole suite of the merged tree.
 *
 * 2026-09-14 (lane B, the FO1 drive collision): raised 411/5321 -> 412/5327,
 * MEASURED on a green suite of the whole tree. One new file, six tests.
 * tests/unit/verify/fo1-drive-target-selection holds the rule that stops one
 * FO1 drive deleting the other's fixture: the offer drive grants and revokes a
 * founding window, so its subject must START without one, and on a machine
 * where three lanes share TEST it must be a lane-B row rather than whichever
 * organisation happens to be first. It was neither, and the teardown then
 * revoked a window it had not granted while reporting "left as found". Both
 * directions are held, because the failing one is the one that was wrong and a
 * test of the happy path alone would have passed before the fix.
 *
 * 2026-09-15 (lane B, the fixture publication law): raised 412/5327 -> 414/5355,
 * MEASURED on a green suite of the whole tree. Two new files, twenty eight tests.
 * tests/unit/guards/fixtures-are-not-published holds the rule that a drive fixture
 * is never given the two values src/app/sitemap.ts selects on, after lane B's PL1
 * fixture published an organiser page and a venue page and then deleted them,
 * refusing lane A's push with two RULE 2 faults on URLs lane A had never heard of.
 * tests/unit/guards/proof-reads-never-discard-their-error holds the rule that a
 * failed read on the campaign proof page becomes a 500 rather than a printed zero,
 * after a ConnectTimeoutError to Supabase made that page answer 404 for a campaign
 * that exists. Both hold their guard in BOTH directions, because in both cases the
 * passing half was already true and it was the failing half nobody had seen.
 *
 * 2026-09-15 (lane B, the third lock on the same law): raised 414/5355 ->
 * 415/5361, MEASURED. tests/unit/guards/no-published-lane-b-fixture-on-test
 * drives the decision of the guard that asks the DATABASE what is published
 * right now, over synthetic rows, because proving the interesting half against
 * the real database means creating the very published fixture the guard exists
 * to prevent.
 *
 * 2026-09-15 (lane B, the attribution backstop): raised 415/5361 -> 417/5393,
 * MEASURED on a clean run. Two new files, 32 tests.
 * tests/unit/growth/attribution-backstop holds the scheduled repair that makes
 * GA3's invariant a product guarantee rather than a build-time observation: the
 * grace it must not race, the cap it must report hitting, and the two reads
 * that must THROW rather than answer "nothing to heal" when the database is
 * unreachable. tests/unit/guards/every-order-carries-its-attribution drives the
 * counting the new guard does, in both directions, because a guard that counted
 * every `from('orders')` as an insert would also pass on a correct tree, and
 * passing for the wrong reason is the failure that survives longest.
 *
 * 2026-09-14 (MONEY FIX A1.7): raised 400/4900 -> 401/4910, MEASURED on a green
 * suite of the whole tree. One new file, tests/unit/payments/money-chain.test.ts,
 * ten tests, which hold the money chain: a ticket charge names a destination, an
 * organiser who cannot be paid is refused with a named reason, and the fee
 * amount never decides whether the money may move. The first of them failed
 * before the fix and is the defect's own reproduction.
 *
 * 2026-09-14 (the merge of verify/l5-launch-readiness into lane/c-ux, the
 * FOURTH time this constant has collided): both lineages above are kept
 * verbatim, again, and again they do not form one chain. Lane C counted
 * 414/5074 on a tree without lane A's R1, money-chain and priority-image
 * tests; lane A counted 401/4910 on a tree without lane C's SEO3, SEO4, SEO5,
 * PARITY1 and SEO2 tests. Neither number describes the tree that now exists,
 * and the larger of two partial counts is still a guess.
 *
 * THE VALUE BELOW IS MEASURED ON THE MERGED TREE, 0 failed and 0 skipped,
 * which is the only thing either lane can honestly write here. 416 files and
 * 5125 tests, and it was run THREE times rather than once, because the entry
 * above this one records a count that moved by one test between runs, and a
 * floor set from a single observation of an unstable number is a gate that
 * goes red on somebody else's push. All three runs agreed.
 *
 * 2026-09-14 (the SEO2 harness, after it accused the product twice): raised
 * 416/5125 -> 418/5139, MEASURED twice on a green suite. Two new files,
 * fourteen tests, and both exist because a DRIVE was wrong rather than the
 * platform. tests/unit/verify/port-is-ours.test.ts holds the refusal that stops
 * a drive measuring a server it did not start, and it binds real sockets on
 * kernel-chosen ports rather than mocking node:net, because the whole point of
 * the helper is that it asks the operating system the same question the spawned
 * server is about to ask.
 * tests/unit/verify/verification-tag-placement.test.ts holds the ruling that
 * REPLACED two discarded photograph comparisons, and six of its eight cases are
 * red ones. It is the drill for a check whose first version could not fail at
 * all.
 */
/*
 * 2026-09-15 (close-out C8B.5, Scope v5 10.3, the weak-network contract): raised
 * 418/5139 -> 420/5159, MEASURED THREE TIMES on a green suite and identical on
 * every one, because the entry above records a count that moved by one between
 * runs and a floor pinned above the low measurement refuses a push for a reason
 * nobody can act on.
 *
 * Two new files, twenty tests, and both exist because a DRIVE found a live
 * defect rather than because a rule needed restating.
 * tests/unit/checkout/network-failure.test.ts holds what a buyer is told when a
 * checkout submit never reached the server. Before this item that submit had no
 * catch, so a dropped connection threw the buyer to the checkout error boundary
 * and took their name, their email and every attendee's details with it, under a
 * heading reading "Our team has been notified" while no report could leave the
 * browser either.
 * tests/unit/pwa/app-service-worker.test.ts drives the new root service worker
 * inside a fake worker global, and its most important cases are the REFUSALS:
 * that a successful navigation is never cached, because an event page carries a
 * price and a remaining-tickets count, and serving yesterday's total would
 * quietly break the ACCC all-in display in a way nothing else here could detect.
 *
 * 2026-09-15: raised 420/5159 -> 421/5178. Close-out C8 EXECUTION METHOD, C8B.3.
 * One file, nineteen tests: tests/unit/perf/first-load-budget, which holds the
 * three decisions behind the new initial-bundle budget that are easy to get
 * wrong later and expensive to notice.
 * The one worth naming is what PUBLIC means for a byte budget. The first design
 * reused src/lib/seo/indexing-policy.ts, on the reasoning that its `never` class
 * is the logged-in half of the platform. It is not: `never` contains /checkout,
 * /orders/[order_id]/confirmation, /queue/[slug], /t/[code], /tickets and
 * /scan/[eventId], every one of them a buyer on a phone, and a budget built on
 * that reading would have exempted the exact pages Scope v5 10.3 is about. The
 * test pins all nine of those routes as public so the reading cannot drift back.
 *
 * 2026-09-18: raised 421/5178 -> 422/5189. Close-out C8, the platform-wide
 * client shell. One file, eleven tests:
 * tests/component/layout/interaction-only-chrome, which runs the two surfaces
 * that moved out of the shell (the global search overlay and the city dialog)
 * now that a dynamic import stands between the header and both of them.
 * The two worth naming are the same-tick pair. The obvious test here is a
 * trap: "nothing is rendered before the interaction" passes against the OLD
 * code too, because both surfaces already returned null while closed, so a
 * test written that way would read as proof of the split and prove nothing.
 * The tick after the click is the one thing that tells a resolved static
 * import from a dynamic one, and both were drilled red by making each import
 * static again.
 *
 * 2026-09-18: raised 422/5189 -> 423/5202. Close-out C8, the edge cache that
 * was holding one visitor's name. One file, thirteen tests:
 * tests/unit/security/edge-cache-viewer-independence, which holds both halves
 * of the fix to /events (the signed-in exclusion on the cache rule, and the
 * anonymous header on the page) and the reader the guard shares with it.
 * The two worth naming are the reader tests, and they are there because the
 * fix's own explanatory comment contains the literal
 * `missing: [{ type: 'cookie', key: 'el-signed-in' }]` directly above the rule
 * it describes. A checker that read comments would find that text and pass a
 * rule carrying no such condition, which is the check reporting the
 * documentation instead of the code. One test plants exactly that shape.
 *
 * 2026-09-18: raised 423/5202 -> 423/5212. Close-out C8B.3, the 22 city browse
 * pages joining the shared set: they answered MISS on 8 of 8 warm production
 * samples, so every visitor and every crawler was paying for a fresh render.
 * No new file; ten tests added to
 * tests/unit/security/edge-cache-viewer-independence.
 * The two worth naming are the shelf-life pair. `s-maxage` and
 * `export const revalidate` answer the same question in two files read by two
 * different systems, which is the shape Law 9 records for .nvmrc against the
 * Vercel dashboard: they disagreed for months with nothing able to notice. The
 * only thing comparing them here was a COMMENT claiming the agreement in prose.
 * Both were drilled red by moving s-maxage away from the page's number, and the
 * guard clause beside them (clause 7) was drilled red a second way, by
 * commenting the page's `revalidate` out rather than deleting it, which also
 * proves the clause reads the comment-stripped source.
 *
 * 2026-09-18: raised 423/5212 -> 424/5225. Close-out C8B.3, the LCP preload that
 * must leave in the first chunk. One new file,
 * tests/unit/guards/lcp-preload-in-the-first-flush.test.ts, thirteen tests.
 * The guard it covers was written AFTER the opposite change was built and
 * measured: flushing the homepage shell before the query won 324 ms of time to
 * first byte and lost 507 ms of hero discovery, for 597 ms more LCP and six
 * points of score at matched machine speed, so it was reverted under C8B.3 and
 * the arrangement that won is now held by a gate.
 * The test worth naming is the nesting pair. An early version of the guard
 * asked whether the default export's body CONTAINED `<Suspense`, and
 * src/app/page.tsx already carries two of those for its below-fold rails, so the
 * clause was true no matter what happened to the boundary it existed to police.
 * It counts nesting DEPTH now, and two tests hold both halves: a hero ahead of
 * legitimate boundaries is depth 0, and a hero inside one is depth 1.
 *
 * 2026-09-18 (later): raised 424/5225 -> 425/5261. Close-out C8B.3, the `sizes`
 * hint that stopped describing its slot. One new file,
 * tests/unit/media/image-hints-match-the-cell.test.ts, thirty-six tests.
 * The test worth naming is the SENSITIVITY one. The grid assertions are
 * arithmetic, and arithmetic that cannot fail proves nothing, so the file
 * measures the hint this item REPLACED against the same ladder and asserts it
 * comes out wrong in both directions: under-fetching between 640 and 767 where
 * it claimed two columns and the grid was still one, and over-fetching past the
 * container cap where a vw term keeps growing and the column does not. The
 * replacement is then asserted correct at the same four viewports.
 * The parser the file checks with is a deliberately SEPARATE implementation
 * from anything in src/: if the product built the hint and the test read it back
 * with the same code, the pair would agree about a rule neither of them holds.
 * The counts below are MEASURED from the run that raised them, never predicted.
 *
 * 2026-09-16 (lane B, merging verify/l5-launch-readiness a THIRD time): both
 * comment histories above are kept verbatim, again, and again they do not form
 * one chain. Lane B counted 417/5393 on a tree without lane A's money-chain
 * tests and without lane C's SEO2, C8B.5 and first-load-budget tests; the other
 * lineage counted 421/5178 on a tree that has never held GA1 to GA5, PL1, FT1 or
 * the attribution backstop. Neither pair describes the tree that now exists, and
 * the larger of two partial counts is still a guess.
 *
 * THE PAIR BELOW IS MEASURED ON THE MERGED TREE, 0 failed and 0 skipped, which
 * is the only thing this lane can honestly write here.
 *
 * 2026-09-17 (lane B, the same merge finished): the pair above was left at
 * 0/0, and a floor of zero is not a measurement, it is this guard switched
 * off while its own comment says it was measured. Nothing can fall below
 * zero, so for a day the canary could not have noticed the entire suite
 * failing to collect, which is the single thing it exists for. It is
 * precisely the move the failure message below forbids, performed on the
 * guard by the guard's own author.
 *
 * The honest reason it happened: the merge was committed before the suite
 * could be run, so there was no measured number to write, and 0/0 went in as
 * a placeholder that nothing would refuse. The pair below is now the real
 * count of the merged tree, taken from a clean run of
 * `npm run gate:push -- --only suite`: 438 files, 5673 tests, 0 failed,
 * 0 skipped. Three of those tests were failing when the merge landed and are
 * fixed rather than counted around, and one is new.
 *
 * 2026-09-18 (lane B, close-out FO1): raised 438/5673 -> 439/5692. One file
 * and nineteen tests: tests/unit/guards/jsx-buttons, which pins the reader
 * behind scripts/guards/drive-quantity-control-selector.mjs. That guard
 * promises no other button in the tree answers to the selector every money
 * drive presses, and the promise is worth exactly what the reader is worth:
 * its first draft found the end of a JSX open tag with indexOf('>'), landed
 * inside the `=>` of an onClick handler, and so could not see the "Add to
 * calendar" button that had broken every money drive four days earlier.
 * Measured on a clean `npx vitest run`: 439 files, 5692 tests, 0 failed,
 * 0 skipped.
 *
 * 2026-09-18 (lane B, close-out FO1, later the same day): raised 439/5692 ->
 * 440/5698. One file and six tests: tests/component/waived-fee-sentence, which
 * pins what a buyer is TOLD when the platform fee is waived. A Founding
 * Organiser's rates are both zero, and every number on the ticket panel was
 * already right for them, so the driven purchase proof passed while the panel
 * said "It includes the EventLinqs fee of 0% plus Free per ticket, which covers
 * card processing". Two of those six tests fail against the code as it stood.
 * Measured through the gate's own suite step: 440 files, 5698 tests, 0 failed,
 * 0 skipped.
 *
 * 2026-09-18 (lane B, close-out API1, later again): raised 440/5698 ->
 * 442/5741. Two files and 43 tests. tests/unit/growth/organiser-api pins the
 * pure half of the organiser scoped read only API: the token shape, what the
 * hash is over, that a credential is only ever read from the Authorization
 * header, that a page request clamps rather than refuses, and that every
 * response carries the organisation id while the one refusal that cannot is the
 * one raised before a key is known. tests/unit/ci/types-drift-view-relationships
 * pins a LOOSENING of the drift analyser, which is why it is nine tests and six
 * of them are negatives: creating a view adds a relationship entry to every
 * table that points at what the view selects, so 49 correct differences were
 * reporting as genuine drift, and the fix must not become a way to launder a
 * real foreign key change. Measured through the gate's own suite step:
 * 442 files, 5741 tests, 0 failed, 0 skipped.
 *
 * 2026-09-18 (lane B, close-out LBG1): raised 442/5741 -> 443/5750. One file
 * and nine tests. tests/unit/guards/every-guard-has-been-seen-to-fail pins the
 * two readers behind the new registered guard that asks whether every guard in
 * run-guards.mjs has ever been watched to fail. Both readers were wrong on
 * their first run in the dangerous direction, reporting MORE drills than exist:
 * a substring search counted five guards as drilled that are only NAMED in the
 * harness's prose, and the parse that replaced it counted a `guard:` field
 * quoted inside a drill string, which is a shape that guard's own second drill
 * has to write. Measured through the gate's own suite step: 443 files, 5750
 * tests, 0 failed, 0 skipped.
 */
/*
 * 2026-09-18, THE THREE LANE MERGE: 439 files / 5697 tests, 0 failed and 0
 * skipped, measured on Node 24.19.0 on this merged tree by
 * `npm run gate:push -- --only suite` before the merge was committed, which is
 * the order this file argues for above and the order lane B could not follow.
 *
 * WHAT THE THREE SIDES SAID, recorded because a floor is the one number nobody
 * can check later. Lane A stood at 422/5202. Lane B measured 438/5673 on its
 * own branch, which carries lane A only as far as the merge it took in on
 * 17 September. The owner asked for 421/5185 in the instruction that ordered
 * this merge, which was the measurement of verify/l5-launch-readiness at
 * b3cc6317 at 12:43 that day, before the last four lane A commits and before
 * any of this. All three were true about the tree in front of them and none of
 * them is true about this one.
 *
 * A BASELINE IS A FLOOR AND IT ONLY EVER MOVES UP. Writing the lowest of those
 * three claims would have taken the floor 18 files and 512 tests below what the
 * suite actually runs here, which is the precise move the failure message below
 * refuses, so the measured count is what stands.
 */
/*
 * 2026-09-18, LB2: 441 files / 5703 tests, 0 failed and 0 skipped, measured by
 * `git push` running the whole gate (C:\dev\_a-lb2-push2.txt), where the suite
 * step passed and this guard said so itself: "the suite has GROWN (441/5703
 * against 439/5697), raise the baseline in this file so the new floor is held".
 *
 * Six tests in two files, both of them locks on the bundle work rather than new
 * product surface: tests/unit/payments/connect-currency-is-a-leaf.test.ts (the
 * leaf that keeps @upstash/redis out of the checkout imports nothing, and the
 * re-export is identity) and
 * tests/unit/analytics/consent-context-stays-in-the-deferred-tree.test.ts
 * (every useConsent consumer sits inside the tree that is now lazily fetched,
 * which is the assumption that makes deferring the provider safe).
 */
/*
 * 2026-09-18, LB3: 442 files / 5711 tests, 0 failed and 0 skipped, measured by
 * `npm run gate:push -- --only suite` (C:\dev\_a-lb3-suite.txt), where this
 * guard again said so itself: "the suite has GROWN (442/5711 against
 * 441/5703), raise the baseline in this file so the new floor is held".
 *
 * Eight tests in one file, and that file exists because the guard it backs
 * SHIPPED BLIND. tests/unit/perf/root-shell-has-no-loadable.test.ts holds the
 * matcher behind scripts/guards/no-loadable-in-the-root-shell.mjs shape by
 * shape, after the first version of that matcher put \s inside a TEMPLATE
 * LITERAL, where it is not a recognised escape: the backslash was dropped, the
 * pattern compiled to `from s*`, and the guard reported a confident PASS
 * against a file whose third line was the banned import. Only the red half of
 * the drill found it. These cases are what keep it found.
 */
/*
 * 2026-09-18, LB3 again: 443 files / 5717 tests, 0 failed and 0 skipped
 * (C:\dev\_a-lb3-suite5.txt).
 *
 * Six tests in one file, and that file is the reason this guard stopped blaming
 * the tree for the runner. tests/unit/perf/vitest-pool-start-failures.test.ts
 * holds the matcher that reads a vitest WORKER START FAILURE out of a run, the
 * shape that cost eleven files and 75 tests earlier the same day and was read at
 * the time as eleven files that had "stopped collecting". Its first case is the
 * text vitest actually printed, kept verbatim, because the first version of that
 * matcher was blind to it.
 */
/*
 * 2026-09-18, late (lane B, merging verify/l5-launch-readiness a SIXTH time,
 * the overlap lane A's watchdog aborted on at 21:31 the same day). BOTH COMMENT
 * HISTORIES ABOVE ARE KEPT VERBATIM and they are still two lineages rather than
 * one chain. Lane B's last pair, 443/5750, was measured on lane/b-growth, which
 * has never held lane A's LB2 or LB3 work. Lane A's last pair, 443/5717, was
 * measured on verify/l5-launch-readiness, which has never held GA1 to GA5, PL1,
 * FT1, API1 or LBG1. The two counts land on the same file count by coincidence
 * and neither describes this tree. Lane A also recorded above that lane B's
 * earlier 438/5673 pair described lane/b-growth alone and was superseded by the
 * three-lane measurement; that reading is correct and is why the larger of two
 * partial counts is still a guess.
 *
 * THE PAIR BELOW IS MEASURED ON THIS MERGED TREE through the gate's own suite
 * step, 0 failed and 0 skipped, which is the only thing this lane can honestly
 * write here. Evidence: C:\dev\EVIDENCE\LB-MERGE6\gate-suite.txt
 *
 * MEASURED: 448 files, 5794 tests, 0 failed, 0 skipped. The arithmetic is
 * checkable rather than asserted: lane B's 443 files plus the FIVE test files
 * lane A added in LB2 and LB3, which are
 * tests/unit/guards/no-drill-residue, tests/unit/payments/connect-currency-is-a-leaf,
 * tests/unit/analytics/consent-context-stays-in-the-deferred-tree,
 * tests/unit/perf/root-shell-has-no-loadable and
 * tests/unit/perf/vitest-pool-start-failures. 443 + 5 = 448, so the count is
 * explained by the merge and not by a file that quietly stopped collecting.
 */
/*
 * 2026-09-18, MONEY FIX B3 and B4: 446 files / 5746 tests, 0 failed and 0
 * skipped (C:\dev\_a-b3-suite.txt).
 *
 * Three new files: the recipient matrix, the organiser sales policy and the
 * daily digest. The floor moves UP to what the green run measured, which is the
 * only direction it ever moves.
 */
/*
 * 2026-09-19 (lane B, merging verify/l5-launch-readiness a SEVENTH time, this one
 * taking in lane A's 36fb1817 of 23:40, which arrived thirteen minutes after the
 * sixth merge resolved this same file). BOTH HISTORIES KEPT AGAIN.
 *
 * Lane B measured 448/5794 on the sixth merge. Lane A measured 446/5746 on its
 * own branch, and its three new files (the recipient matrix, the organiser sales
 * policy and the daily digest) are not in that 448. Neither pair describes this
 * tree and the larger of two partial counts is still a guess, which is what this
 * file has now said seven times.
 *
 * THE PAIR BELOW IS MEASURED ON THIS TREE through the gate's own suite step.
 * Evidence: C:\dev\EVIDENCE\LB-MERGE6\gate-suite-after-merge7.txt
 *
 * MEASURED: 451 files, 5823 tests, 0 failed, 0 skipped. Checkable rather than
 * asserted, the same way the last one was: 448 plus the THREE test files lane A
 * added in MONEY FIX B3 and B4, which are tests/unit/notifications/recipient-matrix,
 * tests/unit/notifications/organiser-sales-policy and
 * tests/unit/notifications/organiser-sales-digest. 448 + 3 = 451, so the count is
 * explained by the merge rather than by a file that stopped collecting.
 *
 * 2026-09-19, LANE C, the merge of verify/l5-launch-readiness plus the move off
 * next/dynamic in the platform chrome: 451 files / 5837 tests, 0 failed and 0
 * skipped, measured by `npm run gate:push -- --only suite` on the merged tree.
 *
 * The jump from 446 is mostly the merge: this floor was lane A's, measured on a
 * tree that held lane C only as far as 32d8515c, so five lane C files and their
 * tests were already running and simply were not in the number.
 *
 * ONE new file of this item's own, tests/component/ui/use-deferred-component,
 * eight tests, holding the hook that replaced `next/dynamic` behind the site
 * header. The test worth naming is the RACE one, and it is worth naming because
 * the test it replaced could not fail. The obvious way to prove the hook's
 * cancellation is to unmount mid-flight and assert React logged no "setState on
 * an unmounted component" warning; that test was written, and it passed with
 * the cancellation deleted, because React 19 removed that warning. The drill is
 * the only reason anybody knows. What cancellation actually buys is that a
 * superseded in-flight load cannot overwrite a newer one, so that is what is
 * asserted now, and deleting `cancelled` takes exactly that one test red.
 *
 * THE COUNTS ARE MEASURED FROM THE RUN THAT RAISED THEM, never predicted. That
 * run was the SECOND of two: the first reported one failure in
 * tests/component/layout/interaction-only-chrome (escape_closes_the_dialog)
 * which did not reproduce in the second full run nor when the file was run on
 * its own, on a machine shared with two other build lanes. It is recorded as a
 * flake in C:/dev/REVIEW-QUEUE-C.md rather than absorbed into this baseline,
 * which is what the failure message below asks for.
 *
 * 19 SEPTEMBER 2026, lane C, 451/5837 -> 452/5866. ONE new file,
 * tests/unit/media/candidate-ladder, 29 tests, holding the arithmetic behind
 * scripts/guards/candidate-ladder-has-no-dead-rung.mjs: which configured image
 * width a browser can select for a given slot, and the floor below which
 * next/image will not emit one at all.
 *
 * THE CASE WORTH NAMING is "does NOT read a media-query breakpoint as a slot".
 * The first derivation matched `(\d+)px` across the whole hint, so
 * `(max-width: 639px) 100vw, 320px` declared three slots instead of one, and the
 * two breakpoints then made ladder rungs look alive that nothing renders at.
 * The guard passed on the real tree while doing that, because it failed in the
 * permissive direction, which is the only direction a gate can fail quietly in.
 * The test found it; reading the code had not.
 *
 * 19 SEPTEMBER 2026, lane C, second raise of the day, 452/5866 -> 453/5883. ONE
 * new file, tests/unit/perf/document-weight, 17 tests, holding the analysis that
 * says what a served document is made of.
 *
 * THESE ARE TESTS FOR A REPORTER, which fails a different way from a guard: it
 * does not go red, it prints a number. The matcher for Next's flight payload was
 * written with a word boundary that a shell turned into a literal BACKSPACE
 * byte. The expression stayed VALID and matched no script tag on earth, and
 * "flight payload 0 B (0.0% of the document)" would have gone into a commit
 * message as a fact about this platform. Six of these seventeen go red on
 * exactly that byte, and the analysis now refuses the zero rather than printing
 * it.
 *
 * 2026-09-19 (lane B, the EIGHTH merge of verify/l5-launch-readiness, taking in
 * lane C's da659bb8 and the move of the header chrome off next/dynamic). BOTH
 * HISTORIES KEPT AGAIN, and the pair below is MEASURED ON THIS TREE rather than
 * taken from either side: lane B stood at 451/5823 and lane C at 451/5837, and
 * neither pair describes a tree that holds both.
 *
 * MEASURED: 456 files, 5914 tests, 0 failed, 0 skipped, through the gate's own
 * suite step. Evidence: C:\dev\EVIDENCE\LB-MERGE8\gate-suite-after-merge8.txt
 *
 * CHECKABLE RATHER THAN ASSERTED, and the arithmetic is worth writing out
 * because a grep of this repository CANNOT reproduce it. Five test files arrive
 * with this merge and no file of either side disappears:
 *   tests/component/layout/interaction-only-chrome.test.tsx
 *   tests/component/ui/use-deferred-component.test.tsx
 *   tests/unit/guards/lcp-preload-in-the-first-flush.test.ts
 *   tests/unit/media/image-hints-match-the-cell.test.ts
 *   tests/unit/security/edge-cache-viewer-independence.test.ts
 * 451 + 5 = 456, which is the file count.
 *
 * The test count does NOT fall out of counting `it(` in those five files, and
 * the difference is the part worth recording. They hold 66 grep-visible cases,
 * which would predict 5889 and be 25 short. Two of them are table driven, and
 * an `it.each` table is ONE line to a grep and one test PER ROW at runtime. Run
 * on their own, image-hints-match-the-cell and edge-cache-viewer-independence
 * report 59 tests against 34 grep-visible cases, so the five tables add 25.
 * 66 + 25 = 91, and 5823 + 91 = 5914. A predicted count would have been wrong
 * by 25 here, which is why this file asks for a measurement and not a sum.
 *
 * 2026-09-19 (lane C, resolving lane A's merge of lane/c-ux into the push lane).
 * BOTH HISTORIES KEPT, and the pair below is MEASURED ON THE MERGED TREE: lane B
 * stood at 456/5914 and lane C at 453/5883, and neither describes a tree holding
 * both.
 *
 * MEASURED: 458 files, 5960 tests, 0 failed, 0 skipped, through the gate's own
 * suite step.
 *
 * CHECKABLE, and it checks out exactly, which is worth saying because the entry
 * above this one records an arithmetic that did NOT: two test files arrive with
 * this merge, tests/unit/media/candidate-ladder (29) and tests/unit/perf/
 * document-weight (17), and no file of either side disappears.
 *   456 + 2 = 458 files
 *   5914 + 29 + 17 = 5960 tests
 * Neither of those two files is table driven, which is why a sum works here and
 * did not there. The measurement is still what set the number.
 *
 * 2026-09-19 (lane C, close-out C8B.3: the city catalogue out of every document).
 *
 * MEASURED: 459 files, 5985 tests, 0 failed, 0 skipped, `npx vitest run` on this
 * tree.
 *
 * CHECKABLE, and it checks out: one new file,
 * tests/component/layout/city-dialog-fetches-its-own-catalogue.test.tsx (14),
 * and eleven cases added to tests/unit/perf/document-weight.test.ts, which goes
 * 17 to 28.
 *   458 + 1 = 459 files
 *   5960 + 14 + 11 = 5985 tests
 * Neither file is table driven, so a sum is a fair check here. The measurement
 * is still what set the number.
 *
 * 2026-09-19, the same item, one commit later: the cache-control header on the
 * new endpoint was wrong and the fix is pinned by a test rather than a comment.
 *
 * MEASURED: 460 files, 5990 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: one new file, tests/unit/locations/picker-cities-endpoint.test.ts,
 * holding 5 cases.
 *   459 + 1 = 460 files
 *   5985 + 5 = 5990 tests
 *
 * 2026-09-19, close-out C8B.3, the home card class lists collapsed into three
 * composite utilities. The homepage document fell 1,007,270 -> 850,054 B and
 * its flight payload 368,851 -> 290,192 B, with first-load JavaScript unchanged
 * to the byte. The analysis behind it, classListWeight, is a new pure function
 * and is tested rather than trusted.
 *
 * MEASURED: 460 files, 5999 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: no new FILE (the cases were added to an existing one), and nine
 * new cases in tests/unit/perf/document-weight.test.ts, which took it from 28
 * to 37.
 *   460 + 0 = 460 files
 *   5990 + 9 = 5999 tests
 *
 * 2026-09-19, close-out C8B.3, the BROWSE card family (`EventCard`) collapsed:
 * fifteen composites, and six inline style objects per card that moved into
 * them. /events fell 397,482 -> 339,541 B, /city/melbourne by 146,544 B and
 * /categories/music by 73,272 B. Two new pure things are tested rather than
 * trusted: `transition-equivalence`, which is how a drive tells "0.2s, 0.2s"
 * from "0.2s" on two properties without pretending they behave differently,
 * and `styleAttributeWeight`, the reporter row that could not see an inline
 * style at all until now.
 *
 * THE FLOOR MOVES BY MORE THAN THIS LANE ADDED, and the difference is measured
 * rather than assumed: four test files arrived on this branch with lane A's
 * merges of lane B (consent/truncated-ledger-sends, guards/supabase-select-
 * chains, media/launch-kit-tile-hint, supabase/read-every-row) and were never
 * counted into this baseline. Run on their own they report 38 tests.
 *
 * MEASURED: 465 files, 6057 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: one new file, tests/unit/perf/transition-equivalence.test.ts,
 * holding 14 cases, plus 6 more in tests/unit/perf/document-weight.test.ts
 * (37 -> 43), plus lane B's four files and their 38.
 *   460 + 4 + 1 = 465 files
 *   5999 + 38 + 14 + 6 = 6057 tests
 *
 * 2026-09-19, close-out C8B.1. A mobile run printed an LCP of 3,740 ms above a
 * phase split that summed to 1,881 ms, and the reporter said nothing about the
 * two being different quantities: the score is computed from the SIMULATED
 * paint and the split describes the OBSERVED one. The reconciliation, and the
 * refusal to print a split that no longer sums to the paint it splits, moved
 * into scripts/perf/lib/lcp-breakdown.mjs where it is tested against reports
 * whose answers are known - including the real one that produced it.
 *
 * MEASURED: 466 files, 6068 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: one new file, tests/unit/perf/lcp-breakdown.test.ts, holding 11
 * cases.
 *   465 + 1 = 466 files
 *   6057 + 11 = 6068 tests
 *
 * 2026-09-19, close-out C8B.3. A guard drill deleted `cv-section` from the one
 * constant that applies it to every homepage rail, and the guard PASSED: the
 * COMMENT on the same line still said the word. Comments are not code, so the
 * contract reads source with its comments removed - by a tokeniser rather
 * than a regular expression, because `s.replace(/\/\/.*$/gm, '')` eats the
 * second half of every 'https://...' in the repository.
 *
 * MEASURED: 467 files, 6078 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: one new file, tests/unit/guards/strip-js-comments.test.ts,
 * holding 10 cases.
 *   466 + 1 = 467 files
 *   6068 + 10 = 6078 tests
 *
 * 2026-09-19, close-out C8B.1. The document-weight reporter grew rows one at a
 * time, and every one of them was added because a reader noticed a number that
 * did not add up - the class-attribute row exists only because somebody asked
 * what the other third of a 1,007,295-byte homepage was. `composition` asks it
 * instead: the document is partitioned into markup and flight EXACTLY, each
 * named category is measured in the markup half, and the remainder is reported
 * as UNEXPLAINED rather than waiting for the next curious reader.
 *
 * MEASURED: 467 files, 6085 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE: no new FILE (the cases went into an existing one), and 7 new
 * cases in tests/unit/perf/document-weight.test.ts, which took it from 43
 * to 50.
 *   467 + 0 = 467 files
 *   6078 + 7 = 6085 tests
 *
 * 2026-09-19, the merge of verify/l5-launch-readiness into lane/c-ux. The two
 * sides auto-merged this file for once, which means the floor it carried was
 * ONE SIDE'S rather than the merged tree's. It is measured here instead: lane
 * B's three new files (consent/ledger-dates-are-australian,
 * consent/one-click-unsubscribe, email/one-click-headers-reach-the-provider)
 * report 29 tests when run on their own.
 *
 * MEASURED on the merged tree: 470 files, 6114 tests, 0 failed, 0 skipped.
 *
 * CHECKABLE:
 *   467 + 3 = 470 files
 *   6085 + 29 = 6114 tests
 *
 * 2026-09-19, lane A, the three-lane merge. The floor had not moved since it was
 * written, while the watchdog merged twenty more lane B and lane C commits into
 * verify/l5-launch-readiness. The gate measured the merged tree at d6e8ce0e and
 * reported the growth itself: "[test-count-canary] the suite has GROWN
 * (469/6097 against 466/6068). raise the baseline in this file so the new floor
 * is held."
 *
 * A FLOOR THAT LAGS THE SUITE IS NOT A FLOOR. Three files and twenty-nine tests
 * could have stopped running and this guard would have said nothing, which is
 * the exact silence it exists to break.
 *
 * MEASURED: 469 files, 6097 tests, 0 failed, 0 skipped, in the pre-push gate
 * run of 2026-09-19 on d6e8ce0e (C:\dev\_a-r20-push.txt).
 *
 * CHECKABLE: the gate printed both pairs side by side on the line above.
 *   466 + 3 = 469 files
 *   6068 + 29 = 6097 tests
 *
 * 2026-09-19, lane A, the two files this run added while unblocking the push.
 * tests/unit/media/avatar-sizes-is-a-leaf.test.ts holds the four cases that keep
 * the dashboard shell out of the media hint table, and
 * tests/unit/seo/artist-catalogue-is-linked.test.ts holds the seven that keep an
 * unreachable artist out of the sitemap. One further case was added to the
 * existing tests/unit/ci/gate-url-determinism.test.ts, which is why the test
 * count moves by twelve and the file count by two.
 *
 * MEASURED: 471 files, 6109 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\_a-r20-suite2.txt).
 *
 * CHECKABLE:
 *   469 + 2 = 471 files
 *   6097 + 4 + 7 + 1 = 6109 tests
 *
 * 2026-09-19, lane A, close-out MONEY FIX B4. The four money messages an
 * organiser was never sent now have senders, and
 * tests/unit/notifications/organiser-money-notify.test.ts holds the fourteen
 * cases that judge the SENDS rather than the declaration. The item's own named
 * tests for these messages already existed and already passed while nothing
 * sent them, because they read the matrix.
 *
 * MEASURED: 472 files, 6123 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\_a-r20-suite3.txt).
 *
 * CHECKABLE:
 *   471 + 1 = 472 files
 *   6109 + 14 = 6123 tests
 *
 * 2026-09-19, lane C, resolving the two above. Both sides raised the
 * floor on the same day from different trees - 470/6114 here, 469/6097
 * there - and neither describes a tree holding both. The arithmetic is
 * kept because it is how each side is checked, and the pair below is
 * MEASURED on the merged tree rather than chosen from a side.
 *
 * MEASURED on the tree holding both: 471 files, 6119 tests, 0 failed,
 * 0 skipped. Lane A's one new file (media/avatar-sizes-is-a-leaf) and its 5
 * cases are the difference from this lane's 470/6114:
 *   470 + 1 = 471 files
 *   6114 + 5 = 6119 tests
 *
 * RAISED AGAIN, 19 September 2026, lane C, on the tree that holds the merge
 * plus `tests/unit/perf/event-grid-intrinsic.test.ts`:
 *   471 + 1 = 472 files
 *   6119 + 16 = 6135 tests
 * Measured by this guard's own run, not counted by hand.
 *
 * 2026-09-19, lane C, the merge of verify/l5-launch-readiness into lane/c-ux.
 * BOTH BLOCKS ABOVE ARE KEPT because each is how its own side is checked, and
 * neither describes a tree holding both. Each side held 472 test files and each
 * contributed two the other had never held: this lane
 * tests/unit/guards/strip-js-comments.test.ts and
 * tests/unit/perf/event-grid-intrinsic.test.ts, lane A
 * tests/unit/notifications/organiser-money-notify.test.ts and
 * tests/unit/seo/artist-catalogue-is-linked.test.ts. Writing either side's pair
 * onto the merged tree would lower the floor below what the merged tree actually
 * runs, which is the one thing this guard exists to notice.
 *
 * MEASURED on the tree holding both, by this guard's own run rather than counted
 * by hand: 474 files, 6156 tests, 0 failed, 0 skipped.
 *
 * THE FILE COUNT IS CHECKABLE AND THE TEST COUNT IS NOT, and that is said here
 * rather than papered over with arithmetic that happens to land:
 *   472 + 2 = 474 files.
 *   6123 + 26 = 6149 tests, which is SEVEN SHORT of the measured 6156. This
 *   lane's two files hold 26 cases, measured by running them alone. The seven
 *   are verify's own later work, committed AFTER lane A wrote 6123 at ee2aa8bc:
 *   14963fd3 and ec65a689 add cases to tests/unit/ci/gate-url-determinism.test.ts
 *   and tests/unit/seo/artist-catalogue-is-linked.test.ts. A floor derived from
 *   the two written pairs would therefore have been seven cases low, which is
 *   exactly why the number below is measured and not derived.
 *
 * 2026-09-19, lane C, the fourth sitemap family. Artists were a row-derived
 * sitemap family that no guard compared against the database, which is how the
 * platform advertised four artist pages nothing on the site linked to.
 * tests/unit/guards/artist-sitemap-gate.test.ts holds the fifteen cases behind
 * clause F of sitemap-resolves, and eight more cases went into the existing
 * tests/unit/guards/sitemap-covers-the-catalogue.test.ts, which is why the file
 * count moves by one and the test count by twenty-three.
 *
 * MEASURED: 475 files, 6179 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`).
 *
 * CHECKABLE:
 *   474 + 1 = 475 files
 *   6156 + 15 + 8 = 6179 tests
 *
 * 2026-09-19, lane C, the weekend read in the right zone. The homepage built its
 * own Saturday-to-Sunday window on a UTC day and /api/home/surprise read the
 * server's clock, so a quarter of next weekend was missing from the weekend rail
 * and a Monday morning pick was labelled "Weekend energy".
 * tests/unit/events/weekend-in-the-right-zone.test.ts holds the twelve cases,
 * seven for the window and five for localHourOfDay.
 *
 * MEASURED: 476 files, 6191 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`).
 *
 * CHECKABLE:
 *   475 + 1 = 476 files
 *   6179 + 12 = 6191 tests
 *
 * 2026-09-19, lane C, event dates in the event's zone. Eight components
 * formatted an event date with timeZone 'UTC', so every event starting before
 * 10:00 AEST showed the PREVIOUS DAY on its card.
 * tests/unit/events/event-dates-in-the-event-zone.test.ts holds the twelve
 * cases, five for the formatters and seven for the guard that keeps them.
 *
 * MEASURED: 477 files, 6203 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`).
 *
 * CHECKABLE:
 *   476 + 1 = 477 files
 *   6191 + 12 = 6203 tests
 *
 * 2026-09-19, lane C, the weekend surface (close-out AQ3). `/this-weekend` is a
 * real page instead of a fourth door into `/events?preset=weekend`.
 * tests/unit/events/weekend-surface.test.ts holds twelve cases: the day split by
 * the event's own zone including a Perth Saturday that is Sunday in Sydney, and
 * the preset that used to REPLACE the listing window instead of narrowing it.
 * tests/component/weekend-landing-page.test.tsx holds six, for the two states
 * the page renders and the count that may never return to a line of its own.
 * The nineteenth is one new case in tests/unit/seo/discovery-indexability.test.ts,
 * which now generates the real sitemap against a weekend fixture as well as a
 * catalogue one and proves the URL leaves when the weekend empties.
 *
 * MEASURED: 479 files, 6222 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`).
 *
 * CHECKABLE:
 *   477 + 2 = 479 files
 *   6203 + 12 + 6 + 1 = 6222 tests
 *
 * 2026-09-19, lane C, the gold tiers and the clipped card on the shared empty
 * state. tests/unit/a11y/hero-empty-gold-tiers.test.ts holds six: five that
 * compute the four gold-on-surface ratios out of globals.css, so retuning
 * either token fails there with the number rather than silently moving a live
 * surface under its floor, and one that EXECUTES the guard's refusal to pass
 * vacuously by pointing it at a tree with no surface flag in it (the drill
 * harness mutates one file per drill and could not empty the scope).
 * tests/component/ui/category-hero-empty.test.tsx holds nine, for the tier and
 * the hero variant each of the two surfaces is entitled to. Three of the nine
 * were watched to fail against the shipped component before the fix.
 *
 * MEASURED: 481 files, 6237 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`).
 *
 * CHECKABLE:
 *   479 + 2 = 481 files
 *   6222 + 6 + 9 = 6237 tests
 * 2026-09-19 (later), lane A, close-out MONEY FIX A3 layer three, and a debt
 * that was not mine. The raise carries SEVEN files rather than one, because six
 * of them arrived with the watchdog's lane/b-growth merge at a172aee9 and no
 * baseline raise had counted them: the floor had been sitting a hundred tests
 * below the suite since that merge landed.
 *
 * It is recorded here because the reason I nearly did not raise it is worth more
 * than the number. This file is a known three-lane conflict, so raising it
 * mid-flight buys a merge conflict for three lanes, and that is what I wrote into
 * REVIEW-QUEUE.md as the reason to leave it. C:\dev\BUILD-BRIEF.md, which I had
 * not read, settles it in one clause: "real tests added. The suite grows and the
 * canary baseline is raised IN THE SAME COMMIT." A conflict on one integer is
 * resolved by taking the higher number. A floor nobody raises stops catching a
 * deleted test, which is the whole job of this file.
 *
 * MEASURED: 479 files, 6223 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, and again inside three full gate runs
 * today: C:\dev\_a-r21-push1.txt, _a-r21-push2.txt, _a-r21-push3.txt).
 *
 * The seven files were ENUMERATED from git rather than counted by hand
 * (`git ls-tree` at ee2aa8bc against HEAD) and their tests counted by running
 * exactly those seven:
 *
 *   lane B, merged at a172aee9, never counted into a baseline:
 *     tests/unit/growth/a-failed-read-is-not-a-fact-about-a-person.test.ts   19
 *     tests/unit/growth/campaigner-skip-sentences.test.ts                    19
 *     tests/unit/growth/marketing-dates-take-the-right-zone.test.ts          14
 *     tests/unit/growth/matcher-offers-an-event-you-can-still-go-to.test.ts   8
 *     tests/unit/supabase/in-chunks.test.ts                                  12
 *     tests/unit/supabase/or-filter.test.ts                                  15
 *   lane A, this run:
 *     tests/unit/payments/platform-settlement-reconcile.test.ts              13
 *
 * CHECKABLE:
 *   472 + 6 + 1 = 479 files
 *   6123 + 87 + 13 = 6223 tests
 *
 * 2026-09-19, lane C, the SECOND merge of verify/l5-launch-readiness into
 * lane/c-ux. BOTH BLOCKS ABOVE ARE KEPT, for the reason the first merge
 * already recorded: each is how its own side is checked, and neither
 * describes a tree holding both. This lane measured 481/6237 on a tree that
 * did not yet hold lane A's settlement-reconcile file or the six lane B files
 * that arrived with the a172aee9 watchdog merge; lane A measured 479/6223 on a
 * tree that did not hold this lane's grid and empty-state work. Writing either
 * pair onto the merged tree would lower the floor below what the merged tree
 * actually runs, which is the one thing this guard exists to notice.
 *
 * MEASURED on the tree holding both, by the suite rather than counted by hand:
 * 488 files, 6337 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\_c-merge2-suite.txt).
 *
 * 2026-09-19, lane C, the admin search boxes that answered 500 on a comma.
 * tests/unit/admin/search-terms-are-escaped.test.ts holds the thirty-one cases:
 * five hostile terms against each of the four reads that were fixed, plus the
 * columns each is entitled to search, plus the empty search that must send no
 * filter at all, plus the topbar search that reads three tables at once and used
 * to say "Nothing matched" about a row that exists. Five of them were WATCHED TO
 * FAIL against the shipped code, one file at a time
 * (C:\dev\EVIDENCE\OR-FILTER	ests-watched-to-fail.txt).
 *
 * tests/unit/supabase/or-filter.test.ts gained no cases: its private copy of the
 * clause splitter moved to tests/helpers/postgrest-or.ts so both files judge the
 * grammar with one parser, which is the same lesson the guard beside it teaches.
 *
 * MEASURED: 489 files, 6368 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\OR-FILTER\gate-suite.txt).
 *
 * CHECKABLE:
 *   488 + 1 = 489 files
 *   6337 + 31 = 6368 tests
 *
 * 2026-09-19, lane C, the screen-reader label that escaped the box that scrolls
 * it. tests/unit/a11y/sr-only-cannot-escape-a-scroller.test.ts holds nine cases
 * and EXECUTES the guard against synthetic trees, red and green, including the
 * exact shape that defeated the guard's first version: the label rendered by a
 * sibling component in the same file rather than lexically inside the container.
 * tests/unit/dashboard/main-column-shrinks.test.ts gains one, for the containing
 * block the attendee wrapper now is; its other two cases were RELAXED rather
 * than added to, because they pinned the ORDER of utility classes and went red
 * against a correct change.
 *
 * MEASURED: 490 files, 6378 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\VIEWPORT-WIDTH\gate-suite.txt).
 *
 * CHECKABLE:
 *   489 + 1 = 490 files
 *   6368 + 9 + 1 = 6378 tests
 *
 * 2026-09-19, lane C, the hero that was a placeholder. The link-integrity
 * crawler found /categories/technology answering 500 with "[HeroMedia] image
 * must be a raster URL (got SVG)". tests/component/category-hero-is-a-photograph.test.tsx
 * holds the seven cases: the sentinel is an SVG and is recognised by the
 * exported test rather than a copied literal, the hero renders a raster for
 * eight slugs with no photograph of their own, it uses the page's photograph
 * when there is one, and the last resort is category-neutral rather than the
 * Afrobeats community raster. That last case was WATCHED TO FAIL against the
 * shipped constant (C:\dev\EVIDENCE\HERO-SVG	ests-watched-to-fail.txt); it
 * could never have failed before, because the value was unreachable.
 *
 * MEASURED: 491 files, 6385 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\HERO-SVG\gate-suite.txt).
 *
 * CHECKABLE:
 *   490 + 1 = 491 files
 *   6378 + 7 = 6385 tests
 *
 * 2026-09-19 (hero text over a photograph): raised 491/6385 -> 492/6404.
 * tests/unit/a11y/hero-text-over-a-photograph.test.ts holds nineteen cases over
 * the one hero wash: that its strength still clears what gold-400 needs against
 * a WHITE photograph (recomputed from the token, not pinned), that the white
 * headline and the 85 per cent subtitle clear their own floors on it, that both
 * ends of the ramp are absolute lengths rather than percentages, and that none
 * of the four hero templates writes a navy gradient of its own any more. The
 * first case was WATCHED TO FAIL by weakening the wash to 0.7
 * (C:\dev\EVIDENCE\HERO-CONTRAST\tests-watched-to-fail.txt): 3.63:1 against the
 * 4.5 floor. Nineteen cases arrive as +19 because three of them are `it.each`
 * over the four templates.
 *
 * Then 6404 -> 6407 in the same item, when /events/[slug] turned out to be a
 * FIFTH hero with the same defect and joined the three `it.each` blocks: three
 * more cases, one per block, for one more file. Its ramp was the strongest of
 * the five and reached opaque navy at the foot of the band, so every run on it
 * passed at 1440 while the meta line read 3.85:1 at 390 against the 4.5:1 floor
 * of WCAG 2.2 SC 1.4.3
 * (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). That is
 * the whole lesson of the item in one page: a stronger percentage is still a
 * percentage.
 *
 * MEASURED: 492 files, 6407 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\HERO-CONTRAST\gate-suite.txt).
 *
 * CHECKABLE:
 *   491 + 1 = 492 files
 *   6385 + 19 + 3 = 6407 tests
 *
 * 2026-09-20 (the hero list that was never derived): raised 492/6407 -> 492/6439.
 * No new FILE: the 32 cases were added to the a11y file that already existed,
 * because the set of heroes stopped being typed by hand and became a derivation
 * (scripts/guards/lib/hero-files.mjs), so the suite now asserts the derivation,
 * the ratchet of heroes not yet converted, the one entry whose reason is checked
 * rather than asserted, and the placement of the child stagger, which is the one
 * thing in this item that no driven proof could ever have caught.
 *
 * THE FLOOR IS THE COUNT A GREEN RUN MEASURED, AND ONE RUN WAS NOT USED.
 * Four full suite runs were taken across this item. One of them registered a
 * count one lower AND carried a failure: a timing flake in
 * tests/component/layout/interaction-only-chrome.test.tsx, which passes 11 of
 * 11 twice on its own with green full runs either side (recorded in
 * REVIEW-QUEUE-C.md, not fixed here). A run that failed is not a measurement of
 * the floor, so it was discarded rather than averaged in. 6439 is what the
 * final green run measured on the finished tree.
 *
 * MEASURED: 492 files, 6439 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, C:\dev\EVIDENCE\HERO-CAROUSEL\gate-suite.txt).
 *
 * CHECKABLE:
 *   6407 + 32 = 6439 tests
 *
 * 2026-09-20 (the C8 measurement pass): raised 492/6439 -> 493/6470.
 * ONE new file, tests/unit/perf/measurement-cookie.test.ts, pinning the cookie
 * the local Lighthouse harness sends: the gate's own `el-audit=1` is never
 * dropped, and a `--cookie=` value is SLICED rather than split, because a cookie
 * value contains `=` and `split('=')[1]` truncates it to the name. That is not a
 * hypothetical either: the item this came from tried to price the consent banner
 * by passing an encoded consent decision, and a naive parse would have measured
 * a valueless cookie and produced a confident median of nothing.
 *
 * THE PREVIOUS BASELINE WAS 22 TESTS SHORT, AND THIS SAYS SO RATHER THAN
 * QUIETLY ABSORBING IT. The raise above recorded 6439. `npx vitest list` on this
 * tree enumerates 6470 cases, of which exactly 9 are in the new file, so 6461
 * were already present and uncounted when 6439 was written. The likeliest cause
 * is the one this file has recorded twice before: a count taken from a run part
 * way through an item rather than from the finished tree. It is called out here
 * because a floor that drifts below the suite is the exact failure this guard
 * exists to prevent, and it has now happened three times.
 *
 * MEASURED: 493 files, 6470 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`,
 *  C:\dev\EVIDENCE\C8-SCORE-20260920\gate-suite.txt), and independently
 * enumerated without running them (`npx vitest list`, 6470 lines).
 *
 * CHECKABLE:
 *   492 + 1 = 493 files
 *   6461 (measured, present before this item) + 9 = 6470 tests
 *
 * 2026-09-20 (the tile caption item): raised 493/6470 -> 494/6484.
 * ONE new file, tests/unit/a11y/tile-label-over-a-photograph.test.ts, holding
 * the three things that make the shared tile wash a guarantee rather than a
 * hope: that its strength still clears 4.5:1 for the FAINTEST foreground any
 * caption actually paints (resolved from the call sites, not assumed), that its
 * geometry is declared in absolute lengths so it cannot depend on how tall a
 * label happens to be, and that the painter derivation still finds tiles at all.
 * The last of those is the one that matters most: it is what stops a green
 * result that is merely a smaller result.
 *
 * 2026-09-20 (the hero preload item): raised 494/6484 -> 496/6493.
 * TWO new files, both proving a thing a static guard cannot see.
 *   tests/component/hero-preload-matches-the-raster.test.tsx (5) renders
 *   HeroMedia and requires the preload to register the srcset and sizes the
 *   <img> it produced actually asks for. A preload whose arguments differ by one
 *   character does not save a request, it ADDS one, on the LCP path, on the
 *   slowest route on the platform, and that failure is invisible in a screenshot.
 *   tests/component/audit-mode-reads-the-written-element.test.tsx (4) asserts the
 *   measurement predicate's ANSWER with the flag on each element in turn. The
 *   negative case is the point: six components had been reading it off body,
 *   which never carries it, so a test that only set documentElement would have
 *   passed against the broken form too.
 *
 * Both of those numbers were measured in lane C's worktree, which holds only
 * lane C's work, and BOTH ARE THEREFORE WRONG FOR THE TREE THE GATE JUDGES.
 * That is not a mistake either lane made; it is structural, and it is the same
 * thing lane A wrote down about perf-budget.json on this date: no lane worktree
 * contains the other two lanes' commits, so a count taken in one describes a
 * tree that will never be pushed. The note below replaces both.
 *
 * 2026-09-20 (lane C, the ninth merge of this file, measured on the tree that
 * holds all three lanes): raised 496/6493 and lane A's 513/6833 -> 524/6975.
 *
 * LANE A'S 513/6833 WAS RIGHT ABOUT ITS TREE AND WRONG FOR THIS ONE, and the
 * reason is worth recording because it is why this conflict keeps coming back.
 * Lane A measured 513/6833 on a merged tree, correctly. Every merge of lane C
 * after 16:17 then aborted on this very file, so the two commits lane C landed
 * at 19:06 and 19:12 were never in the tree lane A measured. A floor is a claim
 * about a tree, and the tree kept moving underneath it while the conflict that
 * would have carried the movement was the thing blocking it.
 *
 * AND THE ARITHMETIC WAS WRONG TOO, WHICH IS THE PART WORTH KEEPING. Closing
 * 513/6833 against the three files lane C had added gave 516/6856, and that was
 * written into this file as the new floor before the suite ran. The suite then
 * measured 524 files and 6975 tests: eight files and a hundred and nineteen
 * cases MORE than the sum of the two sides. Neither side was lying and the
 * subtraction was not slipshod; a merge of two branches is simply not the sum of
 * what each branch counted, and this file has now been raised three times from a
 * number somebody derived instead of ran. THE RULE IS THE ONE THE FILE ALREADY
 * STATES, and it is not satisfied by careful arithmetic: run the suite on the
 * tree the floor is about, and take the number it prints.
 *
 * COUNTED BY EXECUTION, then confirmed a second way by enumeration without
 * execution: `npx vitest list --run` prints 6986 lines, of which 6975 are test
 * entries and the other ELEVEN are Vite warnings on stderr (one config warning
 * repeated three times, one ssr warning over two lines). The entry count and the
 * executed count agree exactly at 6975, and the three files this lane added are
 * present in it: `grep -c tile-label-over-a-photograph` is 14,
 * `grep -c hero-preload-matches-the-raster` is 5 and
 * `grep -c audit-mode-reads-the-written-element` is 4.
 *
 * MEASURED on the merged tree: 524 files, 6975 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, 349s, GREEN).
 *
 * CHECKABLE, and it does NOT close by addition, on purpose:
 *   this floor is the measurement, not 513 + 3 = 516, which is what it would
 *   have been had it been derived. The gap is 8 files and 119 tests.
 *
 * ==========================================================================
 * RAISED 20 September 2026, lane C, close-out C8. 525 files, 6979 tests.
 * ==========================================================================
 *
 * MEASURED IN LANE C's WORKTREE, not on the merged tree, and that difference
 * matters when this conflicts: `npm run gate:push -- --only suite`, 152s,
 * GREEN, 525 files / 6979 tests / 0 failed / 0 skipped. The push lane measures
 * the merged tree and its number will be HIGHER than this one, because this
 * worktree does not contain lane B's work. This figure is the floor lane C can
 * honestly vouch for; take the merged measurement over it.
 *
 * WHAT MOVED, so the delta is checkable rather than asserted. One test was
 * LOST and five were added, net +4 with one new file:
 *
 *   -1  `tests/unit/a11y/busy-region-names-itself.test.ts` ran a case per
 *       skeleton over a list of four, and one of those four,
 *       `src/app/events/[slug]/loading.tsx`, was DELETED under close-out C8 (a
 *       loading boundary in front of a hero costs 450ms of LCP element render
 *       delay; see no-loading-boundary-in-front-of-a-hero.mjs). The case went
 *       with the file, which is correct: that test READS each path, so leaving
 *       it listed would have thrown rather than passed.
 *   +5  `tests/unit/guards/no-loading-boundary-in-front-of-a-hero.test.ts`,
 *       the unit test for the guard that replaced it.
 *
 * THE FIRST ATTEMPT AT THIS WENT 6974 AND THIS GUARD CAUGHT IT, which is the
 * argument for the guard: a green suite running one fewer test than it used to,
 * for a reason that was genuinely correct, is still a floor quietly dropping.
 *
 * ---------------------------------------------------------------------------
 * LANE B'S ACCOUNT OF THE SAME HOUR, KEPT RATHER THAN OVERWRITTEN. Both lanes
 * raised this integer from their own worktree within minutes of each other and
 * both were right about the tree they could see. Nothing is deleted here; the
 * measurement that governs is lane A's at the bottom, taken on the tree that is
 * actually pushed.
 * ---------------------------------------------------------------------------
 *
 * CHECKABLE:
 *   493 + 20 (the files lane B and lane C added) = 513 files
 *   6470 + 363 (the cases they added) = 6833 tests
 *
 * 2026-09-20 (lane B, LB-EDITREVENUE): raised 513/6833 -> 522/6975.
 *
 * I ALMOST DID NOT RAISE THIS, FOR THE REASON THE BLOCK ABOVE ALREADY REJECTED,
 * and that is worth more than the number. I had written into REVIEW-QUEUE-B.md
 * that this file is a known three-lane conflict, that lane C has conflicted on
 * it hourly today, and that no lane's worktree can measure the merged tree, so
 * the push lane should own the figure. Every one of those statements is true and
 * the conclusion was still wrong. Lane A reasoned its way to the identical
 * conclusion on 19 September, wrote it into REVIEW-QUEUE.md, and then found the
 * clause that settles it in C:\dev\BUILD-BRIEF.md: "real tests added. The suite
 * grows and the canary baseline is raised IN THE SAME COMMIT." A conflict on one
 * integer is resolved by taking the higher number. A floor nobody raises stops
 * catching a deleted test, which is the whole job of this file. I reached that
 * wrong conclusion by the same route lane A did: I had not read BUILD-BRIEF.md.
 *
 * THIS IS A LANE WORKTREE MEASUREMENT AND THE PUSH LANE WILL RAISE IT AGAIN.
 * lane/b-growth does not contain lane C's newest work, so 6,975 is below what
 * the merged tree runs. A floor that is too LOW is safe and still holds; a floor
 * that has drifted below the suite is the failure this guard exists to catch.
 *
 * MEASURED: 522 files, 6975 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, 182s, on commit 30bba00a).
 *
 * CHECKABLE. This item adds ONE file and TWENTY-THREE cases:
 *   tests/unit/growth/the-two-revenue-cards-agree.test.ts          20  (new file)
 *   tests/unit/guards/supabase-select-chains.test.ts                2  (the parser bridge)
 *   tests/unit/dashboard/order-money-figures.test.ts                1  (the summariser's rows)
 *   521 + 1 = 522 files
 *   6952 + 20 + 2 + 1 = 6975 tests
 *
 * 2026-09-20 (lane B, LB-PRICEWHOLE): raised 522/6975 -> 523/6992.
 *
 * ONE OF THE SEVENTEEN NEW CASES IS A REPLACEMENT RATHER THAN AN ADDITION, and
 * the count below says so. `tests/unit/pricing/save-dynamic-pricing-action.test.ts`
 * carried a test called "switching dynamic pricing off sends no steps" which
 * asserted `p_steps: []`. It was a faithful description of the code and a pin on
 * a data-loss defect: the database function deleted every rule before deciding
 * whether to insert any, so an empty list destroyed the organiser's ladder the
 * moment they paused it. That test now asserts the opposite and the file's case
 * count is unchanged, so this raise is +1 file and +17 cases, not +18.
 *
 * MEASURED: 523 files, 6992 tests, 0 failed, 0 skipped
 * (`npx vitest run --reporter=dot`, 235s, on the tree of this commit).
 *
 * THIS IS A LANE WORKTREE MEASUREMENT AND THE PUSH LANE WILL RAISE IT AGAIN,
 * for the reason the block above gives: lane/b-growth does not contain lane C's
 * newest work, so this floor is below what the merged tree runs. A floor that is
 * too LOW is safe and still holds.
 *
 * CHECKABLE. This item adds ONE file and SEVENTEEN cases:
 *   tests/unit/dashboard/the-price-ladder-survives-a-blink.test.ts  17  (new file)
 *   522 + 1 = 523 files
 *   6975 + 17 = 6992 tests
 *
 * 2026-09-20 (lane B, LB-INVITEWHOLE): raised 523/6992 -> 524/7014.
 *
 * ONE EXISTING TEST WAS REWRITTEN AND ADDS NO CASE, and the count below says so.
 * `tests/unit/growth/founding-organiser-terms.test.ts` carried "the conversion
 * path reads the switch before it grants anything", which compared the offset of
 * `isFeatureEnabled('founding_open'` with the offset of `rpc('claim_founding_spot'`
 * in the RAW file. The conversion is now one call to accept_founding_invite, so
 * the only remaining occurrence of that string is the doc comment quoting the
 * defective line, and the test was comparing code against prose. It now strips
 * comments and reads the new shape. Same file, same case count, 38 either way.
 *
 * MEASURED: 524 files, 7014 tests, 0 skipped
 * (`npx vitest run --reporter=dot`, 216s, on the tree of this commit).
 *
 * THIS IS A LANE WORKTREE MEASUREMENT AND THE PUSH LANE WILL RAISE IT AGAIN,
 * for the reason the block above gives: lane/b-growth does not contain lane C's
 * newest work, so this floor is below what the merged tree runs. A floor that is
 * too LOW is safe and still holds.
 *
 * CHECKABLE. This item adds ONE file and TWENTY-TWO cases:
 *   tests/unit/growth/a-founding-invite-is-spent-once.test.ts  22  (new file)
 *   523 + 1 = 524 files
 *   6992 + 22 = 7014 tests
 *
 * 2026-09-21 (lane B, LB-GIGWHOLE): raised 524/7014 -> 525/7029.
 *
 * ONE EXISTING TEST WAS LOOSENED AND ADDS NO CASE, and the count below says so.
 * `tests/unit/seo/read-failure-is-not-not-found.test.ts` asserted an EXACT
 * number of `readOrThrow(` calls per module, counted over the whole file. That
 * is an equality over a count that rises when a DIFFERENT read in the same
 * module is made safe, which is exactly what happened: LB-GIGWHOLE routed
 * `isPairBlocked` and `fetchRequestById` in src/lib/marketplace/gigs.ts through
 * the door, the file went from one call to three, and the test failed because
 * more reads were correct. It is a floor now. Same file, same case count, 22
 * either way.
 *
 * MEASURED: 525 files, 7029 tests, 0 skipped
 * (`npx vitest run --reporter=dot`, 208s, on the tree of this commit).
 *
 * THIS IS A LANE WORKTREE MEASUREMENT AND THE PUSH LANE WILL RAISE IT AGAIN,
 * for the reason the block above gives: lane/b-growth does not contain lane C's
 * newest work, so this floor is below what the merged tree runs. A floor that is
 * too LOW is safe and still holds.
 *
 * CHECKABLE. This item adds ONE file and FIFTEEN cases:
 *   tests/unit/growth/a-marketplace-block-holds.test.ts  15  (new file)
 *   524 + 1 = 525 files
 *   7014 + 15 = 7029 tests
 * ---------------------------------------------------------------------------
 * 2026-09-20 (lane A, the push lane): 524/6975 and 522/6975 -> 525/7003.
 *
 * NEITHER LANE'S NUMBER WAS WRONG AND NEITHER WAS RIGHT FOR THIS TREE, which is
 * the conclusion both blocks above reached independently and which this merge
 * settles. Lane C measured a tree without lane B's last four commits; lane B
 * measured one without lane C's last two. The conflict markers were on ONE
 * integer, and resolving it by taking the higher of the two would have written
 * 524, which is below what this tree actually runs.
 *
 * SO IT WAS RUN, ON THE TREE THAT IS BEING PUSHED, after both merges and after
 * lane A's own six cases in tests/unit/seo/indexing-rules.test.ts:
 *   525 files, 7003 tests, 0 failed, 0 skipped
 *   (`npm run gate:push -- --only suite`, GREEN, C:\dev\_a-r23-suite-merged2.txt)
 *
 * THE RUN BEFORE IT COUNTED 7002 AND FAILED, AND THE DIFFERENCE IS RECORDED
 * rather than rounded away. One test in tests/unit/guards/no-inherited-git-env
 * timed out at 30s while three lanes were each running a full suite on this
 * machine; a test that errors during collection is not registered, hence 7002.
 * Run alone three times it passes in 3.4, 3.7 and 4.5 seconds, and the guard it
 * spawns takes 2.1. The timeout was NOT touched: a floor is not lowered to
 * accommodate a busy machine, and the count written here is the one the GREEN
 * run measured.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-21 (lane A, MONEY FIX A3 layer two and A4): 525/7003 -> 530/7050.
 *
 * FIVE NEW FILES AND FORTY-SEVEN CASES, and the number below is the
 * MEASUREMENT rather than the sum, for the reason the blocks above record twice
 * over:
 *   tests/unit/payments/stripe-processing-estimate.test.ts
 *   tests/unit/payments/order-records-its-destination.test.ts
 *   tests/unit/events/connect-verification-freshness.test.ts
 *   tests/unit/events/publish-needs-a-fresh-enabled-account.test.ts
 *   tests/unit/ops/parity-sink-stand-in.test.ts
 * plus four cases added to create-platform-charge and one case restated in
 * connect-reconcile, whose premise MONEY FIX A3 layer two changed.
 *
 * MEASURED: 530 files, 7050 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, GREEN, C:\dev\_a-r23-suite-money.txt).
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * 2026-09-21 (lane B, resolving the merge of verify/l5-launch-readiness into
 * lane/b-growth): 530/7050 and 525/7029 -> MEASURED BELOW.
 *
 * BOTH HISTORY BLOCKS ABOVE ARE KEPT VERBATIM because each names tests that
 * exist in this tree. Neither number describes it: lane A measured 530/7050 on
 * a tree without lane B's last three commits (the price ladder, the founding
 * invite and the marketplace block, three new files and 54 cases), and lane B
 * measured 525/7029 on a tree without lane A's MONEY FIX A3 layer two and A4.
 * Taking the higher of the two would have written 530, which is below what this
 * tree runs.
 *
 * SO IT WAS RUN ON THE MERGED TREE rather than summed, for the eleventh time
 * this conflict has been settled and the first time by the lane that owns the
 * branch being merged.
 *
 * MEASURED: 533 files, 7104 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, GREEN, 112s, on this merge).
 *
 * THE SUM AGREES WITH THE MEASUREMENT HERE and that is worth recording rather
 * than assumed: 530 + 3 = 533 and 7050 + 54 = 7104, the three files being
 * tests/unit/dashboard/the-price-ladder-survives-a-blink.test.ts (17),
 * tests/unit/growth/a-founding-invite-is-spent-once.test.ts (22) and
 * tests/unit/growth/a-marketplace-block-holds.test.ts (15). Agreement is not
 * the reason the number is trusted; the run is. It is written down because a
 * sum that DISAGREES with a measurement is the signal that something stopped
 * collecting, and next time there will be nothing to compare against unless
 * somebody wrote this line.
 * ---------------------------------------------------------------------------
 *
 * 2026-09-21 (lane B, LB-SHOWCASEWHOLE): raised 533/7104 -> 534/7125.
 *
 * ONE NEW FILE AND TWENTY-ONE CASES, and nothing else moved:
 *   tests/unit/growth/a-performers-proof-of-draw-is-whole.test.ts  21  (new file)
 *   533 + 1 = 534 files
 *   7104 + 21 = 7125 tests
 *
 * MEASURED: 534 files, 7125 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, GREEN, 148s, on the tree of this commit).
 *
 * NO EXISTING TEST WAS REWRITTEN OR LOOSENED by this item, which the last three
 * lane B raises each had to declare and this one does not. The subject module
 * had no unit test of its own before this file.
 * ---------------------------------------------------------------------------
 */

/*
 * ---------------------------------------------------------------------------
 * 2026-09-20 (lane C, merging verify/l5-launch-readiness into lane/c-ux for
 * close-out C8): 525/6979 and 525/7003 -> 531/7054.
 * ---------------------------------------------------------------------------
 *
 * THE TWELFTH CONFLICT ON THIS ONE INTEGER, RESOLVED THE WAY THE BLOCK ABOVE
 * SAYS TO RESOLVE IT: not by taking the higher of the two numbers, which would
 * have written 7,003 and left the floor 51 tests below what this tree runs, but
 * by RUNNING IT on the merged tree.
 *
 *   531 files, 7054 tests, 0 failed, 0 skipped
 *   (`npm run gate:push -- --only suite`, 166s, GREEN)
 *
 * AND THE ARITHMETIC IS WHY IT WAS RUN. Lane C's tree had 6,979 and the verify
 * branch declared 7,003; +5 for this item's new test file and -1 for the case
 * that went with a deleted file predicts 7,007. The tree actually runs 7,054.
 * Six test FILES and forty-seven cases exist on the merged tree that neither
 * lane's arithmetic could see, because neither worktree contains the other's
 * last few commits. Every derived figure on this integer has been wrong; every
 * measured one has been right.
 *
 * NOTHING ABOVE WAS DELETED. Lane C's own account of raising 524/6975 to
 * 525/6979, lane B's account of the same hour, and lane A's merged measurement
 * all stand where they were written.
 */

/*
 * ---------------------------------------------------------------------------
 * 2026-09-21 (lane C, merging verify/l5-launch-readiness into lane/c-ux to
 * clear the returned overlap): 532/7062 and 534/7125 -> MEASURED BELOW.
 * ---------------------------------------------------------------------------
 *
 * THE THIRTEENTH CONFLICT ON THIS ONE INTEGER. Resolved the same way as the
 * twelve before it, by RUNNING the suite on the merged tree.
 *
 * WHAT EACH SIDE COULD SEE, so the next reader knows why neither number is the
 * answer. Lane C's tree runs 532/7062 (the last item added
 * tests/unit/guards/top-level-body.test.ts, six cases, and the floor was left
 * at 531/7054, which is legal because the floor only ever has to be BELOW the
 * truth, but it is stale and is corrected here). The verify branch declares
 * 534/7125, measured on a tree without lane C's last two commits. Taking the
 * higher would write 7125, which is below what this tree runs.
 *
 * MEASURED: 536 files, 7137 tests, 0 failed, 0 skipped
 * (`npm run gate:push -- --only suite`, GREEN, 130s, on this merge).
 *
 * AND THE ARITHMETIC IS WHY IT WAS RUN, AGAIN. The merged tree carries FOUR
 * files and seventy-five cases that lane C's worktree could not see, and TWO
 * files and twelve cases that the verify branch could not see. Neither side's
 * sum reaches 7137. Every derived figure on this integer has been wrong and
 * every measured one has been right; that record is now thirteen for thirteen.
 *
 * NOTHING ABOVE WAS DELETED. Lane A's, lane B's and lane C's accounts all
 * stand exactly where they were written.
 */
const MIN_FILES = 536
const MIN_TESTS = 7137


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
/*
 * TWO REPORTERS, AND THE SECOND ONE IS THE POINT (close-out FO1, 18 September
 * 2026).
 *
 * The JSON reporter is what this guard counts from, and it is also what loses
 * the evidence. When vitest cannot serialise a failure it writes the literal
 * string `STACK_TRACE_ERROR` into `failureMessages` along with the stack of
 * where the test was DEFINED, not where it failed. This step then reported, in
 * full:
 *
 *     1 test(s) FAILED.
 *       tests/component/fee-sentence-spacing.test.tsx > /organisers states ...
 *         Error: STACK_TRACE_ERROR
 *             at task (.../chunk-artifact.js:1784:27)
 *
 * which names the test and says nothing whatever about what went wrong. An
 * ordinary assertion failure survives the round trip perfectly, so this only
 * bites on the errors that are hardest to reason about, which is the worst
 * possible time to lose the message. Two runs were spent proving the failure
 * was not reproducible outside this step, and the message that would have
 * shortened that to one look had been thrown away before anybody read it.
 *
 * The `dot` reporter is silent on success and prints the LIVE error object on
 * failure, so it never went through serialisation. `--outputFile.json=` is the
 * per-reporter form and resolves against the project root exactly as the bare
 * `--outputFile` did, which the counting below still depends on.
 */
const result = spawnSync(
  process.execPath,
  [VITEST, 'run', '--reporter=dot', '--reporter=json', `--outputFile.json=${REPORT_NAME}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: gitEnv() },
)

/**
 * A WORKER THAT NEVER STARTED IS NOT A FILE THAT STOPPED COLLECTING, AND THIS
 * GUARD USED TO CALL IT ONE.
 *
 * On 18 September 2026 a gate run reported 431 files against a baseline of 442
 * and said "the suite is running LESS than it used to", which sent the search
 * into the tree. The cause was in vitest's own output, which this guard captures
 * and then threw away:
 *
 *     Error: [vitest-pool]: Failed to start forks worker for test files ...
 *     Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
 *
 * A file whose worker never started registers nothing at all, so it is
 * indistinguishable in the JSON report from a file somebody deleted. The
 * distinction only exists on stderr, so it is read from there and said out loud.
 * The run STILL FAILS: a suite that did not run every test is not evidence of
 * anything. What changes is that it names the runner rather than the tree.
 */
const poolFailures = poolStartFailures(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
const reportPoolFailure = () => {
  if (poolFailures.length === 0) return
  console.error(
    `\n[test-count-canary] ${poolFailures.length} vitest WORKER(S) FAILED TO START. This is the runner, not the tree:`,
  )
  for (const f of poolFailures) console.error(`    ${f}`)
  console.error(
    '  Those files registered nothing, so they are indistinguishable in the JSON report\n' +
      '  from files that were deleted. vitest START_TIMEOUT is a hardcoded 60s and is not\n' +
      '  configurable; the lever is fewer concurrent workers (maxWorkers in\n' +
      '  vitest.config.ts) or less else running on the machine. This run is still a FAILURE,\n' +
      '  because a suite that did not run every test proves nothing.',
  )
}

if (!existsSync(REPORT)) {
  console.error(`[test-count-canary] vitest wrote no JSON report at ${REPORT_NAME}, so nothing can be counted.`)
  reportPoolFailure()
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
  /*
   * NAME THE FILES, for the same reason the failing tests are named below, and
   * because on 14 September 2026 this branch was the whole of what the gate
   * said. The push of eight commits was refused at the suite step with
   * "2 test SUITE(S) failed. Read the vitest output." and a total one test
   * below the baseline. There WAS no vitest output to read: this guard runs
   * vitest with --reporter=json into a file and then deletes it, so the
   * instruction pointed at something that does not exist, and the second
   * failing file was never identified. One of the two was a flake that passed
   * standalone seconds later; the other is still unknown and cannot now be
   * recovered.
   *
   * The report already carries every file with its status and its assertions,
   * so withholding the names cost a diagnosis for nothing. A file listed with
   * zero failed tests is the interesting case: it failed OUTSIDE a test, in a
   * hook, a teardown or an unhandled rejection, and that is the shape that
   * takes tests down with it and shows up as a total below the baseline.
   */
  const failedFiles = (Array.isArray(report.testResults) ? report.testResults : [])
    .filter(r => r.status === 'failed')
    .map(r => {
      const file = (r.name ?? '').replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '')
      const assertions = r.assertionResults ?? []
      const bad = assertions.filter(a => a.status === 'failed').length
      return `        ${file}  (${assertions.length} test(s) registered, ${bad} failed)`
    })
  problems.push(
    `${failedFiles.length || failedSuites} test FILE(S) failed:\n` +
      (failedFiles.length > 0 ? failedFiles.join('\n') : '        (the report named none)') +
      '\n' +
      '      A file listed here with 0 failed tests failed OUTSIDE a test: a hook, a\n' +
      '      teardown or an unhandled rejection, and that shape can take its remaining\n' +
      '      tests down with it.\n' +
      (failedSuites !== failedFiles.length
        ? `      vitest's own numFailedTestSuites says ${failedSuites}, and it is NOT a file count:\n` +
          '      it counts describe blocks too, so one file failing inside one describe\n' +
          '      reports as two. Drilled on 14 September 2026. Trust the list above.\n'
        : ''),
  )
}
if (!reportedSuccess) {
  problems.push('vitest reported success=false for this run.')
}
if (failed > 0) {
  /*
   * NAME THEM. Close-out F1.1 in miniature, found on 10 September 2026: this
   * guard reported "1 test(s) FAILED" and nothing else, and the run it reported
   * was a FLAKE that did not reproduce standalone. A count with no name sends the
   * next person to re-run the whole suite and hope, which is exactly the two
   * wasted log reads F1.1 was written about. The report is already in hand and it
   * carries every assertion, so there is no reason to withhold the name.
   */
  const failing = (Array.isArray(report.testResults) ? report.testResults : []).flatMap(r =>
    (r.assertionResults ?? [])
      .filter(a => a.status === 'failed')
      .map(a => {
        const file = (r.name ?? '').replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '')
        /*
         * MORE THAN THE FIRST LINE. vitest 4's JSON reporter opens a failure
         * message with the literal "Error: STACK_TRACE_ERROR" and puts the
         * assertion underneath it, so a one-line excerpt is guaranteed to say
         * nothing at all. Twelve lines is enough for the expected/received pair
         * that names the actual disagreement.
         */
        const why = ((a.failureMessages ?? [])[0] ?? 'no message')
          .split('\n')
          .slice(0, 12)
          .map(l => `        ${l}`)
          .join('\n')
        return `      ${file} > ${a.fullName ?? a.title}\n${why}`
      }),
  )
  problems.push(
    `${failed} test(s) FAILED. This runs the suite, so it reports failures too.\n` +
      (failing.length > 0
        ? failing.join('\n')
        : '      (the report named none, which means the failure is at suite level)'),
  )

  /*
   * AND THE CHILD'S OWN WORDS, for the failures the JSON reporter flattened
   * into "STACK_TRACE_ERROR" (close-out FO1, 18 September 2026). vitest runs
   * here with `--reporter=dot` as well, which is silent while everything
   * passes and prints the LIVE error object when something does not, so it
   * never goes through the serialisation that loses the message. It is captured
   * rather than inherited because this guard parses nothing from stdout, so it
   * has to be printed deliberately, and only when there is a failure to explain.
   */
  const childOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd()
  /*
   * FROM THE "Failed Tests" BANNER, NOT THE LAST N LINES. A tail was the first
   * attempt and it printed eighty lines of `captureException` chatter from
   * tests that PASSED, because the suite logs a great deal of expected stderr
   * on its way through. vitest prints its failure section last and marks it, so
   * the marker is the anchor and the tail is only the fallback for a failure
   * that never reached that section.
   */
  const banner = childOutput.search(/Failed Tests \d+/)
  const excerpt = banner === -1 ? childOutput.split('\n').slice(-40) : childOutput.slice(banner).split('\n').slice(0, 120)
  if (excerpt.join('').trim()) {
    problems.push(
      "vitest's own report of those failures, which survives errors the JSON reporter cannot\n" +
        `      serialise${banner === -1 ? ' (no failure section was printed, so this is the tail)' : ''}:\n` +
        excerpt.map(l => `      ${l}`).join('\n'),
    )
  }
}
/**
 * WHICH FILES DID NOT RUN, BY NAME.
 *
 * This guard used to report a shortfall and then tell the reader to go and find
 * the cause with `npx vitest run`, which is advice rather than a diagnosis. On
 * 18 September 2026 it refused a push with "only 431 test FILES ran, baseline is
 * 442", and the eleven files were not recoverable from its output at all: it
 * runs vitest with `--reporter=json` into a file and then deletes it, so there
 * was no vitest output left to read. A re-run of the same tree collected all
 * 442, which made the eleven a mystery rather than a finding.
 *
 * It already holds everything needed to answer the question. The JSON report
 * names every file that DID run, and the two `include` globs in
 * vitest.config.ts say which files SHOULD have. The difference is the answer,
 * and it is printed rather than described.
 *
 * The globs are matched by suffix rather than by a glob library, deliberately:
 * they are `tests/unit/ ** /*.test.ts` and `tests/component/ ** /*.test.tsx`,
 * and a walker plus an extension test says exactly that with nothing to keep in
 * step with a dependency. If a third project is ever added to the config, this
 * list has to gain it, and the count printed beside the names is what will say
 * so: an on-disk total that disagrees with the baseline means this list is
 * stale, not that the suite shrank.
 */
/** Windows paths from `join()` carry backslashes; vitest reports forward ones. */
const norm = p => p.split(String.fromCharCode(92)).join('/')
const testFilesOnDisk = () => {
  const found = []
  const walk = dir => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch (error) {
      // The directory is named by vitest.config.ts, so its absence is a real
      // finding about this list being stale rather than something to swallow.
      console.log(`[test-count-canary] ${dir} could not be read (${error.message}), so the on-disk list is incomplete`)
      return
    }
    for (const entry of entries) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.test\.tsx?$/.test(entry)) found.push(norm(p))
    }
  }
  walk(join(ROOT, 'tests', 'unit'))
  walk(join(ROOT, 'tests', 'component'))
  return found.map(p => p.replace(norm(ROOT) + '/', ''))
}

if (files < MIN_FILES) {
  const ran = new Set(
    (Array.isArray(report.testResults) ? report.testResults : []).map(r =>
      (r.name ?? '').replace(/\\/g, '/').replace(norm(ROOT) + '/', ''),
    ),
  )
  const onDisk = testFilesOnDisk()
  const missing = onDisk.filter(f => !ran.has(f)).sort()
  problems.push(
    `only ${files} test FILES ran, baseline is ${MIN_FILES}.\n` +
      '      A file that fails to COLLECT is reported by vitest as "no tests", not as a\n' +
      '      failure, so this is very often a file that crashed at module scope rather\n' +
      '      than a file somebody deleted.\n' +
      `      ${onDisk.length} file(s) match the vitest include globs on disk; ${ran.size} of them ran.\n` +
      (missing.length > 0
        ? '      DID NOT RUN:\n' + missing.map(f => `        ${f}`).join('\n')
        : '      Every file on disk ran, so the shortfall is against the BASELINE rather than\n' +
          '      against the tree: files were deleted, or this list does not cover a third\n' +
          '      vitest project added to vitest.config.ts.'),
  )
}
if (tests < MIN_TESTS) {
  problems.push(
    `only ${tests} tests PASSED, baseline is ${MIN_TESTS}.\n` +
      '      Tests that do not run cannot fail, so a green suite that runs fewer tests\n' +
      '      is not evidence of anything.\n' +
      (failed > 0
        ? `      READ THIS WITH THE FAILURES ABOVE FIRST. This is the PASSED count, not the\n` +
          `      total, so the ${failed} failing test(s) already lower it by ${failed} on their own.\n` +
          '      A shortfall of exactly that size means nothing stopped running.' + `\n`
        : '      Nothing failed on this run, so the shortfall is tests that did not run at all.'),
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
  /*
   * THE HEADER SAYS WHICH KIND OF PROBLEM IT WAS, because "running LESS" was
   * printed for both kinds and is only true of one.
   *
   * On 18 September 2026 this guard printed "The suite is running LESS than it
   * used to" on a run of 422 files and 5201 tests against a baseline of 421 and
   * 5178. The suite had GROWN. One test had failed, which is a completely
   * different finding with a completely different next step, and the header sent
   * the reader looking for a file that had stopped collecting. The detail lines
   * below it were correct and named the failing test exactly, which is the worse
   * shape rather than the better one: a summary that contradicts the note three
   * lines beneath it is worse than no summary at all. The same ruling was applied
   * to initial-bundle-budget's PASS line on the same day.
   *
   * The two are distinguished by the floors, which are the only thing this
   * guard's own name is about.
   */
  const ranLess = files < MIN_FILES || tests < MIN_TESTS || skipped > MAX_SKIPPED
  console.error(
    `\n[test-count-canary] FAILED. ${
      ranLess
        ? 'The suite is running LESS than it used to.'
        : `The floors held (${files} files, ${tests} tests against ${MIN_FILES}/${MIN_TESTS}), so nothing stopped running: the suite FAILED on its own results. Read the lines below, not the floors.`
    }\n`,
  )
  for (const p of problems) console.error(`  - ${p}\n`)
  console.error(
    ranLess
      ? '  Find the file that stopped collecting before touching the baseline. Run\n' +
          '  `npx vitest run` and look for a file reporting "no tests" or a suite-level\n' +
          '  error rather than a test-level one.\n\n' +
          '  Lowering MIN_FILES or MIN_TESTS to go green is the move this guard exists to\n' +
          '  stop. It needs a founder ruling and a note on the constant.\n'
      : // Sending a reader to hunt for a file that stopped collecting, when the
        // floors say none did, is the same misdirection the header carried.
        '  The floors are not the finding here, so do NOT touch the baseline. Fix the\n' +
          '  named failure(s) above, then re-run. If a named test does not reproduce on\n' +
          '  its own, it is a flake and belongs in the review queue rather than in a\n' +
          '  baseline change.\n',
  )
  // Last, so it is the thing left on screen: if workers failed to start, every
  // count above is a symptom and none of it is about the tree.
  reportPoolFailure()
  process.exit(1)
}

if (files > MIN_FILES || tests > MIN_TESTS) {
  console.log(
    `[test-count-canary] the suite has GROWN (${files}/${tests} against ${MIN_FILES}/${MIN_TESTS}).\n` +
      '[test-count-canary] raise the baseline in this file so the new floor is held.',
  )
}

console.log('[test-count-canary] PASS - nothing stopped running.')
