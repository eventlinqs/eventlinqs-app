/**
 * Personal data must not leave the platform to a third party, and must not cross
 * the client boundary wider than the page renders.
 *
 * TWO DEFECTS THIS PINS.
 *
 * 1. SESSION REPLAY WAS RECORDING UNMASKED TEXT. `beforeSend` does not apply to
 *    Session Replay; Sentry documents a separate hook, beforeAddRecordingEvent,
 *    and there was none. So the scrubValue discipline that protects every error
 *    event did not cover replays at all, while replaysOnErrorSampleRate sat at
 *    1.0 and maskAllText/blockAllMedia were explicitly set to false (both default
 *    to true). Every error uploaded ~60s of DOM as readable text, and the DOM on
 *    this platform holds buyer names and emails on the organiser orders and
 *    attendee screens, a ticket code on the ticket page, and a name and email at
 *    checkout. ASVS 14.2.3, 16.2.5.
 *
 * 2. A CLIENT COMPONENT WAS HANDED WHOLE ORDER ROWS. The organiser orders page
 *    used `select('*')` and passed the result to <OrderTable>, a client
 *    component, so all 25 columns of every order were serialised into the RSC
 *    payload for a table that renders 8. ASVS 8.2.3.
 *
 * These are asserted against the SOURCE rather than by executing the SDK,
 * because both are configuration facts rather than runtime behaviour: there is no
 * way to observe "Sentry was constructed with masking on" from inside a unit test
 * without booting the real SDK against a real DSN and a real browser. The thing
 * that must not regress is the configured value, so that is what is checked.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { safeWalk, safeRead } from '../../helpers/safe-walk'

const ROOT = path.resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/**
 * Source with comments removed.
 *
 * Needed because the fix for the replay defect explains itself in a comment that
 * necessarily quotes the dangerous value, and a naive source match then fails on
 * the documentation rather than the code. Asserting on code means stripping
 * comments first.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

describe('Session Replay does not ship readable personal data to Sentry', () => {
  const code = readCode('src/lib/observability/sentry-client-boot.ts')
  const src = read('src/lib/observability/sentry-client-boot.ts')

  it('masks all text', () => {
    expect(code).toMatch(/maskAllText:\s*true/)
    expect(code, 'maskAllText:false records buyer names and emails as readable text').not.toMatch(
      /maskAllText:\s*false/,
    )
  })

  it('blocks all media', () => {
    expect(code).toMatch(/blockAllMedia:\s*true/)
    expect(code).not.toMatch(/blockAllMedia:\s*false/)
  })

  it('still scrubs ordinary error events through the PII scrubber', () => {
    // The replay fix must not be mistaken for the error-event control. Both are
    // required, and this one was already correct.
    expect(src).toContain('scrubValue')
    expect(src).toMatch(/beforeSend\(/)
  })

  it('records WHY masking is on, so it is not switched off for convenience', () => {
    // A bare `maskAllText: true` invites a future revert for debugging fidelity.
    // The reasoning has to travel with the value.
    expect(src).toMatch(/beforeAddRecordingEvent|does NOT apply to Session Replay/i)
  })
})

describe('the PII scrubber covers what it claims to', () => {
  it('scrubs emails, tokens, cards and Stripe ids', async () => {
    const { scrubValue } = await import('@/lib/observability/pii-scrub')
    const out = JSON.stringify(
      scrubValue({
        email: 'buyer@example.com',
        note: 'call me on +61 412 345 678',
        stripe: 'cus_ABC123def456',
        jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef',
        auth: 'Bearer sk_live_shouldnotappear',
      }),
    )
    expect(out).not.toContain('buyer@example.com')
    expect(out).not.toContain('412 345 678')
    expect(out).not.toContain('cus_ABC123def456')
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(out).not.toContain('sk_live_shouldnotappear')
  })

  it('drops credential-bearing headers outright', async () => {
    const { scrubValue } = await import('@/lib/observability/pii-scrub')
    const out = scrubValue({
      request: { headers: { authorization: 'Bearer abc', cookie: 'sb-access-token=xyz' } },
    }) as { request: { headers: Record<string, unknown> } }
    const headers = JSON.stringify(out.request.headers)
    expect(headers).not.toContain('abc')
    expect(headers).not.toContain('xyz')
  })
})

describe('client components are not handed whole database rows', () => {
  it('the organiser orders page selects explicit columns, never (*)', () => {
    const src = read('src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx')
    const ordersQuery = src.slice(src.indexOf(".from('orders')"))
    const select = ordersQuery.slice(0, ordersQuery.indexOf(')') + 400)
    expect(select, 'orders feeds a client component; (*) ships every column').not.toMatch(
      /\.select\(\s*['"`]\*/,
    )
    // and does not reach for the columns the table never renders
    for (const col of ['metadata', 'platform_fee_cents', 'discount_code_id', 'reservation_id']) {
      expect(select, `${col} is not rendered and should not cross the boundary`).not.toContain(col)
    }
  })

  it('no server page passes select(*) straight into a known client table component', () => {
    // Broader sweep, so a NEW page cannot repeat the pattern. Pairs each client
    // table component with the pages that render it.
    const clientTables = ['OrderTable', 'EventsTable']
    const offenders: string[] = []
    /*
     * safeWalk, not a local walk. The local version guarded statSync and left
     * readdirSync bare, which is the half-guard the helper's own header records
     * as having been shipped and failed twice: a RECURSIVE readdir into a
     * directory that has just been removed throws the same ENOENT as a stat on a
     * removed entry. src/app is not where the known scratch file lands, so this
     * one could not race today, but a walk that is only safe because of where
     * something else happens to write is not safe, it is lucky.
     */
    for (const file of safeWalk(path.join(ROOT, 'src/app'), (n) => n.endsWith('.tsx'))) {
      const src = safeRead(file)
      if (src === null) continue
      if (!clientTables.some((c) => src.includes(`<${c}`))) continue
      if (/\.select\(\s*['"`]\*/.test(src)) offenders.push(path.relative(ROOT, file))
    }
    expect(offenders, `select(*) feeding a client table: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('no secret can reach the browser bundle', () => {
  it("every process.env read in a 'use client' file is NEXT_PUBLIC_ or NODE_ENV", () => {
    const offenders: string[] = []
    /*
     * THE WALK AND THE READ ARE BOTH GUARDED, VIA THE SHARED HELPER.
     *
     * This test used to die on `ENOENT ... src/__copy_gate_scratch__/scratch.tsx`.
     * The first fix guarded only the READ, and left readdirSync and statSync
     * bare; the second guarded statSync too and still left the recursive
     * readdirSync bare. Both were narrower blind spots rather than fixes, which
     * is why the walk now lives in one helper that guards all three operations.
     *
     * The scratch file itself has since moved OUT of src/ entirely, into the
     * system temp directory, so this race is closed at its source as well. Both
     * layers are kept deliberately: the helper protects against the next writer
     * under src/, whoever adds it.
     *
     * Skipping a vanished file is also the CORRECT answer on the merits, not
     * merely a way to stop a crash: a file that is not on disk cannot be in the
     * shipped client bundle, which is the only thing this assertion is about.
     */
    for (const file of safeWalk(path.join(ROOT, 'src'), (n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
      const src = safeRead(file)
      if (src === null) continue
      if (!/^['"]use client['"]/m.test(src)) continue
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = m[1]!
        if (name.startsWith('NEXT_PUBLIC_') || name === 'NODE_ENV') continue
        offenders.push(`${path.relative(ROOT, file)}: ${name}`)
      }
    }
    expect(offenders, `server-only env read in client code: ${offenders.join(', ')}`).toEqual([])
  })
})
