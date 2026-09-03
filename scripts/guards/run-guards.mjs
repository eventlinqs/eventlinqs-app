/**
 * The guard runner. Invoked by `npm run guards` and, through it, by `prebuild`,
 * so every one of these is unskippable on the path to a deployable build.
 *
 * Each guard turns a law that was previously enforced by hope into one enforced
 * by a non-zero exit code:
 *
 *   node-version-contract      no script may use an API newer than CI's Node
 *   no-deprecated-runtime      Law 9: the pinned runtime is still supported
 *   auth-provider-guard        no provider button without a server-resolved gate
 *   no-supabase-smtp           no auth flow on Supabase's 2-per-hour built-in mailer
 *   sender-single-source       one definition of the sending identity
 *   no-unguarded-credential-form  no password field submittable before hydration
 *   no-control-characters      no heredoc-corrupted byte in any source file
 *   auth-autocomplete          credential-manager attributes on every auth form
 *   auth-provider-cost         no provider gate on a route with no provider button
 *   canonical-host             one definition of the canonical host, resolved everywhere
 *   canonical-host-runtime     the resolvers, executed, actually return it on production
 *   short-link-namespace       /e/ and /s/ own their segments; no code can shadow a route
 *   check-client-barrel-imports  no third-party namespace import in the browser bundle
 *   migration-collision-guard  no two migrations claiming one version, on any branch
 *   no-inherited-git-env       every git subprocess clears inherited GIT_ variables
 *   payment-critical-doctrine  every paymentCritical variable is actually protected
 *   rls-exposure-scan          no world-readable policy exposes a sensitive column
 *   no-native-submit           no form puts a credential in the URL pre-hydration
 *   no-silent-submit           no control completes with no result and no error
 *   revoked-column-reads       no untrusted-role query selects a revoked column
 *   no-plaintext-credential    no tracked file contains a plaintext credential
 *   entrypoint-authz-audit     every request entry point declares an auth posture
 *   sourced-specifications     Law 7: a third-party spec carries a source or UNSOURCED
 *   no-ai-authorship           Law 8: no commit attributes this work to an AI
 *   labelled-form-controls     every raw input, select and textarea carries a
 *                              programmatic label, so assistive technology can name it
 *   labels-name-the-right-control  and that label points at the control it describes,
 *                              not at the one that happens to sit beside it
 *   event-structured-data      an event page cannot ship without its Event JSON-LD
 *   sitemap-resolves           no URL enters the sitemap that has no route, redirects, or
 *                              names a column that does not exist
 *   maintained-aggregates      no cache tag without an invalidation, no stored counter
 *                              without a declared maintainer
 *   no-silent-catch            no catch around I/O discards its error in silence
 *   no-client-sentry-import    no client component pulls @sentry/nextjs into the bundle
 *   steps-declare-work     every CI step prints how much work it did, and zero fails
 *   curated-categories-exist  every curated homepage category slug exists in the database
 *   no-banned-word-anywhere  the banned word in identifiers, slugs, paths and keys, not only copy
 *   proper-nouns-intact      and the names of real organisations survive that sweep intact
 *   community-editorial-reachable  bespoke community copy reaches a page, or is declared dead
 *   no-unguarded-production-write  no script writes to a database without checking which one
 *   one-db-connection-source   no script assembles its own database connection
 *   one-visibility-source      one public-visibility rule, and every event cache tag is invalidated
 *   migration-needs-sale-gate-fix  the anon column revoke never ships without the sale-gate fix
 *   one-fee-copy               no customer-facing surface names a second fee
 *   pricing-derive             the worked fee figures match the lock block they derive from
 *   no-partial-builds          no undated flag, deferral marker or placeholder ships
 *   no-external-checkout       an externally ticketed event cannot reach a checkout
 *   one-sellability-source     one sellability rule, and no live button beside a refusal
 *   zoned-event-times          an event time is converted in the event zone, not the runtime one
 *   mutation-revalidates       a publicly visible mutation invalidates what it affected
 *   gate-fields-complete       a query feeding a gate selects every field that gate reads
 *   refund-restores-inventory  a refund can never take the money and keep the seat sold
 *   no-ambiguous-embed         a PostgREST embed that cannot name its foreign key fails the
 *                              whole query at runtime while compiling and testing clean
 *   one-refund-path            every refund trigger funnels through one path, so there is one
 *                              answer to how much money goes back
 *   inventory-lock-integrity   two buyers can never be sold the same seat
 *   no-unowned-organisation-read  a service-role read of an organisation's sale posture, or a
 *                              service-role call to the publish gate, must prove the caller
 *                              may act for that organisation first (the service role bypasses
 *                              RLS, so an unchecked read is a cross-tenant read)
 *   no-glassmorphism           no applied backdrop-filter anywhere in src, because the
 *                              Design system and Motion both ban it and neither had a gate
 *   stream-link-never-public   the livestream link is unreachable from every public surface
 *                              and the inert events.virtual_url column is read by nothing
 *   schema-ahead-of-code       the database this build runs against already carries every
 *                              column and table the code names, so code never deploys ahead
 *                              of its migration (read only; refuses a production build until
 *                              the founder's push lands, keeps building previews on TEST)
 *
 * On no-external-checkout: an event whose tickets are sold on another platform
 * must never render a selector or take a payment here, and the ruling was
 * explicit that this hold "by construction, not by a flag someone can forget".
 * Four refusals enforce it and each depends on its POSITION as much as its
 * presence: move the check in ticketsOnSale below the free-event line and every
 * FREE external event becomes sellable; move the charge preconditions refusal
 * below the organiser checks and an external event under a fully onboarded
 * organiser gets charged; move the reservation check inside its isPaid branch
 * and a free external event reserves. All three still pass every behavioural
 * test, which is why the structure is pinned separately from the behaviour.
 *
 * On one-fee-copy and pricing-derive: the founder ruling of 15 August 2026
 * deleted the separate payment processing fee. The CODE changed that day and the
 * COPY did not, and the sweep found the deleted fee still alive in about twenty
 * places, including the AI support knowledge base, which told anyone who asked
 * that there was "a payment processing fee shown at checkout". Not one of those
 * failed a test, a type check or a gate, because prose is not executed. Worse,
 * docs/PRICING.md, the document that declares itself the ONLY place a fee figure
 * may be written, carried four worked examples built on the deleted fee and was
 * itself the largest single source of the wrong number. So there are now two
 * gates rather than one: pricing-derive RECOMPUTES every worked figure in that
 * document from the lock block and fails on any disagreement, and one-fee-copy
 * fails the build when a customer-facing surface asserts a second fee. The
 * second is deliberately scoped to ASSERTIONS rather than words, because the
 * database column is real, the pass-through rule is live, and the correct copy
 * for an assistant is the sentence "there is no payment processing fee".
 *
 * On no-ai-authorship: Law 8 makes the founder the sole author, which overrides
 * this tooling default of appending a Co-Authored-By trailer. The commit-msg hook
 * in .githooks/ is the cheap enforcement because it rejects a message before it
 * becomes history. This guard is the second line, for the hook being bypassed with
 * --no-verify or a checkout where core.hooksPath was never set, since that setting
 * is local config and is not committed. It is bounded to commits after the law was
 * enacted, because 705 of 1351 reachable commits already carry the trailer and the
 * history rewrite is deliberately deferred until after launch. The deferred count
 * prints on every run so it is not forgotten.
 *
 * On sourced-specifications: Law 7 forbids stating any specification, dimension,
 * limit, price, format or platform behaviour from memory. No static check can judge
 * whether prose was researched, and a guard demanding a citation beside every
 * numeral would fire thousands of times and be switched off within a day. So this
 * narrows to the shape that actually caused harm: a claim about SOMEBODY ELSE'S
 * platform. A line naming a third party and asserting a pixel pair or an aspect
 * ratio must carry a URL or the word UNSOURCED. An honest gap outranks a confident
 * guess, and both satisfy the gate.
 *
 * On entrypoint-authz-audit: there are 167 request entry points, 50 route handlers
 * and 117 exported server actions. The security pass had read about twenty of them
 * and reported the rest as unread, which is honest and useless, because an attacker
 * does not care which files were sampled. This walks all of them and fails the build
 * when one establishes no caller identity and is not declared public with a stated
 * reason, so a route added next month cannot skip the question silently. The
 * decisive distinction it encodes: a session-client path is governed by RLS, so the
 * database scopes the rows, while a service-role path has no backstop and a missing
 * ownership check IS the vulnerability.
 *
 * On no-plaintext-credential: GitGuardian reported a Company Email Password
 * exposed in this repository on 2026-08-08. It was hardcoded in twenty committed
 * automation scripts and reproduced into three security documents, one of them
 * written by the hardening pass itself, which quoted the leaking URL from the
 * brief and the URL contained the password. The person most alert to the defect
 * still committed it, because quoting evidence feels like documentation rather
 * than disclosure. A guard does not feel that difference. Note it protects the
 * WORKING TREE only: a secret already in history is un-exposed by ROTATION, never
 * by an edit.
 *
 * On revoked-column-reads: migration 20260808000010 narrows column privileges, and
 * a privilege failure is LOUD by design, which is right for security and is still
 * an outage in production. PostgREST returns "permission denied for column email"
 * and fails the WHOLE query, not just the field. The first draft of that migration
 * would have broken Stripe Connect onboarding, because onboard/route.ts reads
 * organisations.email with the session client. Nothing in the type system or the
 * test suite could catch it: the failure only exists once the grant changes. This
 * guard resolves the client per query, so it knows which Postgres role each read
 * runs as, and fails the build if any of them asks for a column it no longer has.
 *
 * On no-native-submit: a form written as onSubmit with preventDefault and no
 * action is correct once React is live and a credential leak before it, because
 * a native submit with no action and no method is a GET to the current URL with
 * every named field in the query string. That is how a real password reached
 * production in a URL. The first fix covered src/components/auth, which is four
 * files; the class is not four files, and the same shape carried the ADMIN
 * password, the admin TOTP code and the recovery code on /admin/login. This
 * guard is repo-wide and risk-aware: it fails on forms carrying a credential or
 * personal data, and merely lists the search boxes and filter panels, where a
 * field in the query string is the entire point.
 *
 * On rls-exposure-scan, because it is the newest and the least obvious: Row
 * Level Security filters ROWS, never COLUMNS. A permissive SELECT policy with
 * no TO clause reaches PUBLIC, which includes anon, and the anon key is
 * NEXT_PUBLIC and readable in any page source. So one such policy publishes
 * every column of every matching row to the whole internet. That shipped twice:
 * 20260625000002 closed it on profiles (email, full_name, phone) and
 * 20260808000010 closed it on organisations, on event_artists.invite_token (a
 * credential that transfers profile ownership) and on venues. The first fix
 * dropped a policy, which fixed the instance and left the class alive. This
 * guard models both the policies and the column grants, so it fails the build
 * when the shape reappears on any table, including one not yet written.
 *
 * Runs them all rather than short-circuiting, so one pass reports every
 * violation instead of making the founder play whack-a-mole.
 *
 * THE BOUNDARY BETWEEN THE TWO GUARD SYSTEMS, stated because the rebase that
 * brought them together made it a live question rather than a tidy one.
 *
 * Two independent lines of work each added a build-failing guard and each wired
 * it into the same `prebuild` line. PR #111 added
 * `scripts/check-client-barrel-imports.mjs`, which protects the SIZE of the
 * browser bundle. This branch added the runner you are reading, which protects
 * the CORRECTNESS of the auth surface and the runtime every script assumes.
 * Git presented that as one conflicted line, and the shape of the conflict made
 * "keep my side" delete the other side's guard with nothing going red: the build
 * would have stayed green while an entire class of regression stopped being
 * checked. That is the failure mode this comment exists to prevent recurring.
 *
 * preview-deployment-state: fails when the newest deployment for the current
 * branch is in ERROR. Added 9 August 2026 after feat/public-composer was found
 * with SIX consecutive preview builds in ERROR while tsc, eslint, 1839 tests
 * and nine guards all reported green, because none of them can see a bundler
 * failure. Skips loudly without a VERCEL_TOKEN rather than failing on every
 * machine without credentials, because a guard everyone disables protects
 * nothing. A skip is the honest state, not a pass.
 *
 * The resolution is deliberately structural rather than a longer `&&` chain.
 * `prebuild` now names ONE runner, and the list below is the single place a
 * build-failing guard is registered, so a third line of work cannot recreate
 * the same collision. The two systems keep separate FILES because they answer
 * separate questions and fail for separate reasons; they share a RUNNER because
 * "what must be true before this repository may be built" is one list, not two.
 *
 * The barrel guard gains something real from being here rather than in the
 * chain: the runtime banner below now covers it too. It was previously run on
 * whatever Node happened to be on the machine, with nothing saying so.
 *
 * THE RUNTIME BANNER. On 2026-08-05 this suite reported all-pass on a laptop
 * running Node 24 while three of its four guards were crashing in CI on Node 20.
 * The suite was not wrong about the code; it was measured on a runtime CI never
 * uses, and nothing said so. It says so now: any run whose Node major is not the
 * `.nvmrc` contract is labelled NOT CI-EQUIVALENT in its own output, so a green
 * local run cannot be quoted as proof of a green CI run.
 *
 * The banner is DERIVED from `.nvmrc`, never hardcoded, which is why the founder
 * ruling of 13 August 2026 moving the platform to Node 24 needed no edit here.
 * The polarity simply inverted with the contract: a Node 24 run now reads
 * CI-EQUIVALENT and a Node 20 run reads NOT CI-EQUIVALENT, the reverse of what
 * this file printed the day before. That is the property worth having. A banner
 * with the number written into it would have gone on confidently reporting the
 * old answer, which is the failure it exists to prevent.
 *
 * no-display-time-exclusion: founder ruling 16 August 2026, PUBLISHED MEANS
 * VISIBLE. Refuses the four shapes in which a published, public row has
 * actually been removed from a discovery surface on this platform: a SQL lower
 * bound at now, the same bound written in JavaScript, a cover test used to
 * exclude rather than to rank, and a post-query filter running on a page the
 * database had already chosen. Nineteen tests pinned the listing window and all
 * of them passed while seven more copies of the defect were live; a test proves
 * the code it calls, and only a scanner proves the absence of a shape. Its scope
 * is derived rather than listed, and it prints how many files, predicates,
 * filters and range calls it inspected, so a scope that collapses says so
 * instead of printing the same PASS.
 *
 * publish-requires-cover: the photo-required rule, in four parts, because
 * removing any one of them leaves the other three looking healthy: the
 * predicate still rejects null, empty and picsum; the cover field is REQUIRED by
 * the type (it was once optional, and a caller that omitted it skipped the check
 * in silence); the refusal runs before any path that can return ok; and every
 * publish site in a derived scan is either gated or carries a written
 * allowance. It also asserts the database backstop, both the migration that adds
 * the events_published_real_cover constraint and the one that VALIDATES it,
 * since a constraint left NOT VALID binds new rows only.
 */
