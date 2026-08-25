/**
 * THE MIGRATION THAT TURNS OFF TICKET SALES IF IT LANDS ALONE.
 *
 * WHAT THIS PROTECTS. Migration 20260808000010 revokes `stripe_account_id` and
 * `stripe_charges_enabled` on `organisations` from the `anon` role. Production's
 * event page reads the organiser's Stripe posture through an ANON embed and
 * feeds it to `isOrganiserSellable`. The moment that migration is applied to a
 * database whose deployed code still does that, both fields read `undefined` for
 * every organiser, the sale gate returns false platform-wide, and EVERY PAID
 * EVENT ON THE LIVE SITE stops selling instantly. It does not error. It renders
 * "This organiser is still finishing their payment setup", which is a real,
 * designed state, so nothing alerts and nothing looks broken.
 *
 * That is not hypothetical: it is exactly what happened on the preview, and it
 * went unnoticed for weeks because the wrong screen is indistinguishable from
 * the right one.
 *
 * WHAT THIS GUARD ASSERTS. If the revoking migration is present in the tree,
 * then the fix must be present too: the event page must NOT derive sellability
 * from the anon embed, and it must read the Stripe posture with a privileged
 * client instead. Both halves are checked, because either one alone is the bug.
 *
 * WHAT IT CANNOT SEE, stated plainly:
 *   - It reads THIS WORKING TREE. It cannot tell you what is deployed, nor which
 *     migrations have actually been applied to any database. A tree that passes
 *     can still be pushed to a project whose live code is older. The ordering
 *     rule for that lives in docs/roast/FOUNDER-RUNBOOK-LAUNCH.md and is a human
 *     procedure with a verification step, not something a build guard can prove.
 *   - It does not check the reservation server action, which has its own copy of
 *     the same gate. That is covered by tests/unit/events/sale-gate-source.test.ts
 *     and by the shared predicate in sale-status.ts.
 *   - It matches on source text. A refactor that renames the page or moves the
 *     gate into a helper will make this guard stop finding what it looks for; it
 *     fails LOUD in that case rather than passing, which is the correct
 *     direction, but it will need updating rather than deleting.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations')
const EVENT_PAGE = path.join(ROOT, 'src', 'app', 'events', '[slug]', 'page.tsx')

/** The migration that removes the two columns from anon. */
const REVOKING_MIGRATION = '20260808000010'
/** The columns whose loss breaks the gate. */
const REVOKED = ['stripe_account_id', 'stripe_charges_enabled']

function fail(lines) {
  console.error('')
  console.error('='.repeat(74))
  console.error('[migration-sale-gate] FAILED')
  console.error('='.repeat(74))
  for (const l of lines) console.error(l)
  console.error('='.repeat(74))
  console.error('')
  process.exit(1)
}

let migrationFile = null
if (existsSync(MIGRATIONS)) {
  migrationFile = readdirSync(MIGRATIONS).find(f => f.startsWith(REVOKING_MIGRATION)) ?? null
}

if (!migrationFile) {
  console.log(
    `[migration-sale-gate] PASS - migration ${REVOKING_MIGRATION} is not in this tree, so the ` +
      'revoke-before-fix hazard does not apply here.',
  )
  process.exit(0)
}

// Confirm the migration really does revoke the columns, rather than trusting the
// number. If somebody renumbers or repurposes it, this guard should say so.
const migrationSql = readFileSync(path.join(MIGRATIONS, migrationFile), 'utf8')
const revokesColumns =
  /revoke/i.test(migrationSql) && REVOKED.some(c => migrationSql.includes(c))

if (!revokesColumns) {
  console.log(
    `[migration-sale-gate] PASS - ${migrationFile} no longer revokes ${REVOKED.join(' / ')} from anon. ` +
      'Nothing to guard. If that is a surprise, this guard is out of date and should be re-read.',
  )
  process.exit(0)
}

if (!existsSync(EVENT_PAGE)) {
  fail([
    `${migrationFile} revokes ${REVOKED.join(' and ')} from anon, but the event page could not be`,
    `found at src/app/events/[slug]/page.tsx, so the fix that must accompany it cannot be verified.`,
    '',
    'This guard fails rather than passes on an unreadable target: an unverifiable fix is not a fix.',
  ])
}

const page = readFileSync(EVENT_PAGE, 'utf8')

const problems = []

// 1. The gate must not be fed from the public embed.
if (/isOrganiserSellable\(\s*event\.organisation\s*\)/.test(page)) {
  problems.push(
    'src/app/events/[slug]/page.tsx passes `event.organisation` into isOrganiserSellable.\n' +
      `    ${migrationFile} removes ${REVOKED.join(' and ')} from anon, so those fields arrive\n` +
      '    undefined and the gate returns false for EVERY organiser. Every paid event stops\n' +
      '    selling the moment this migration is applied.',
  )
}

// 2. The privileged read must be present.
const readsPrivileged = /createAdminClient/.test(page) && /stripe_charges_enabled/.test(page)
if (!readsPrivileged) {
  problems.push(
    'src/app/events/[slug]/page.tsx does not read the organiser Stripe posture with a\n' +
      '    privileged client. With the columns revoked from anon there is no other way to\n' +
      '    establish whether an organiser can sell, so the gate cannot be correct.',
  )
}

if (problems.length > 0) {
  fail([
    `${migrationFile} is present in this tree and revokes ${REVOKED.join(' and ')} from anon.`,
    '',
    ...problems.map(p => `  - ${p}`),
    '',
    'DEPLOY ORDER (docs/roast/FOUNDER-RUNBOOK-LAUNCH.md, "Migration and deploy order"):',
    '  the CODE fix deploys FIRST and is verified, and only then is the migration applied.',
    'Applying the migration to a database whose deployed code still reads the anon embed',
    'takes every paid event off sale with no error and no alert.',
  ])
}

declareWork('migration-sale-gate', {
  did: { 'revoked column checked': REVOKED.length, 'code-level check applied to the event page': 2 },
  found: { 'problem on the event page': problems.length },
})
console.log(
  `[migration-sale-gate] PASS - ${migrationFile} revokes the columns AND the event page reads them\n` +
    '                      with a privileged client, so the two are safe to ship together.',
)
