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
 */
const MIN_FILES = 378
const MIN_TESTS = 4574

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