import { spawnSync } from 'node:child_process'

import { gitEnv } from '../lib/git-env.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * Every build-failing guard, as a path relative to the repository root.
 *
 * Repo-relative rather than a bare filename, because the list is no longer all
 * one directory and pretending otherwise would have meant either moving another
 * line of work's file to fit this runner's assumption, or quietly leaving it
 * out. Registering a guard is now one line here, wherever the guard lives.
 */
const GUARDS = [
  'scripts/guards/node-version-contract.mjs',
  // Law 9 (founder ruling 2026-08-13). node-version-contract asks whether the
  // scripts match the pinned runtime; this asks whether the PIN ITSELF is still
  // a supported release, which nothing did. `.nvmrc` said 20 until 13 August
  // 2026 and Node 20 went end of life on 2026-04-30, so the platform sat three
  // and a half months on an unsupported runtime with every gate green.
  'scripts/guards/no-deprecated-runtime.mjs',
  'scripts/guards/auth-provider-guard.mjs',
  'scripts/guards/auth-provider-cost-guard.mjs',
  'scripts/guards/no-supabase-smtp.mjs',
  'scripts/guards/sender-single-source.mjs',
  'scripts/guards/no-unguarded-credential-form.mjs',
  'scripts/guards/no-control-characters.mjs',
  'scripts/guards/auth-autocomplete-guard.mjs',
  // One definition of the canonical host. The same wrong-domain defect had
  // landed in six places, including four share-card generators that printed it
  // onto an artefact a stranger sees, and every one was found by accident.
  'scripts/guards/canonical-host.mjs',
  // The RUNTIME half of the same law, and the one that could have caught the
  // 13 August defect. The scanner above reads files; the wrong host was never in
  // a file. It came out of VERCEL_PROJECT_PRODUCTION_URL at runtime, so a clean
  // grep and a wrong artefact were true at the same time. This one executes the
  // real resolvers in a fresh process under a simulated production and a
  // simulated preview, which is the only way to see a value that lives in an
  // environment variable.
  'scripts/guards/canonical-host-runtime.mjs',
  // A share code is a readable slug, so it must never be mintable as something
  // that shadows a real route, and nothing else may take the /e/ segment.
  'scripts/guards/short-link-namespace.mjs',
  // A branch whose preview has not built is a branch whose verification is
  // fiction (founder ruling, 9 August 2026). Skips loudly without a token.
  'scripts/guards/preview-deployment-state.mjs',
  // From PR #111. See THE BOUNDARY above: separate file, separate question,
  // shared runner. Absent from this list, `prebuild` stops checking the browser
  // bundle for untree-shakeable namespace imports and nothing goes red.
  'scripts/check-client-barrel-imports.mjs',
  // Founder ruling 2026-08-12 (R-MIGRATION-GUARD). This guard was written for
  // exactly the failure it needed to catch, was correct, had a working
  // cross-branch check, and was WIRED TO NOTHING. It lived in scripts/verify/
  // and no gate, script or workflow invoked it, so it reported nothing and the
  // silence read as health. Three real collisions accumulated behind it, one of
  // which reached TEST and skipped a migration permanently.
  //
  // Registered here it runs in `prebuild` and blocks the build, which is the
  // only place it can act before a colliding version is pushed. It stays in
  // scripts/verify/ because it is also run by hand with --remote against the
  // linked project; the path below is the one thing that makes it a gate.
  'scripts/verify/migration-collision-guard.mjs',
  // Founder ruling 2026-08-15, the GIT_DIR incident class. A git hook exports
  // GIT_DIR, an inheriting child ignores cwd for the purpose of choosing a
  // repository, and the command runs against the REAL one. That is how a test
  // drill set core.bare=true on the shared config and broke `git status` in all
  // nine worktrees at once, and how two commits reached the remote authored by a
  // test fixture.
  //
  // Registered here rather than left as a convention because the failure is
  // invisible outside a hook: in an ordinary shell GIT_DIR is unset, every call
  // site behaves correctly, and code review cannot tell the safe line from the
  // unsafe one. This is the only place the decision is checked at all.
  'scripts/guards/no-inherited-git-env.mjs',
  // Founder ruling 2026-08-12: of the twelve unwired source-only checks found by
  // the sweep, wire THIS one and leave the other eleven listed and unwired,
  // because it guards money. It asserts the paymentCritical doctrine: every
  // variable carrying that flag exists on production, is sensitive where the
  // platform allows it, is covered by the runtime sentinel, and has a rotation
  // procedure with a verification command.
  //
  // It was itself written because a classification had one display consumer and
  // no guard, which is the same shape as a guard with no caller: something that
  // reads as a control and controls nothing.
  'scripts/verify/payment-critical-doctrine.mjs',
  // RLS column exposure. Deliberately written WITHOUT apostrophes: the registry
  // test extracts single-quoted strings from this array, so an apostrophe in a
  // comment here is parsed as the start of a registered path and turns
  // tests/unit/guards/guard-registry.test.ts red for a reason that has nothing
  // to do with guards. Full rationale lives in the header above and in
  // docs/security/AUDIT-2026-08-08.md.
  'scripts/security/rls-exposure-scan.mjs',
  'scripts/guards/no-native-submit-guard.mjs',
  // A control that completes with neither a visible result nor a visible
  // error. Journey 8, 29 August 2026: a number input whose min and step
  // disagreed made every round value a stepMismatch, so the browser refused
  // the submit before React saw it and the panel showed nothing at all.
  'scripts/guards/no-silent-submit.mjs',
  'scripts/security/revoked-column-reads.mjs',
  'scripts/guards/no-plaintext-credential.mjs',
  'scripts/security/entrypoint-authz-audit.mjs',
  'scripts/guards/sourced-specifications.mjs',
  'scripts/guards/no-ai-authorship.mjs',

  // A raw input, select or textarea that assistive technology cannot name is
  // unusable without sight, and it is invisible to review because the screen
  // looks finished. Found on 28 August 2026: 34 such controls across 13
  // surfaces, including the whole venue form and the whole discount form, where
  // a visible label sat right beside the field and was associated with nothing.
  // NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  // The guard walks the TSX AST rather than grepping, because both greps tried
  // that day were wrong: one called 20 controls labelled when 9 were, the other
  // called 39 unlabelled when 0 were. It resolves aria-label, aria-labelledby,
  // htmlFor pairing, an ancestor label element, and a component that wraps its
  // children in a label. The DOM remains the authority; this is the fast gate.
  'scripts/guards/labelled-form-controls.mjs',

  // The sibling of the guard above, and the founder was right that the first one
  // could never catch this: it proves a control HAS a name, not that the name is
  // TRUE. On 28 August a label reading "Price" pointed at the CURRENCY select
  // beside the price input, so pressing the label focused the currency and
  // filling the field the label named produced a zero-priced ticket on a paid
  // event. NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  'scripts/guards/labels-name-the-right-control.mjs',

  // Founder brief 2026-08-23: an event page can never ship without its
  // structured data. A production audit that day found every event page valid
  // on the REQUIRED set but missing `performer` on 36 of 36, because the page
  // loaded the lineup to render it and never passed it to the markup. This
  // guard holds the WIRING; tests/unit/seo/event-structured-data.test.ts holds
  // the CONTENT; scripts/verify/event-structured-data-audit.mjs holds the
  // DEPLOYED truth.
  'scripts/guards/event-structured-data.mjs',
  // NOTHING ENTERS THE SITEMAP THAT DOES NOT RESOLVE. Three ways of breaking
  // that promise were live in one file at once on 25 August 2026: a query on
  // venues.slug, a column that does not exist, silently caught; six
  // /categories/* URLs this repository 308s away; and no tie at all between the
  // shapes published and the routes that exist. A sweep of the 586 URLs the
  // production sitemap published returned 48 hard 404s.
  'scripts/guards/sitemap-resolves.mjs',
  // A SECOND COPY MUST HAVE SOMETHING KEEPING IT IN STEP. Four failures of this
  // one class landed in a week, in four different mechanisms: a cached rail with
  // eight deleted events, a sitemap with 48 dead URLs, reserved_count holding
  // seats nobody held, and event_addons.sold_count stuck at 0 while the checkout
  // capped an addon at total_capacity minus it. This guard makes the link
  // between the write and the copy unskippable; the drift drive measures whether
  // the maintainers are actually correct.
  'scripts/guards/maintained-aggregates.mjs',
  // AN ERROR FROM OUTSIDE THE PROCESS MUST NOT BE DISCARDED IN SILENCE. A bare
  // catch {} in src/app/sitemap.ts ate a 42703 on venues.slug, a column that has
  // never existed, and published zero venue URLs from the day the block was
  // written. The gate is drawn at I/O rather than at every catch, on purpose:
  // the reasoning, the 197 catches it deliberately does not fail, and the
  // PostgREST { data, error } shape it cannot see are all in the guard's header.
  'scripts/guards/no-silent-catch.mjs',
  // NO CLIENT COMPONENT MAY REACH THE SENTRY SDK THROUGH A VALUE IMPORT. That
  // edge existed once through the four error boundaries and put @sentry/nextjs
  // in the bundle of every route; client-error-report.ts was built to break it,
  // and a comment was all that kept it broken. The silent-catch sweep of
  // 2026-08-25 rebuilt it in one line, in bill-ref.ts, and nothing but a bigger
  // bundle would have said so.
  'scripts/guards/no-client-sentry-import.mjs',
  // A STEP THAT CLAIMS WORK MUST SAY HOW MUCH IT DID. A CI step named
  // "Warm ISR + the next/image optimiser" warmed no images at all, for weeks,
  // printing a tidy list of 200s the whole time; its replacement then reported
  // 40 variants across four pages, which was the CAP printed as a finding. The
  // list of scripts under this contract is DERIVED from the workflows on every
  // run, because a hand-written list would have to be remembered and being
  // remembered is the thing that failed.
  'scripts/guards/steps-declare-work.mjs',
  // THE HOMEPAGE MAY NOT TYPE OUT WHAT THE DATABASE ALREADY KNOWS. Nine
  // category tiles carried hand-typed names and five had drifted from
  // event_categories with nothing comparing them. The names are derived now, so
  // a curated slug that no longer matches a row renders NOTHING and the rail
  // silently shows eight tiles where it showed nine. This fails the build first.
  'scripts/guards/curated-categories-exist.mjs',
  // THE BANNED WORD, EVERYWHERE IT CAN LIVE. copy-tell-gate reads
  // customer-facing TEXT, so a string comparison in TypeScript and a slug in a
  // storage path both sat in its blind spot for months: captions.ts compared
  // against a slug that no longer existed and mis-registered every arts event,
  // and stock/categories/<retired>/ is still served to browsers. This one reads
  // identifiers, comparisons, slugs, URLs, storage keys, filenames and config,
  // and fails on an exemption whose file no longer contains the word.
  'scripts/guards/no-banned-word-anywhere.mjs',
  // Founder ruling 2026-09-03: proper nouns are EXEMPT from the banned word.
  // The ban stops EventLinqs describing ITSELF with that word; it was never
  // meant to rename other people's organisations. A find-and-replace had done
  // exactly that to 43 names. Both
  //   Multicultural Council of the Northern Territory
  //   National Multicultural Festival
  // were published under a mangled name on the /community pages, which are 441
  // of the 552 URLs in the production sitemap. The corruption made the word-ban gate GREENER while
  // making the tree untrue, which is why it needed a gate of its own rather
  // than a note. This comment names those bodies correctly on purpose: both
  // guards read the same registry, so the real names are the safe spelling.
  'scripts/guards/proper-nouns-intact.mjs',
  // Found 3 September 2026 by driving the pages. intersection-editorial.ts is
  // keyed on community taxonomy V1 while the site runs V2, so 211 of its 271
  // hand-written paragraphs reached no page. Nothing reported it, because the
  // templated fallback makes a page with missing bespoke copy look finished.
  // One retired slug had no redirect at all and returned a 404. This guard
  // makes an unreachable paragraph loud instead of silent.
  'scripts/guards/community-editorial-reachable.mjs',
  // Founder ruling 2026-08-13. `.env.local` in this repo points at the
  // PRODUCTION project, deliberately, because the app is run against production
  // from here. An audit that day found ten write-capable scripts with a
  // service-role credential and no check on which project they were about to
  // write to, four of which documented `node --env-file=.env.local <script>` in
  // their own header. The ten were fixed and given the preflight; this guard is
  // what stops the eleventh. Without it the fix is a written procedure, and a
  // written procedure is not a control.
  'scripts/guards/no-unguarded-production-write.mjs',

  // Founder instruction 2026-08-25, after two hours were lost to a
  // 28P01 password authentication failure whose cause was a hand
  // percent-encoded password, and whose three decoys were the REDACTED masking
  // that pg applies to a string it could not parse, a username that always reads
  // postgres on the pooler, and nine divergent private copies of the connection
  // parser. The sibling guard above asks whether a script checks WHICH database
  // it is about to write to; this one asks whether it built the connection
  // itself. Fixing the shared helper fixed nothing for the eight scripts that
  // were not using it, so the rule is now structural.
  //
  // NO APOSTROPHES IN THIS BLOCK. tests/unit/guards/guard-registry.test.ts reads
  // the entries below by extracting single-quoted strings from this file, so an
  // apostrophe in a comment opens a string literal and the registry parse breaks
  // for every guard after it. Sixteen guards read as unregistered when this
  // comment first said "pg" followed by an apostrophe and the word s.
  'scripts/guards/one-db-connection-source.mjs',

  // Founder instruction 2026-08-25, the second half of the same day. After the
  // demo purge, /events printed a correct header count of 2 beside a
  // "Popular this week" rail listing EIGHT deleted events, and a visitor
  // clicking any of them got a 404 on a live platform. Two causes: the
  // publication predicate was spelled out by hand in seventeen discovery
  // surfaces rather than shared, and a data cache held ROWS, which outlive the
  // rows they copy. Of every cache tag declared in the codebase, exactly one was
  // ever invalidated anywhere. This guard holds both halves.
  'scripts/guards/one-visibility-source.mjs',

  // Founder ruling 2026-08-15, a PRODUCTION SAFETY ordering rule expressed as a
  // gate. Migration 20260808000010 revokes stripe_account_id and
  // stripe_charges_enabled from anon. The event page used to read exactly those
  // two through an anon embed and feed them to the sale gate, so applying that
  // migration to a database whose deployed code still does that takes EVERY PAID
  // EVENT off sale instantly, with no error and no alert: it renders the real,
  // designed "organiser is still finishing their payment setup" state. This
  // guard fails the build if the migration is present without the fix.
  'scripts/guards/migration-needs-sale-gate-fix.mjs',

  // Founder ruling 2026-08-15, ONE FEE. Two gates, because the failure had two
  // halves and only one of them is about copy.
  //
  // one-fee-copy walks the customer-facing surfaces and fails on an ASSERTION of
  // a second fee. It is scoped to assertions rather than to the word
  // "processing" on purpose: orders.processing_fee_cents is a real column
  // holding real history, processing_fee_pass_through is live and decides who
  // carries the one fee, and the correct copy for an assistant includes the
  // sentence that there is no payment processing fee. Reviewed exemptions carry
  // ONE-FEE-ALLOW with a written reason and print on every run.
  'scripts/guards/one-fee-copy.mjs',
  // pricing-derive recomputes the worked examples and the margin table in
  // docs/PRICING.md from the PRICING-LOCK block and fails if the committed text
  // disagrees. It lives outside scripts/guards/ because it is also the
  // GENERATOR: run it with --write to regenerate, and with no arguments, which
  // is how the runner invokes it, it checks.
  'scripts/pricing-derive.mjs',
  // Founder ruling 2026-08-15: nothing on this platform stays partially built.
  // Held unregistered while it reported 57 hits, because a gate that cannot go
  // green is a gate somebody switches off. All 57 are now classified and
  // cleared: 41 were feature flags whose decision moved to one dated registry
  // beside the flags rather than 41 copies beside the call sites, 5 were this
  // guard reading OTHER detectors regex literals and finding its own subject
  // matter, 2 TODOs waited on a route that was never built and now point at the
  // real one, and the rest were reworded or dated. It blocks from here.
  'scripts/guards/no-partial-builds.mjs',
  // Founder ruling 2026-08-15, external ticketing non-negotiable 3. Pins the
  // POSITION of four refusals, not just their presence: each one is still
  // present and still passes every unit test when moved, and wrong.
  'scripts/guards/no-external-checkout.mjs',
  // Founder ruling 2026-08-16, PUBLISHED MEANS VISIBLE. The exclusion audit
  // found eleven ways a legitimate row could vanish; these two guards close the
  // class rather than the instance. The first refuses a display-time exclusion,
  // the second refuses a publish with no cover. Both print how much they
  // scanned, so a gate that has quietly stopped working says so in its own
  // output instead of printing the PASS it always printed.
  'scripts/guards/no-display-time-exclusion.mjs',
  'scripts/guards/publish-requires-cover.mjs',
  // Founder ruling 2026-08-18, after every paid event on production refused to
  // sell behind a message that named a field this codebase does not have, with
  // an enabled gold checkout button sitting directly underneath it. Pins three
  // things: a sale-gate read may not discard its error, a checkout control must
  // be disarmed by the refusal rather than accompanied by it, and sellability is
  // decided in one place. Prints its scan counts and its reviewed baseline on
  // every run, and fails if a baseline entry stops matching, so it cannot pass
  // vacuously or rot into an unexamined allowlist.
  'scripts/guards/one-sellability-source.mjs',
  // Founder ruling 2026-08-18, after an organiser typed 12:00 pm and the page
  // showed 2:00 am. A zoneless datetime-local value read through new Date() takes
  // the offset of whatever runtime evaluates it, so every edit moved the event
  // one offset earlier, and a create was only accidentally right when the browser
  // zone happened to match the event zone. This guard binds to the actual inputs
  // rather than guessing at field names, which is how it found two further
  // instances of the same defect in surfaces nobody had reported.
  'scripts/guards/zoned-event-times.mjs',
  // Founder ruling 2026-08-18, after an organiser saved an edit and the public
  // page did not change. Five of the seven event mutations invalidated nothing
  // at all, and a sixth invalidated only the organiser own pricing screen, so a
  // price change was visible to the person who made it and to no buyer. A
  // dashboard-only revalidation therefore does NOT satisfy this guard.
  'scripts/guards/mutation-revalidates.mjs',
  // Founder ruling 2026-08-18: every gate that reads a set of fields must be
  // unable to run on an incomplete set. Twice in one week a query narrowed while
  // the gate went on reading, the missing field arrived undefined, and undefined
  // refuses at a boolean test exactly as false does. It reads each gate required
  // list out of its own signature rather than duplicating it, follows the entry
  // points a caller actually uses rather than only direct calls, and refuses a
  // bare cast at the boundary.
  'scripts/guards/gate-fields-complete.mjs',
  // Founder task 2026-08-18: "a refund that succeeds at Stripe but fails to
  // restore inventory must be impossible to ship." It was possible, and it
  // shipped. A refund created outside the app (the Stripe dashboard shape) had no
  // refunds row, so reconcile_refund had nothing to attach to and the handler fell
  // through to a door-safety void that returned no seats and left the order on
  // `confirmed`. Reproduced with a real test-mode refund: money back, ticket dead,
  // sold_count still 1. Every party saw a correct outcome, which is why it could
  // have run for months. This pins the structure that makes it impossible: one
  // inventory path, an adopted orphan, a refusal that stops a double-restore, and
  // exactly one sanctioned void.
  'scripts/guards/refund-restores-inventory.mjs',
  'scripts/guards/one-refund-path.mjs',
  'scripts/guards/no-ambiguous-embed.mjs',
  // Measured 2026-08-19 against the real TEST database: 50 simultaneous buyers
  // against ONE seat, live create_reservation -> 1 won. Same body with FOR UPDATE
  // removed -> 16 won, 16 claimed against a capacity of 1. Fifteen people turned
  // away at the door. The row lock IS the protection, so a refactor that drops it
  // ships a platform that passes every existing test and oversells under load.
  // This pins the lock, the availability arithmetic, the already-confirmed latch,
  // and the rule that the counters have exactly one owner.
  'scripts/guards/inventory-lock-integrity.mjs',
  'scripts/guards/no-unowned-organisation-read.mjs',
  // A founder-locked DESIGN law with no gate until 2026-09-02, which is how it
  // survived being written down twice. "Surfaces are solid and opaque. No
  // glassmorphism anywhere: no backdrop-filter / backdrop-blur chrome" is in the
  // Design system, and glassmorphism is in Motion's forbidden list beside GSAP
  // and bento grids. The site header had already been de-frosted for legibility
  // and its comment says so. `src/components/ui/glass-card.tsx` still carried
  // backdrop-blur-2xl on a variant two live surfaces render, plus backdrop-blur-md
  // on a variant nothing used, and a launch readiness audit found it by reading.
  // Translucency without a filter stays legal, so this only fails on an APPLIED
  // filter, never on a /95 badge, a comment, or an inert transition property list.
  'scripts/guards/no-glassmorphism.mjs',
  // Scope v5 3.11, 3 September 2026. The livestream link was captured by the
  // organiser form, stored on the anon-readable events row, and shown to nobody.
  // Migration 20260903000002 moved it into a vault table with no anon grant.
  // This holds the two properties that make the reveal rule true: the inert
  // column is read by nothing, and no public surface can import the modules
  // that hand the link back. Proven red against `{event.virtual_url}` on the
  // public event page and green after its removal (C:\dev\EVIDENCE\A2).
  'scripts/guards/stream-link-never-public.mjs',
  // 4 September 2026. The A2 code SELECTS ticket_tiers.access_mode by name on
  // the bearer ticket page and the order confirmation, and production did not
  // have the column (the migration is the founder's push). None of lint,
  // typecheck, build or the suite reads a database, so a merge before the push
  // would have passed every gate and 500'd every ticket page on the live site.
  // This probes the build's own database, read only, and refuses a build whose
  // schema is behind its code. Proven red against production and green against
  // TEST on the same day (C:\dev\EVIDENCE\A2\guard-schema-ahead-proof.txt).
  'scripts/guards/schema-ahead-of-code.mjs',
]

