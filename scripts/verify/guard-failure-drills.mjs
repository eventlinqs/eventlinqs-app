/**
 * GUARD FAILURE DRILLS.
 *
 * "A guard never seen to fail is not a guard." This harness introduces each
 * violation the guards exist to catch, runs the guard, asserts it exits
 * non-zero with the expected reason, and restores the file - every time, on
 * demand, rather than once by hand in a session nobody can replay.
 *
 * Every drill is a real regression that has actually happened or is one edit
 * away:
 *   - an ungated <GoogleButton />                 the 2026-08-02 production defect
 *   - a provider button in an unregistered file   a new provider added carelessly
 *   - an optional gate prop                       a refactor weakening the contract
 *   - a page that never resolves provider state   a new auth page copied wrongly
 *   - auth.resetPasswordForEmail() returning      the "Error sending recovery email" defect
 *   - a sender address literal                    the five-file domain sprawl
 *   - autocomplete="email" on a sign-in field     the "Chrome offered nothing" defect
 *   - a missing name attribute                    same defect, other half
 *
 * Files are restored in a `finally`, and the harness re-verifies a clean pass
 * at the end, so an interrupted run cannot leave a mutated tree behind.
 *
 * Usage: node scripts/verify/guard-failure-drills.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const GUARDS = 'scripts/guards'

/*
 * THE EFFECTIVE MIGRATION. A guard reads the LAST migration that defines a
 * function, so a drill has to mutate that same file. A drill pinned to a
 * superseded definition verifies nothing while still looking green, which is why
 * this is computed rather than written down.
 *
 * DERIVED, NOT PINNED, since 2026-08-20. Naming the file once was an improvement
 * on naming it four times, but it still had to be edited by hand every time a
 * function was redefined, and on 20 August it was not: 20260820000001 and
 * 20260820000003 redefined reconcile_refund and these constants still pointed at
 * 20260819000004. Three drills went on reporting green while mutating a
 * superseded definition, which is the precise failure this harness exists to
 * catch, occurring inside the harness itself.
 *
 * The effective definition is now computed the same way the guards compute it -
 * the LAST migration in version order that defines the function - so a new
 * migration cannot leave a drill pointing at a dead target.
 */
