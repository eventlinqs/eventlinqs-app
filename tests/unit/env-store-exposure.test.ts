/**
 * THE GUARDS ADDED BY THE 2026-08-03 ENVIRONMENT INTEGRITY PASS.
 *
 * Each one exists because something real was found, and each asserts the
 * FAILING case as well as the passing one, because a guard that has never been
 * seen to fail is not a guard.
 *
 *   R3          a secret may never live on a scope the platform cannot protect
 *   PHASE 10.4  a record the checker cannot assess fails loudly, never silently
 *   PHASE 10.5  exposure is decided by read-back, never by the listing label
 *   R2          alert destinations derive from one definition, not a literal
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ENV_MANIFEST, SENSITIVE_CAPABLE_SCOPES, policyFor, storePolicyFor } from '@/lib/env/manifest.mjs'
import { evaluateStores } from '@/lib/env/manifest-checks.mjs'
import { PLATFORM_INBOX, alertDestination, supportDestination } from '@/lib/env/destinations'

type Entry = { name: string; mustBeSensitive?: unknown }
const entries = ENV_MANIFEST as Entry[]
const GH = ['CRON_SECRET', 'RESEND_API_KEY', 'SUPABASE_ACCESS_TOKEN']

/**
 * R3. Vercel refuses `--sensitive` on Development by design, so anything stored
 * there is readable in plain text by anyone with project access and no setting
 * can change it. The previous position was that this was tolerable because
 * LIVE_CREDENTIAL_ISOLATION guarantees the value is a test credential. That
 * argument does NOT hold for a credential with no test mode: the 2026-08-03
 * audit found a live RESEND_API_KEY and a billable GOOGLE_MAPS_API_KEY readable
 * there, and no mode rule can protect either, because neither has a mode.
 */
describe('R3: a secret may never live on a scope the platform cannot protect', () => {
  it('is not a vacuous check: the manifest declares several secrets', () => {
    expect(entries.filter(e => e.mustBeSensitive === true).length).toBeGreaterThan(5)
  })

  it('storePolicyFor forbids EVERY declared secret on development', () => {
    for (const e of entries.filter(x => x.mustBeSensitive === true)) {
      expect.soft(storePolicyFor(e, 'development'), `${e.name} on development`).toBe('forbidden')
    }
  })

  it('still permits secrets on the scopes that CAN hold them, so it is not a blanket ban', () => {
    const secret = entries.find(e => e.name === 'SUPABASE_SERVICE_ROLE_KEY')!
    expect(SENSITIVE_CAPABLE_SCOPES).toContain('production')
    expect(storePolicyFor(secret, 'production')).not.toBe('forbidden')
  })

  it('leaves the PROCESS contract alone, so a local run still gets the value it needs', () => {
    const secret = entries.find(e => e.name === 'SUPABASE_SERVICE_ROLE_KEY')!
    expect(policyFor(secret, 'development')).not.toBe('forbidden')
  })

  it('FAILS when a secret record sits on the development scope', () => {
    const verdict = evaluateStores({
      records: [{ name: 'RESEND_API_KEY', scope: 'development', gitBranch: null, readable: true }],
      githubSecrets: GH,
    })
    const hit = verdict.findings.find(f => f.name === 'RESEND_API_KEY' && f.scope === 'development')
    expect(hit).toBeDefined()
    expect(hit!.state).toBe('secret-on-unprotectable-scope')
    expect(hit!.severity).toBe('always-blocking')
    expect(hit!.reason).toContain('.env.local')
  })
})

/**
 * PHASE 10.4. `readable` used to be allowed to arrive as null meaning
 * "unknown", and unknown never failed anything. That is how 22 branch-pinned
 * records, STRIPE_SECRET_KEY and CRON_SECRET among them, went unmeasured while
 * the checker printed ALL CHECKS PASSED.
 */
describe('PHASE 10.4: an unassessed secret is a failure, never a silent pass', () => {
  it('FAILS when a secret record carries no exposure measurement', () => {
    const verdict = evaluateStores({
      records: [{ name: 'STRIPE_SECRET_KEY', scope: 'preview', gitBranch: 'release/launch-line', readable: null }],
      githubSecrets: GH,
    })
    const hit = verdict.findings.find(f => f.state === 'exposure-unassessed' && f.name === 'STRIPE_SECRET_KEY')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('blocking')
    expect(hit!.reason).toContain('release/launch-line')
  })

  it('defaults to STRICT, so a caller that forgets the flag fails rather than passes', () => {
    const findings = evaluateStores({
      // A record with no `readable` field at all: the shape a careless future
      // caller would produce. The unsafe direction must be the one that shouts.
      records: [{ name: 'STRIPE_SECRET_KEY', scope: 'preview', gitBranch: 'x' }],
      githubSecrets: GH,
    }).findings
    expect(findings.some(f => f.state === 'exposure-unassessed')).toBe(true)
  })

  it('is silent ONLY when the caller declares plainly that it never measured exposure', () => {
    const findings = evaluateStores(
      {
        records: [{ name: 'STRIPE_SECRET_KEY', scope: 'preview', gitBranch: 'x', readable: null }],
        githubSecrets: GH,
      },
      { exposureAssessed: false },
    ).findings
    expect(findings.some(f => f.state === 'exposure-unassessed')).toBe(false)
  })

  it('a measured, withheld record raises no EXPOSURE finding', () => {
    // Scoped to the exposure states on purpose. This synthetic inventory also
    // lacks a production record, which correctly raises `missing-scope`; that
    // is a different check and asserting its absence here would make this test
    // pass for the wrong reason.
    const findings = evaluateStores({
      records: [{ name: 'STRIPE_SECRET_KEY', scope: 'preview', gitBranch: 'x', readable: false }],
      githubSecrets: GH,
    }).findings
    const exposure = findings.filter(f => f.state === 'readable-secret' || f.state === 'exposure-unassessed')
    expect(exposure).toEqual([])
  })
})