/**
 * A registered guard that does not exist is a silent hole: `spawnSync` on a
 * missing file yields a non-zero status that reads like an ordinary guard
 * failure, and a typo'd path would report as "the guard failed" rather than
 * "the guard is not there". Checked up front so the two cannot be confused.
 */
const missing = GUARDS.filter((g) => !existsSync(join(ROOT, g)))
if (missing.length > 0) {
  console.error('\n[guards] FAILED before running anything.\n')
  for (const g of missing) console.error(`    registered but not on disk: ${g}`)
  console.error('\n    Fix the path in scripts/guards/run-guards.mjs, or restore the guard.\n')
  process.exit(1)
}

/** The Node major CI installs, from the one file that defines it. */
function contractMajor() {
  const file = join(ROOT, '.nvmrc')
  if (!existsSync(file)) return null
  const major = Number.parseInt(readFileSync(file, 'utf8').trim().replace(/^v/, ''), 10)
  return Number.isInteger(major) ? major : null
}

const CONTRACT = contractMajor()
const RUNNING = Number.parseInt(process.versions.node.split('.')[0], 10)
const CI_EQUIVALENT = CONTRACT !== null && RUNNING === CONTRACT

let failed = 0

for (const guard of GUARDS) {
  // env: gitEnv() SEVERS THE INCIDENT CLASS AT THE ROOT rather than at the leaves.
  // This one line fans an environment out to every registered guard, three of
  // which shell out to git. Clearing GIT_ here means a guard added tomorrow is
  // safe without its author knowing the rule, which is the only kind of safety
  // that survives. The per-guard clearing stays as well: this is the belt, that
  // is the braces, and neither is load-bearing alone.
  const result = spawnSync(process.execPath, [join(ROOT, guard)], {
    stdio: 'inherit',
    env: gitEnv(),
  })
  if (result.status !== 0) failed += 1
}

const runtime = CI_EQUIVALENT
  ? `Node ${process.versions.node} (CI-EQUIVALENT: matches the .nvmrc contract of ${CONTRACT})`
  : `Node ${process.versions.node} (NOT CI-EQUIVALENT: .nvmrc pins ${CONTRACT}, CI runs that, this is ${RUNNING})`

if (failed > 0) {
  console.error(`\n[guards] ${failed} of ${GUARDS.length} guard(s) FAILED. Build blocked.`)
  console.error(`[guards] runtime: ${runtime}\n`)
  process.exit(1)
}

console.log(`\n[guards] all ${GUARDS.length} guards PASS.`)
console.log(`[guards] runtime: ${runtime}`)
if (!CI_EQUIVALENT) {
  console.log(
    `[guards] this PASS is NOT proof CI is green. Reproduce CI's runtime with:\n` +
      `[guards]   npm run guards:contract-node\n`,
  )
} else {
  console.log('')
}