function effectiveDefinitionOf(fnName) {
  const dir = 'supabase/migrations'
  const re = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${fnName}\\s*\\(`, 'i')
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => re.test(readFileSync(join(dir, f), 'utf8')))
  if (hits.length === 0) throw new Error(`no migration defines ${fnName}; the drill harness cannot aim`)
  return `${dir}/${hits[hits.length - 1]}`
}

const NEW_EFFECTIVE_CONFIRM = effectiveDefinitionOf('confirm_order')
const NEW_EFFECTIVE_RECONCILE = effectiveDefinitionOf('reconcile_refund')
console.log(`[drills] effective confirm_order:   ${NEW_EFFECTIVE_CONFIRM}`)
console.log(`[drills] effective reconcile_refund: ${NEW_EFFECTIVE_RECONCILE}`)

const DRILLS = [
  /*
   * maintained-aggregates, three drills.
   *
   * The class: a number written down in a second place with nothing keeping it
   * in step. Four instances landed in one week, in four different mechanisms
   * (a cached rail, a cached file, a held-seat count, an addon count), and none
   * failed a test because in every case the code was correct.
   */
  {
    name: 'a cache tag is declared and nothing anywhere invalidates it',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/redis/inventory-cache.ts',
    find: '  revalidateTag(INVENTORY_CACHE_TAG, { expire: 0 })',
    replace: '  void INVENTORY_CACHE_TAG',
    expect: 'nothing anywhere calls revalidateTag',
  },
  {
    name: 'a new stored counter is incremented with no registry entry',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/payments/connect-ledger.ts',
    find: '    total_volume_cents: (orgRow.total_volume_cents as number) + params.grossRevenueCents,',
    replace:
      '    total_volume_cents: (orgRow.total_volume_cents as number) + params.grossRevenueCents,\n    lifetime_refund_cents: (orgRow.lifetime_refund_cents as number) + 1,',
    expect: 'is not in AGGREGATE_REGISTRY',
  },
  {
    /*
     * FOUNDER RULING 25 August 2026: "a guard that FAILS THE BUILD when a new
     * stored aggregate is added without a maintainer. Drill it by adding one."
     *
     * This is that drill, and it adds one the way it actually happens: a column
     * appears in the schema, and nothing has been written to touch it yet. Both
     * of the real instances arrived exactly like this. event_addons.sold_count
     * and tier_access_codes.current_uses each existed for months with no writer
     * at all, so a detector that looks for WRITES saw nothing while a checkout
     * enforced a cap against each of them.
     */
    name: 'a new stored aggregate column is added and nothing maintains it',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/types/database.ts',
    find: '          sold_count: number\n          sort_order: number',
    replace: '          refunded_count: number\n          sold_count: number\n          sort_order: number',
    expect: 'carries no verdict in scripts/lib/stored-aggregates.mjs',
  },
  {
    /*
     * The reverse rot. A registry that can point at nothing is worse than no
     * registry, because it reads as coverage.
     *
     * It ADDS a bogus entry rather than renaming a real one, and that is not
     * fussiness: renaming `tickets.scan_count` leaves the real column with no
     * verdict, so check 3's "carries no verdict" fires FIRST and the drill would
     * pass while proving the wrong thing. Caught on the first run of this drill.
     */
    name: 'the registry points at a column that does not exist',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'scripts/lib/stored-aggregates.mjs',
    find: "    column: 'tickets.scan_count',",
    replace: [
      "    column: 'ticket_tiers.ghost_count',",
      '    summarises: null,',
      "    maintenance: 'not-in-class',",
      "    maintainedBy: 'nothing at all, this entry is a drill',",
      '    reconciled: false,',
      '    caveat: null,',
      "    decision: 'drill',",
      '  },',
      '  {',
      "    column: 'tickets.scan_count',",
    ].join('\n'),
    expect: 'which does not exist in src/types/database.ts',
  },
  {
    name: 'a tag exemption is left behind after its cache is deleted',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/images/suburb-photo.ts',
    find: "tags: ['pexels', 'pexels-suburb']",
    replace: "tags: ['pexels']",
    expect: "is no longer declared anywhere",
  },
  /*
   * no-silent-catch, two drills.
   *
   * The class: an error from outside the process, discarded, with the code
   * carrying on as though the call had succeeded and returned nothing. The
   * instance was a 42703 on venues.slug inside a bare catch {} in
   * src/app/sitemap.ts, which published zero venue URLs from the day it was
   * written. Nothing failed. The sitemap was simply shorter than it should
   * have been, and no gate in this repository could see it.
   */
  {
    /*
     * The incident itself, put back. This is the exact file and the exact
     * shape: a Supabase query in a try, and a catch that says nothing.
     */
    name: 'the sitemap event query is wrapped in a catch that says nothing',
    guard: `${GUARDS}/no-silent-catch.mjs`,
    file: 'src/app/sitemap.ts',
    find: [
      '  } catch (err) {',
      '    // Sitemap must never 500. Fall through to the static entries already built,',
      '    // but SAY SO: a silent catch on this exact shape hid a 42703 in the venue',
      '    // block for the whole life of that block.',
      "    console.error('[sitemap] event block failed:', err)",
    ].join('\n'),
    // The FIRST version of this drill removed only the binding and left the
    // console.error, and the guard passed, correctly: a catch that logs is not
    // silent whatever its binding says. The drill has to remove the voice, not
    // the name.
    replace: ['  } catch {', '    // drill: the voice removed'].join('\n'),
    expect: 'silent around I/O',
  },
  {
    /*
     * The same shape on a compliance path. recordOrganiserMarketingConsent
     * returns false either way, so a swallowed write failure is indistinguishable
     * from a consent that was recorded and then declined.
     */
    name: 'a consent write failure is swallowed and reported to nobody',
    guard: `${GUARDS}/no-silent-catch.mjs`,
    file: 'src/lib/consent/record.ts',
    find: [
      '  } catch (error) {',
      "    captureException(error, { where: 'lib/consent/record:56' })",
      '    return false',
    ].join('\n'),
    replace: ['  } catch {', '    return false'].join('\n'),
    expect: 'silent around I/O',
  },
  /*
   * no-client-sentry-import, one drill.
   *
   * The class: a client component reaching @sentry/nextjs through a value
   * import, which puts the whole SDK in the browser bundle. It has happened
   * once already, through the four error boundaries, and client-error-report.ts
   * was built to break the edge. The silent-catch sweep then very nearly
   * rebuilt it in src/lib/launch/bill-ref.ts, which THE BILL imports.
   */
  {
    name: 'a module a client component imports starts importing the Sentry SDK',
    guard: `${GUARDS}/no-client-sentry-import.mjs`,
    file: 'src/lib/launch/bill-ref.ts',
    find: "import { KIT_CODE_LENGTH, isKitCode } from './kit-code'",
    replace: [
      "import { KIT_CODE_LENGTH, isKitCode } from './kit-code'",
      "import { captureException } from '@/lib/observability/sentry'",
      'void captureException',
    ].join('\n'),
    expect: 'reach the Sentry SDK',
  },
  /*
   * steps-declare-work, two drills.
   *
   * The class: a step that claims work and never says how much. A CI step named
   * "Warm ISR + the next/image optimiser" warmed no images at all, for weeks,
   * printing a tidy list of 200s the whole time. Its replacement reported 40
   * variants across four pages, which was the cap printed as though it were the
   * finding.
   */
  {
    name: 'a CI step stops declaring how much work it did',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/ci/warm-preview.mjs',
    find: "  declareWork('warm', {",
    replace: "  const declaredNothing = () => {} // drill\n  declaredNothing('warm', {",
    expect: 'claim work without declaring how much',
  },
  {
    /*
     * The reverse rot, matching the shape used for the aggregate registry: an
     * exemption outliving the step it excused. An allowlist nobody prunes is an
     * allowlist nobody reads, and this one carries the reason each entry is
     * there, so a stale entry is a reason for something that no longer happens.
     */
    /*
     * Check 2, the other half. A guard is the same shape of claim as a CI step
     * and fails the same way: `[x] PASS` on a run that scanned nothing reads
     * exactly like `[x] PASS` on a run that scanned everything, which is how a
     * guard keeps passing after its walk stops finding files.
     */
    name: 'a registered guard stops printing how much it scanned',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/guards/no-ambiguous-embed.mjs',
    find: "declareWork('no-ambiguous-embed', {",
    replace: "const noTally = () => {} // drill\nnoTally('no-ambiguous-embed', {",
    expect: 'without printing how much they scanned',
  },
  {
    name: 'an exemption is left behind after CI stops running that script',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/guards/steps-declare-work.mjs',
    find: "    script: 'scripts/check-types-drift.sh',",
    replace: "    script: 'scripts/no-such-step.mjs',",
    expect: 'no CI step invokes any more',
  },
  /*
   * one-fee-copy: the PLURAL. The rule matched "processing fee" and the
   * organiser's revenue summary said "Processing fees"; the trailing s satisfied
   * the word-boundary lookahead and a second fee sat on a product surface for
   * three weeks (found on the C1 drive, 5 September 2026).
   */
  {
    name: 'a second fee is named in the plural on an organiser surface',
    guard: `${GUARDS}/one-fee-copy.mjs`,
    file: 'src/components/orders/revenue-summary.tsx',
    find: '<span className="text-sm text-ink-400">Platform fee</span>',
    replace: '<span className="text-sm text-ink-400">Processing fees</span>',
    expect: 'describe a fee the platform does not charge',
  },
  /*
   * no-banned-word-anywhere, two drills, one per blind spot the copy gate had.
   */
  {
    name: 'the banned word is planted in a STORAGE PATH',
    guard: `${GUARDS}/no-banned-word-anywhere.mjs`,
    file: 'src/lib/images/city-photo.ts',
    find: 'export',
    replace: [
      "const DRILL_PATH = 'stock/categories/arts-cult" + "ure/theatre.avif'",
      'void DRILL_PATH',
      'export',
    ].join('\n'),
    expect: 'with no reviewed exemption',
  },
  {
    name: 'the banned word is planted in a STRING COMPARISON',
    guard: `${GUARDS}/no-banned-word-anywhere.mjs`,
    file: 'src/lib/images/community-photo.ts',
    find: 'export',
    replace: [
      "const DRILL_SLUG = (s: string) => s === 'arts-cult" + "ure'",
      'void DRILL_SLUG',
      'export',
    ].join('\n'),
    expect: 'with no reviewed exemption',
  },
  /*
   * sitemap-resolves, four drills, one per check, because all four of these
   * failures were live in src/app/sitemap.ts at the same time on 25 August 2026
   * and every gate in the repository was green.
   *
   * The measurement that produced them: a sweep of all 586 URLs the PRODUCTION
   * sitemap published returned 48 hard 404s, and a per-slug drive of the
   * /categories namespace returned six 308s beside one 200. Both are in the
   * guard's header.
   */
  {
    name: 'the sitemap queries a column that does not exist (the 42703 class)',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: "      .select('venue_name, updated_at')",
    replace: "      .select('venue_name, updated_at, nonexistent_column')",
    expect: 'does not exist in src/types/database.ts',
  },
  {
    name: 'the sitemap publishes a URL this repository permanently redirects',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '      url: `${baseUrl}/pricing`,',
    replace: '      url: `${baseUrl}/cultures`,',
    expect: 'which permanent-redirects.ts redirects away',
  },
  {
    name: 'the sitemap templates over a redirected namespace without consulting the table',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '    if (isRedirected(path)) continue',
    replace: '    if (false) continue',
    expect: 'never calls isRedirected()',
  },
  {
    name: 'the sitemap publishes a URL shape with no route behind it',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '      url: `${baseUrl}/pricing`,',
    replace: '      url: `${baseUrl}/pricing-plans`,',
    expect: 'no App Router page matches it',
  },
  {
    name: 'a sitemap catch block swallows its error without reporting it',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: "    console.error('[sitemap] organiser block failed:', err)",
    replace: '    void err',
    expect: 'catch block that reports nothing',
  },
  /*
   * one-db-connection-source, four drills, one per banned shape.
   *
   * These exist because the guard they exercise was written after two hours were
   * lost to a 28P01 that nine private copies of the connection parser made
   * impossible to locate. A guard that cannot be shown to FAIL is a guard nobody
   * can trust to be doing anything, and this one's whole value is that it refuses
   * the tenth copy. Each drill reintroduces exactly one of the shapes that were
   * removed, into a file that currently passes.
   */
  /*
   * one-visibility-source, two drills, one per rule.
   *
   * Rule 1 reintroduces the hand-written publication predicate into a discovery
   * surface, which is the shape that let /events print a correct count of 2
   * beside a rail of 8 deleted events. Rule 2 declares a cached read carrying a
   * tag nothing invalidates, which is how those 8 survived the delete.
   */
  {
    /*
     * The defect that produced this rule: every organiser profile page returned
     * 404 to anonymous visitors for weeks, while /sitemap.xml advertised 38 of
     * those URLs to Google. The page selected only granted columns, which the
     * guard checked and approved, and then FILTERED on `status`, which anon
     * cannot select. Postgres refuses the whole query. Checking the select list
     * alone was checking half the query.
     */
    name: 'an anon query filters on a column revoked from anon',
    guard: 'scripts/security/revoked-column-reads.mjs',
    file: 'src/app/organisers/[handle]/page.tsx',
    find: "    .eq('id', row.id)",
    replace: "    .eq('id', row.id)\n    .eq('status', 'active')",
    expect: 'revoked',
  },
  {
    name: 'a discovery surface spells out the publication predicate again',
    guard: `${GUARDS}/one-visibility-source.mjs`,
    file: 'src/lib/events/home-queries.ts',
    find: '.match(PUBLIC_EVENT_MATCH)',
    replace: ".eq('status', 'published')\n    .eq('visibility', 'public')",
    expect: 'spells out the publication',
  },
  {
    name: 'a cached read declares a tag nothing invalidates',
    guard: `${GUARDS}/one-visibility-source.mjs`,
    file: 'src/lib/events/fetchers.ts',
    find: 'tags: [EVENT_DATA_CACHE_TAGS[1]]',
    replace: "revalidate: 1800, tags: ['events:orphan-cache']",
    expect: 'nothing invalidates',
  },
  {
    name: 'a script hands pg a connectionString again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const db = new pg.Client({ connectionString: "postgresql://x" })',
    expect: 'connectionString',
  },
  {
    name: 'a script reads SUPABASE_DB_URL out of the environment again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const raw = process.env.SUPABASE_DB_URL\nconst db = await target.connect()',
    expect: 'direct env read',
  },
  {
    name: 'a script parses the database URL with new URL() again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const u = new URL(SUPABASE_DB_URL)\nconst db = await target.connect()',
    expect: 'new URL on a database url',
  },
  {
    name: 'a script hardcodes the pooler host again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace:
      'const db = new pg.Client({ host: "aws-1-ap-southeast-2.pooler.supabase.com", port: 5432 })',
    expect: 'hardcoded supabase host',
  },
  {
    /*
     * RULE 2 of no-unowned-organisation-read. The check that matters most and the
     * one a lexical guard most easily misses: the publish gate's organisations read
     * lives in publish-gate.ts, so a call site that hands it the service-role client
     * contains no `.from('organisations')` of its own. Deleting the ownership check
     * here must still fail the build, because the service role bypasses RLS and an
     * unchecked call turns an exposure into a cross-tenant read.
     */
    name: 'publish gate handed the service role with no ownership check (createEvent)',
    guard: `${GUARDS}/no-unowned-organisation-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/actions.ts',
    find: "  const authority = await assertCallerMayActForOrganisation(user.id, input.organisationId, 'owner')\n  if (!authority.ok) return { error: 'Organisation not found or access denied' }",
    replace: '  // ownership check removed by the drill',
    expect: 'with no ownership check',
  },
  {
    /*
     * RULE 1: a direct service-role read of the five sale-posture columns in a file
     * that is not a reviewed admission. fetchers.ts is a public discovery module, so
     * a Stripe-posture read appearing there is exactly the shape this guard exists
     * to refuse.
     */
    name: 'service-role read of organisation sale posture in an unadmitted file',
    guard: `${GUARDS}/no-unowned-organisation-read.mjs`,
    file: 'src/lib/events/fetchers.ts',
    find: 'export',
    replace:
      "export async function rogueSalePostureRead(admin, orgId) {\n" +
      "  return admin.from('organisations').select('stripe_account_id, payout_status').eq('id', orgId)\n" +
      '}\nexport',
    expect: 'no ownership check in the same function',
  },
  {
    name: 'ungated provider button (the 2026-08-02 production defect)',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '      {googleEnabled && (\n        <>\n          <GoogleButton label="Continue with Google" />\n          <AuthDivider label="or" />\n        </>\n      )}',
    replace: '      <GoogleButton label="Continue with Google" />\n      <AuthDivider label="or" />',
    expect: 'without the "googleEnabled &&" gate',
  },
  {
    name: 'provider button in an unregistered file',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/auth-divider.tsx',
    find: 'export function AuthDivider',
    replace:
      'export function rogue() { return supabase.auth.signInWithOAuth({ provider: "apple" }) }\nexport function AuthDivider',
    expect: 'is not a registered provider button',
  },
  {
    name: 'gate prop weakened to optional',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/signup-form.tsx',
    find: '  googleEnabled: boolean',
    replace: '  googleEnabled?: boolean',
    expect: 'as OPTIONAL',
  },
  {
    name: 'page renders a gated form without resolving provider state',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/app/(auth)/login/page.tsx',
    find: "  const googleEnabled = await isProviderEnabled('google')",
    replace: '  const googleEnabled = true',
    expect: 'never calls isProviderEnabled()',
  },
  {
    name: 'password reset back on Supabase SMTP (the recovery-email defect)',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/forgot-password-form.tsx',
    find: "      const res = await fetch('/api/auth/recover', {",
    replace:
      "      await supabase.auth.resetPasswordForEmail(email)\n      const res = await fetch('/api/auth/recover', {",
    expect: 'auth.resetPasswordForEmail()',
  },
  {
    name: 'magic link back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "      const res = await fetch('/api/auth/magic-link', {",
    replace:
      "      await supabase.auth.signInWithOtp({ email })\n      const res = await fetch('/api/auth/magic-link', {",
    expect: 'auth.signInWithOtp()',
  },
  {
    name: 'verification resend back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "      const res = await fetch('/api/auth/magic-link', {",
    replace:
      "      await supabase.auth.resend({ type: 'signup', email })\n      const res = await fetch('/api/auth/magic-link', {",
    expect: 'auth.resend()',
  },
  {
    name: 'admin invite back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/lib/auth/dispatch-auth-link.ts',
    find: '      ? await admin.auth.admin.generateLink({',
    replace:
      '      ? await admin.auth.admin.inviteUserByEmail(email) ?? await admin.auth.admin.generateLink({',
    expect: 'auth.admin.inviteUserByEmail()',
  },
  {
    name: 'provider registries disagree (runtime knows a provider the guard does not)',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/lib/auth/providers.ts',
    find: "export const RENDERABLE_PROVIDERS = ['google'] as const",
    replace: "export const RENDERABLE_PROVIDERS = ['google', 'apple'] as const",
    expect: 'provider registries disagree',
  },
  {
    name: 'sender address literal reintroduced',
    guard: `${GUARDS}/sender-single-source.mjs`,
    file: 'src/lib/waitlist/promote.ts',
    find: '        from: getNoReplyFrom(),',
    replace: "        from: 'EventLinqs <noreply@eventlinqs.com>',",
    expect: 'a literal sender address on a from/replyTo property',
  },
  {
    name: 'sender address hidden in a FROM constant',
    guard: `${GUARDS}/sender-single-source.mjs`,
    file: 'src/lib/waitlist/promote.ts',
    find: '        from: getNoReplyFrom(),',
    // The guard is a text scanner, so the intermediate need not compile; the
    // harness restores the file in a `finally` either way.
    replace:
      "        const MAIL_FROM = 'EventLinqs <noreply@eventlinqs.com>'\n        from: MAIL_FROM,",
    expect: 'a literal sender address assigned to a FROM constant',
  },
  {
    name: 'sign-in email field reverted to autocomplete="email"',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '            autoComplete="username"',
    replace: '            autoComplete="email"',
    expect: 'must carry autoComplete="username"',
  },
  {
    name: 'name attribute dropped from the sign-in password field',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '            name="password"\n',
    replace: '',
    expect: 'must carry a stable name="password"',
  },
  {
    name: 'hidden username field removed from the reset form',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/reset-password-form.tsx',
    find: '        id="username"',
    replace: '        id="username-removed-by-drill"',
    expect: 'no <input id="username"> found',
  },

  // -------------------------------------------------------------------------
  // node-version-contract. Every check, because the FIRST draft of this guard
  // could not fail at all: it scanned the string-blanked source view for a
  // module specifier, which is itself a string, so the pattern never matched
  // and it reported PASS on the very defect it was written for. These drills
  // are what caught that, and they are why each check now has one.
  // -------------------------------------------------------------------------
  {
    /*
     * REMOVED, not future. This drill used to import `globSync` from node:fs,
     * chosen when .nvmrc pinned Node 20 because globSync landed in 22. The
     * contract moved to 24 on 2026-08-13, Node 24 exports globSync, the guard
     * correctly stopped objecting, and the drill quietly stopped testing
     * anything: it reported "guard PASSED on a violating tree" because the tree
     * was no longer violating.
     *
     * The lesson is in the choice of API, not the wiring. A drill built on a
     * FUTURE addition rots the moment the contract catches up. A drill built on
     * a REMOVED export can never rot, because a removal is permanent. fs.F_OK
     * was removed in Node 24 (it lives on fs.constants now) and is absent from
     * the generated surface record, verified rather than assumed.
     */
    name: 'a named import Node 24 REMOVED (fs.F_OK, gone since 24)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { F_OK } from 'node:fs'\nimport { join } from 'node:path'",
    expect: "imports { F_OK } from 'node:fs'",
  },
  {
    name: 'a built-in module that does not exist in Node 20 (node:sqlite)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { DatabaseSync } from 'node:sqlite'\nimport { join } from 'node:path'",
    expect: "imports 'node:sqlite', which does not exist",
  },
  {
    // Same reasoning as the F_OK drill: a REMOVED export cannot come back, so this
    // cannot go stale when the contract moves again. util.isDate went with the
    // whole util.is* family in Node 24. Note util.isArray is STILL exported, so the
    // family was not removed wholesale and picking the wrong member would have
    // produced another silently-passing drill.
    name: 'a named import from the util.is* family Node 24 removed (util.isDate)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { isDate } from 'node:util'\nimport { join } from 'node:path'",
    expect: "imports { isDate } from 'node:util'",
  },
  // NO PROTOTYPE-METHOD DRILL, deliberately, and this comment is the record of why.
  // node-version-contract's POST_CONTRACT_PROTOTYPE_METHODS list is EMPTY on the
  // Node 24 contract (founder ruling 2026-08-13): every entry it used to hold was a
  // Node 22 addition that Node 24 actually ships, so keeping them would have failed
  // builds over APIs the runtime has. An empty list is a working check with nothing
  // to report, so no drill can make it fire without first adding a fake entry to the
  // guard, which would fail the build for everyone. The check is therefore
  // UNEXERCISED until Node 26 adds a prototype method and an entry goes in; the drill
  // belongs here on that day. Removing this drill rather than leaving it red is the
  // honest option: it was reporting a guard defect that does not exist.
  {
    /*
     * The anchor was `node-version: 20`, written when .nvmrc pinned 20. The contract
     * moved to 24 on 2026-08-13 and every workflow pin moved with it, so the anchor
     * matched nothing and the harness reported "anchor text not found. The drill is
     * stale" rather than a guard defect. That is the harness distinguishing a broken
     * DRILL from a broken GUARD, which is worth more than either report alone.
     *
     * Anchored on 24 now. If the contract moves again this drill goes stale in the
     * same visible way, which is acceptable: unlike the API drills above there is no
     * version-independent way to express "one lower than the contract" in a static
     * find/replace, and a loudly stale drill is not a silently passing one.
     */
    name: 'a workflow pinned BELOW the .nvmrc contract',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: '.github/workflows/lighthouse.yml',
    find: 'node-version: 24',
    replace: 'node-version: 22',
    expect: 'below the .nvmrc contract',
  },

  // -------------------------------------------------------------------------
  // auth-provider-cost-guard. The reverse direction of auth-provider-guard:
  // every gate call must be on a route that renders a button. Each of the four
  // checks gets a drill, because a cost guard that cannot fail is worse than
  // none: it reads as proof that the cost is contained while containing nothing.
  // -------------------------------------------------------------------------
  {
    name: 'provider gate resolved on a page that renders no provider button',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/(auth)/forgot-password/page.tsx',
    find: 'export default function ForgotPasswordPage() {',
    replace:
      "import { isProviderEnabled } from '@/lib/auth/providers'\n" +
      'export default async function ForgotPasswordPage() {\n' +
      "  await isProviderEnabled('google')",
    expect: 'renders no',
  },
  {
    name: 'provider gate reached from the root layout (every route pays)',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/layout.tsx',
    find: "import { getSiteUrl } from '@/lib/site-url'",
    replace:
      "import { getSiteUrl } from '@/lib/site-url'\nimport { getEnabledProviders } from '@/lib/auth/providers'",
    expect: 'reaches the provider resolver',
  },
  {
    name: 'provider resolver pulled into a Client Component',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "import { GoogleButton } from './google-button'",
    replace:
      "import { GoogleButton } from './google-button'\n" +
      "import { isProviderEnabled } from '@/lib/auth/providers'",
    expect: 'is a Client Component and imports',
  },
  {
    name: 'the gate hardcoded to true at the call site (fail-safe defeated)',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/(auth)/login/page.tsx',
    find: '<LoginForm googleEnabled={googleEnabled} />',
    replace: '<LoginForm googleEnabled={true} />',
    expect: 'hardcodes "googleEnabled" to true',
  },

  // -------------------------------------------------------------------------
  // check-client-barrel-imports, from PR #111. Drilled HERE, through the same
  // harness as every other guard, because the rebase that merged the two build
  // chains is exactly when a guard goes quietly missing. It has its own drill
  // harness (scripts/verify/client-barrel-drills.mjs) which is kept and still
  // run; this single drill is the tripwire that proves the guard is still
  // REGISTERED and still fires from the shared runner's list.
  // -------------------------------------------------------------------------
  {
    name: 'a third-party namespace import back in client-reachable code (#111)',
    guard: 'scripts/check-client-barrel-imports.mjs',
    file: 'src/lib/observability/client-error-report.ts',
    find: 'type ClientErrorReport = {',
    replace: "import * as Sentry from '@sentry/nextjs'\ntype ClientErrorReport = {",
    // The guard prints the KIND and the SPECIFIER, not the source line, so the
    // expected text is its report format rather than the code that caused it.
    expect: "import * as '@sentry/nextjs'",
  },

  // -------------------------------------------------------------------------
  // REFUND INVENTORY (the 2026-08-18 leak). A refund that succeeds at Stripe and
  // does not return the seat is invisible to everybody: the buyer is refunded,
  // the ticket stops admitting, and the tier quietly keeps counting the seat as
  // sold. Reproduced with a real test-mode refund by
  // scripts/verify/refund-orphan-inventory-drill.mjs. These five drills are the
  // five ways back into it.
  // -------------------------------------------------------------------------
  {
    name: 'reconcile_refund stops returning inventory (the leak itself)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: 'GREATEST(0, tt.sold_count - sub.cnt)',
    replace: 'tt.sold_count',
    expect: 'no longer returns inventory',
  },
  {
    name: 'the ::public.order_status cast dropped again (the 20260621000002 defect)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: "END)::public.order_status",
    replace: 'END)',
    expect: 'casts the order status',
  },
  {
    name: 'an out-of-app refund no longer adopted (straight to the door-safety void)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: 'const adopted = await adoptOrphanRefund(adminClient, charge, r)',
    replace: 'const adopted = false',
    expect: 'no longer adopts an unmatched refund',
  },
  {
    name: 'a second ticket-void path appears (the leak returning under a new name)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '  let matchedAnyRow = false',
    replace: "  let matchedAnyRow = false\n  const rogueVoid = { status: 'void' }\n  void rogueVoid",
    expect: 'void a ticket',
  },
  {
    name: 'adoption stops refusing an in-app refund (would double-restore the seat)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '  const inAppRefundId = (stripeRefund.metadata as { refund_id?: string } | null | undefined)?.refund_id',
    replace: '  const inAppRefundId: string | undefined = undefined',
    expect: 'refuses a refund carrying metadata.refund_id',
  },

  // -------------------------------------------------------------------------
  // OVERSELL (measured 2026-08-19). 50 simultaneous buyers against one seat:
  // with the row lock 1 won, with the lock removed 16 won and 15 people would
  // have been turned away at the door. These drills are the ways back in.
  // -------------------------------------------------------------------------
  {
    name: 'the reservation row lock removed (16 of 50 buyers won one seat without it)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'supabase/migrations/20260704000005_sale_window_enforcement.sql',
    find: '      FOR UPDATE;',
    replace: '      ;',
    expect: 'no longer takes the row lock',
  },
  {
    name: 'availability arithmetic stops subtracting reserved_count',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'supabase/migrations/20260704000005_sale_window_enforcement.sql',
    find: 'tt.total_capacity - tt.sold_count - tt.reserved_count AS available',
    replace: 'tt.total_capacity - tt.sold_count AS available',
    expect: 'computes availability as capacity minus sold minus reserved',
  },
  {
    name: 'reserved_count assigned instead of incremented (loses concurrent reservations)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'supabase/migrations/20260704000005_sale_window_enforcement.sql',
    find: 'SET reserved_count = reserved_count + v_quantity',
    replace: 'SET reserved_count = v_quantity',
    expect: 'increments reserved_count rather than assigning it',
  },
  {
    name: 'the lapsed-hold re-acquire removed (2 tickets for 1 seat, both buyers charged)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_CONFIRM,
    find: '              AND total_capacity - sold_count - reserved_count >= v_quantity;',
    replace: '              ;',
    expect: 're-acquires the seat when the hold has LAPSED',
  },
  {
    name: 'the sold-out refusal removed (would confirm a ticket for somebody else\'s seat)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_CONFIRM,
    find: '            GET DIAGNOSTICS v_taken = ROW_COUNT;',
    replace: '            v_taken := 1;',
    expect: 'REFUSES when the lapsed seat is gone',
  },
  {
    name: 'the confirm whitelist removed (a refunded order confirms into a ticket)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'supabase/migrations/20260819000004_confirm_only_pending_orders.sql',
    find: "  IF v_order.status <> 'pending' THEN",
    replace: "  IF FALSE THEN",
    expect: 'WHITELISTS the statuses it will confirm',
  },
  {
    name: 'the phantom ledger reversal guard removed (debits an organiser for a sale never made)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: '  ) INTO v_sale_recorded;',
    replace: '  ) INTO v_unused_flag;',
    expect: 'does NOT reverse a sale that was never recorded',
  },
  {
    name: 'an application-level write to sold_count (a second owner of the counter)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'src/app/actions/checkout.ts',
    find: "import { createClient } from '@/lib/supabase/server'",
    replace:
      "import { createClient } from '@/lib/supabase/server'\n"
      + 'async function rogueInventoryWrite(db: ReturnType<typeof createAdminClient>, id: string, n: number) {\n'
      + "  return db.from('ticket_tiers').update({ sold_count: n }).eq('id', id)\n"
      + '}\n'
      + 'void rogueInventoryWrite',
    expect: 'application-level write(s) to the inventory counters',
  },

  /*
   * LABELLED FORM CONTROLS. The founder ruling of 28 August 2026: a raw input,
   * select, textarea or checkbox on a form surface fails the build unless it
   * carries a programmatic label.
   *
   * The first drill is the obvious one. The four after it are the ones that
   * matter, and they assert the guard STAYS SILENT, because this guard is far
   * more likely to be switched off for crying wolf than for missing something.
   *
   * That is not hypothetical. On the day it was written, two separate static
   * detectors were run over seat-map-builder.tsx. One reported 20 of 48 controls
   * labelled; the true figure was 9, because it counted aria-labels belonging to
   * BUTTONS. The other reported 39 UNLABELLED; the true figure was 0, because
   * every one of them sits inside a <Field> wrapper that renders
   * <label><span>{label}</span>{children}</label> and is therefore implicitly
   * associated. axe over the running application confirmed zero violations in
   * all eleven states the builder can be driven into.
   *
   * So each legitimate way to name a control gets a drill of its own, and the
   * wrapper case uses the real <Field> that broke both detectors.
   */
  {
    name: 'a raw input is added with nothing naming it',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <input type="text" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
    expect: 'nothing names it',
  },
  {
    name: 'NO FALSE POSITIVE: an input named by aria-label',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'aria-label',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <input type="text" aria-label="Drill field" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  {
    name: 'NO FALSE POSITIVE: an input nested inside its own label',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'ancestor <label>',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <label>Drill field<input type="text" value="" onChange={() => {}} /></label>\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  {
    name: 'NO FALSE POSITIVE: an input paired by htmlFor',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'htmlFor',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <label htmlFor="drill-field">Drill field</label>\n'
      + '        <input id="drill-field" type="text" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  /*
   * A LABEL THAT NAMES THE WRONG CONTROL. Drilled from both sides for the same
   * reason as its sibling: this guard reasons about MEANING, so a false positive
   * is the likelier death. The quiet-side drill uses the real ticket tier group,
   * where a label and two controls legitimately sit together.
   */
  {
    name: 'a label points at an element that cannot be labelled',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    file: 'src/components/waitlist/join-waitlist-modal.tsx',
    find: '<div id="waitlist-quantity-label" className="block text-sm font-medium text-ink-600 mb-1.5">',
    replace: '<label htmlFor="waitlist-quantity" className="block text-sm font-medium text-ink-600 mb-1.5">',
    expect: 'which cannot be labelled',
  },
  {
    name: 'a label names the control BESIDE the one it describes',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    file: 'src/components/features/events/event-form.tsx',
    /*
     * Take the id OFF the price input, which is exactly the shape of the
     * original defect: the "Price" label no longer resolves to the field it
     * describes, while that field still carries its own aria-label saying what
     * it is. An earlier version of this drill ADDED the id to the currency
     * select instead, which produced two elements sharing one id; the guard
     * matched the input and stayed quiet, and the drill proved nothing.
     */
    find: '                  id={`tier-price-${idx}`}\n                  type="number"',
    replace: '                  type="number"',
    expect: 'appears in a sibling',
  },
  {
    name: 'NO FALSE POSITIVE: the ticket tier group as it correctly stands',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    expectPass: 'Every label names the control it describes',
    file: 'src/components/features/events/event-form.tsx',
    find: '                  placeholder="0.00"',
    replace: '                  placeholder="0.00"\n                  inputMode="decimal"',
  },
  {
    name: 'NO FALSE POSITIVE: an input inside the Field wrapper that fooled two greps',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'wrapper <Field>',
    file: 'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/seat-map-builder.tsx',
    find: '        <Field label="Rows">',
    replace:
      '        <Field label="Drill field">\n'
      + '          <input type="number" value={1} onChange={() => {}} />\n'
      + '        </Field>\n'
      + '        <Field label="Rows">',
  },
  /*
   * no-silent-submit, three drills, one per shape the guard decides.
   *
   * The class: a control the user operates that completes with neither a
   * visible result nor a visible error. Journey 8, 29 August 2026.
   */
  {
    /*
     * THE ACTUAL DEFECT, restored. min="0.01" with step="1" means HTML steps
     * 0.01, 1.01, 2.01, ... so a person typing 20 produces a stepMismatch, the
     * browser refuses the submit, and no handler ever runs. Two sessions read
     * the handler and the server action looking for this.
     */
    name: 'a number input whose min and step make every round value unsubmittable',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    // Restores step="1" against the fixed_amount min of 0.01. The FIRST version
    // of this drill restored only the min and left step="any", and the guard
    // correctly stayed quiet: with no numeric step there is no arithmetic to be
    // wrong. The drill has to put back the step, which is where the defect was.
    find: '                step="any"',
    replace: '                step="1"',
    expect: 'stepMismatch',
  },
  {
    /*
     * The refusal read and dropped: the success branch applies and the error
     * branch does not exist. This is what the venue create and update handlers
     * did until 29 August 2026.
     */
    name: 'a server action refusal is read and then dropped on the floor',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/venues/venues-client.tsx',
    find: [
      '        if (result.error) {',
      '          setSaveError(result.error)',
      '          resolve()',
      '          return',
      '        }',
      '        setVenues(prev =>',
    ].join('\n'),
    replace: [
      '        if (!result.error) {',
      '        setVenues(prev =>',
    ].join('\n'),
    expect: 'has no else',
  },
  {
    /*
     * The refusal never read at all: the result is assigned and abandoned, so
     * nothing downstream can surface it.
     */
    name: 'a server action result is assigned and never referenced again',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/components/marketplace/requests-panel.tsx',
    find: [
      '      const result = await respondToRequestAction({ requestId, response })',
      '      if (!result.ok) {',
      "        setRespondError(result.error ?? 'That could not be saved. Try again.')",
      '        return',
      '      }',
    ].join('\n'),
    replace: '      const result = await respondToRequestAction({ requestId, response })',
    expect: 'never referenced again',
  },
  {
    /*
     * THE SAME ARITHMETIC WITH THE STEP LEFT OUT, added 29 August 2026.
     *
     * `step` defaults to 1 on <input type="number"> when the attribute is
     * absent (HTML Standard, the step attribute), so min="0.01" with NO step is
     * bit-for-bit the journey 8 defect. The first version of the guard required
     * BOTH a min and a step literal before it would judge anything, so it would
     * have walked straight past this one. The defect it was written for
     * happened to spell the step out; the next one need not.
     */
    name: 'a number input with a fractional min and NO step, which HTML reads as step=1',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '                step="any"',
    replace: '                data-drill="no-step-attribute"',
    expect: 'NO step attribute',
  },
  {
    /*
     * A RANGE WITH NOTHING IN IT. min > max makes every entry out of range, so
     * checkValidity() is false and the submit never reaches a handler. Same
     * silence as the step defect, different constraint.
     */
    name: 'a number input whose min is greater than its max',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '                step="any"',
    replace: '                step="any"\n                max="0"',
    expect: 'No value satisfies both',
  },
]

function run(guard) {
  const r = spawnSync(process.execPath, [join(ROOT, guard)], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/**
 * Anchors are written with plain newlines, but the working tree on Windows
 * holds CRLF. Matching literally made two drills silently report STALE, which
 * is the exact failure mode this harness exists to prevent: a drill that never
 * runs looks the same as a drill that passes if nobody reads the summary.
 * Matching line-ending agnostically removes the trap.
 */
function anchorRegex(anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replace(/\r?\n/g, '\\r?\\n'))
}

let passed = 0
const failed = []

console.log('\n=== GUARD FAILURE DRILLS ===\n')
console.log('Each drill introduces a real regression, runs the guard, and restores the file.\n')

for (const drill of DRILLS) {
  const path = join(ROOT, drill.file)
  const original = readFileSync(path, 'utf8')

  const anchor = anchorRegex(drill.find)
  if (!anchor.test(original)) {
    failed.push(`${drill.name}: anchor text not found in ${drill.file}. The drill is stale.`)
    console.log(`  STALE  ${drill.name}`)
    continue
  }

  try {
    writeFileSync(path, original.replace(anchor, drill.replace))
    const { code, out } = run(drill.guard)

    /*
     * A drill that asserts the guard STAYS QUIET. Added 28 August 2026 with the
     * labelled-form-controls guard, because for that guard the dangerous
     * failure is the false positive: it fails the build over working markup,
     * somebody switches it off, and the law loses its enforcement entirely.
     * `expectPass` names the mechanism that must have recognised the addition,
     * so a guard that passes for the WRONG reason still fails the drill.
     */
    if (drill.expectPass) {
      if (code !== 0) {
        failed.push(
          `${drill.name}: guard FAILED on legitimate markup. It is crying wolf.\n` +
            `      got: ${out.trim().split('\n').slice(-6).join(' / ')}`,
        )
        console.log(`  FALSE POSITIVE  ${drill.name}`)
        continue
      }
      if (!out.includes(drill.expectPass)) {
        failed.push(
          `${drill.name}: guard passed, but never reported recognising it via ${drill.expectPass}.`,
        )
        console.log(`  PASSED FOR THE WRONG REASON  ${drill.name}`)
        continue
      }
      passed += 1
      console.log(`  STAYS QUIET AS EXPECTED  ${drill.name}`)
      console.log(`      recognised via ${drill.expectPass}\n`)
      continue
    }

    if (code === 0) {
      failed.push(`${drill.name}: guard PASSED on a violating tree. It is not actually guarding.`)
      console.log(`  DID NOT FAIL  ${drill.name}`)
      continue
    }
    if (!out.includes(drill.expect)) {
      failed.push(
        `${drill.name}: guard failed, but not for the expected reason.\n` +
          `      expected to see: ${drill.expect}\n` +
          `      got: ${out.trim().split('\n').slice(0, 4).join(' / ')}`,
      )
      console.log(`  WRONG REASON  ${drill.name}`)
      continue
    }

    passed += 1
    const line = out
      .split('\n')
      .find((l) => l.includes(drill.expect))
      ?.trim()
    console.log(`  FAILS AS EXPECTED  ${drill.name}`)
    console.log(`      exit ${code}: ${line}\n`)
  } finally {
    writeFileSync(path, original)
  }
}

// The tree must be clean again, and every guard green, or the harness itself
// has left damage behind.
console.log('--- restoring and re-verifying a clean tree ---')
const after = run(`${GUARDS}/run-guards.mjs`)
if (after.code !== 0) {
  failed.push('after restoring every drill, the guards do NOT pass. The tree may be dirty.')
  console.log(after.out)
} else {
  console.log('  all guards PASS on the restored tree.')
}

console.log(`\n=== ${passed}/${DRILLS.length} drills fired correctly ===\n`)

if (failed.length > 0) {
  for (const f of failed) console.error(`  PROBLEM: ${f}`)
  process.exit(1)
}