/**
 * PHASE 10.5. `vercel env ls` prints the literal string "Encrypted" for a
 * genuinely sensitive record AND for a merely encrypted one that `env pull`
 * hands back in plain text. The two are indistinguishable in the listing, and
 * only one of them is safe.
 */
describe('PHASE 10.5: exposure is decided by read-back, never by the listing label', () => {
  const exposedFor = (readable: boolean) =>
    evaluateStores({
      records: [{ name: 'STRIPE_SECRET_KEY', scope: 'preview', gitBranch: 'release/launch-line', readable }],
      githubSecrets: GH,
    }).findings.filter(f => f.state === 'readable-secret')

  it('flags the record whose value CAME BACK, though the listing called it Encrypted', () => {
    expect(exposedFor(true)).toHaveLength(1)
  })

  it('clears the record whose value was WITHHELD, though the listing called it Encrypted too', () => {
    expect(exposedFor(false)).toHaveLength(0)
  })

  it('proves the listing cannot be the source: identical label, opposite verdicts', () => {
    const asPrintedByLs = { genuinelySensitive: 'Encrypted', merelyEncrypted: 'Encrypted' }
    expect(asPrintedByLs.genuinelySensitive).toBe(asPrintedByLs.merelyEncrypted)
    expect(exposedFor(true).length).not.toBe(exposedFor(false).length)
  })

  it('the store checker does not capture the listing value column at all', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/check-env-stores.mjs'), 'utf8')
    const parser = src.slice(src.indexOf('function parseEnvListing'), src.indexOf('const REDACTED'))
    expect(parser).toContain('DELIBERATELY NOT CAPTURED')
    // The parsed record must carry name, scope and branch, and nothing derived
    // from the column that cannot tell the two apart.
    expect(parser).not.toMatch(/records\.push\([^)]*type/s)
  })
})

/**
 * R2. The destination for every payment and health alert was
 * `lawaladams9@gmail.com`, hardcoded separately in two files. Nothing was ever
 * lost, so nothing ever failed, which is exactly why it survived.
 */
describe('R2: alert destinations derive from one definition, not a literal', () => {
  const CALL_SITES = [
    'src/lib/health/runner.ts',
    'src/app/api/cron/webhook-sentinel/route.ts',
    'src/lib/ai/handoff.ts',
  ]

  it('no shipped call site contains a personal email literal', () => {
    for (const rel of CALL_SITES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect.soft(src, `${rel} still names a personal address`).not.toMatch(/lawaladams9@gmail\.com/)
    }
  })

  it('every call site reads the shared definition', () => {
    for (const rel of CALL_SITES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect.soft(src, `${rel} does not import the shared destinations`).toMatch(/@\/lib\/env\/destinations/)
    }
  })

  it('falls back to a brand address and never to an empty destination', () => {
    expect(PLATFORM_INBOX).toMatch(/@eventlinqs\.com$/)
    const before = process.env.PAYMENT_ALERT_EMAIL
    try {
      delete process.env.PAYMENT_ALERT_EMAIL
      expect(alertDestination()).toBe(PLATFORM_INBOX)
      // Present but blank is the silent-failure class this whole pass is about.
      process.env.PAYMENT_ALERT_EMAIL = '   '
      expect(alertDestination()).toBe(PLATFORM_INBOX)
      process.env.PAYMENT_ALERT_EMAIL = 'ops@eventlinqs.com'
      expect(alertDestination()).toBe('ops@eventlinqs.com')
    } finally {
      if (before === undefined) delete process.env.PAYMENT_ALERT_EMAIL
      else process.env.PAYMENT_ALERT_EMAIL = before
    }
  })

  it('the support destination behaves the same way', () => {
    const before = process.env.SUPPORT_INBOX_EMAIL
    try {
      delete process.env.SUPPORT_INBOX_EMAIL
      expect(supportDestination()).toBe(PLATFORM_INBOX)
    } finally {
      if (before === undefined) delete process.env.SUPPORT_INBOX_EMAIL
      else process.env.SUPPORT_INBOX_EMAIL = before
    }
  })

  it('never points at an address proven to bounce', () => {
    // alerts@eventlinqs.com hard bounced on 2026-08-03 (550 5.4.1, Exchange
    // Online): the mailbox does not exist. It must not become a default.
    expect(PLATFORM_INBOX).not.toBe('alerts@eventlinqs.com')
  })
})
