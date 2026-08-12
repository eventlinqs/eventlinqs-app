/**
 * No component may read a clock while rendering.
 *
 * THE DEFECT. DashboardHero called `new Date().getHours()` during render.
 * That executes on the Vercel server in UTC and again in the browser in the
 * reader's zone, so for most of the day they disagree: at 04:30 UTC the server
 * wrote "Good morning" and a Melbourne browser wrote "Good afternoon". React
 * reported two #418 text mismatches on every dashboard load, the organiser was
 * greeted wrongly, and the greeting visibly changed under them.
 *
 * The same shape breaks anything time-derived: a relative timestamp, an
 * "on sale now" badge, a countdown. This catches the class, not the instance.
 *
 * Scoped to the SERVER-RENDERED surface. A file marked 'use client' may read a
 * clock freely once it is past hydration, which is exactly what
 * greeting-text.tsx does.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const SCAN_DIRS = ['src']

/**
 * Only the TIMEZONE-DEPENDENT forms. This distinction is the whole guard.
 *
 * Date.now() and .getTime() return an epoch, identical on a UTC server and an
 * Australian browser, and .toISOString() always formats in UTC. Those appear
 * all over the dashboard building query windows and none can cause a mismatch.
 * Flagging them made this guard noisy and wrong: its first version reported
 * five files, three of which were query filters that are never rendered.
 *
 * What DOES differ is anything read in the runtime's local zone:
 *   - a local accessor on a clock read: new Date().getHours()
 *   - toLocale*() with no timeZone, which formats in the runtime zone and so
 *     renders a different DAY either side of midnight
 */
const LOCAL_ACCESSOR =
  /new Date\(\s*\)\s*\.\s*(getHours|getMinutes|getDay|getDate|getMonth|getFullYear)\b/
/**
 * BOTH formatting entry points. The first version of this guard matched only
 * `.toLocaleString()` and therefore missed the worst instance on the platform:
 * /tickets formats the event's start_date with `new Intl.DateTimeFormat` and no
 * timeZone, so a buyer holding a ticket to a Perth event and reading it in
 * Sydney can be shown the wrong DAY. A guard that covers one of two equivalent
 * APIs is a guard that reports clean while the defect ships.
 */
const TO_LOCALE = /\.toLocale(String|DateString|TimeString)\(|new Intl\.DateTimeFormat\(/

function clockReads(src: string): string[] {
  const lines = src.split(/\r?\n/)
  const out: string[] = []
  lines.forEach((raw, i) => {
    const l = raw.trim()
    if (l.startsWith('//') || l.startsWith('*')) return
    if (LOCAL_ACCESSOR.test(l)) {
      out.push(`${i + 1}: ${l.slice(0, 90)}`)
      return
    }
    if (!TO_LOCALE.test(l)) return

    // The option object ends several lines down in Prettier-formatted code.
    // A 6-line window was too short and called four correct sites defects,
    // including one whose timeZone sat on the seventh line.
    const window = lines.slice(i, i + 16).join(' ')

    // A NUMBER formatted with toLocaleString has no timeZone to pin, so
    // demanding one there was noise. Its risk is different and real: a bare
    // toLocaleString() with no locale uses the RUNTIME locale, which is the
    // server's on one side and the reader's on the other, so 1234 renders
    // "1,234" or "1.234" depending on who is asking.
    const isDate = /new Date\(/.test(l) || /(weekday|dateStyle|timeStyle|month|hour)\s*:/.test(window)

    if (isDate) {
      if (!/timeZone\s*:/.test(window)) out.push(`${i + 1}: ${l.slice(0, 90)}  (date, no timeZone)`)
      return
    }
    if (/\.toLocale(String|DateString|TimeString)\(\s*\)/.test(l)) {
      out.push(`${i + 1}: ${l.slice(0, 90)}  (no locale, uses the runtime default)`)
    }
  })
  return out
}

/**
 * The ONE deliberate exemption, as a named function so it can be asserted
 * directly rather than by proxy.
 *
 * MERGE NOTE. This branch had the identical rule INLINE in the sweep, as
 * `if (/useHydrated/.test(src)) continue`. feat/public-composer extracted it
 * and added the assertions below, for a reason recorded as entry 3 of
 * docs/roast/FALSE-POSITIVE-CHECKLIST.md: the first coverage assertion checked
 * the WALK and not the SWEEP, so restoring a `use client` skip INSIDE the loop
 * left every coverage test green. That was the same blindness the assertion was
 * written to prevent, one level down. An exemption that is not a named function
 * cannot be tested, only described.
 *
 * Behaviour is unchanged: same regex, same decision, same place in the loop.
 * The two branches fixed this guard in complementary ways and both fixes are
 * kept: the broader .ts AND .tsx walk from here, and isExempt from there.
 *
 * A file gating its clock read on useHydrated has already agreed with the
 * server on the first render, which is the whole point of that hook. Nothing
 * else is exempt: Next.js server-renders a client component too, so a
 * runtime-zone format mismatches there exactly as in a server component.
 */
function isExempt(src: string): boolean {
  return /useHydrated/.test(src)
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    // MERGE NOTE. main still walks only .tsx here. Taking main's line would
    // re-open the hole below, which is the third time this guard has been
    // narrowed in a way that made it report HEALTHIER. Narrowing a guard is not
    // a smaller scope, it is a blind spot, so the broader walk is kept.
    //
    // .ts AND .tsx. THE THIRD HOLE, found 2026-08-09. This walked only .tsx,
    // so 345 of the 788 TypeScript files under src were never scanned at all,
    // and the guard reported clean over them. That is not a narrower scope, it
    // is a blind spot: the unscanned half included the ORDER CONFIRMATION
    // email, the city digest email, the poster route and the attendee export,
    // each formatting an event's start_date with no timeZone. Those render on
    // the Vercel server in UTC, so a 9pm Perth event is emailed to the buyer
    // as the next day. No hydration mismatch there, and the same wrong answer.
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

/**
 * KNOWN AND NOT YET FIXED, dated 2026-08-08. A RATCHET, not an allowlist:
 * anything NOT on this list fails, and every entry here is reported at the top
 * of the sweep report with what a user experiences until it is fixed.
 *
 * All four render an EVENT's date and need `events.timezone` threaded through
 * a component prop chain, which the surfaces already fixed did not. They are
 * listed rather than silently skipped so the next session inherits the work
 * instead of rediscovering it.
 *
 * What a user experiences meanwhile: an event within a few hours of midnight
 * in a different state shows the WRONG DAY. A Perth event at 9pm reads as the
 * next day to a reader in Sydney.
 */
// MERGE NOTE. main still lists all four entries here. They are NOT re-added,
// and this is not a preference: every one of them was fixed on this line of
// work, and the staleness test below fails an entry that is listed but already
// fixed. Re-adding main's list would go red naming the files, and if that test
// were also lost it would quietly re-declare four working surfaces as broken.
const KNOWN_UNFIXED = new Map<string, string>([
  // EMPTY, and it stays empty. All four entries were cleared on 2026-08-09 by
  // threading events.timezone through the prop chain each one needed:
  //   ticket-selector      page -> TicketPanelClient -> TicketSelector
  //   trending-events-bento  EVENT_SELECT -> RawRow -> toBentoEvent -> BentoEvent
  //   surprise-me-modal      /api/home/surprise select -> Suggestion payload
  //   artists/[slug]         fetchArtistCredits select -> ArtistCredit
  // A new entry here is a debt, not a licence: it must carry what a user
  // experiences until it is fixed, and the staleness test below fails the
  // moment an entry is already fixed or deleted.
])

describe('server-rendered dashboard components do not read a clock', () => {
  it('finds dashboard components to scan, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('has no clock read in a component that is not a client component', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      // NOT skipped for being a client component. Next.js server-renders a
      // client component too and then hydrates it, so a runtime-zone format
      // mismatches there exactly as it does in a server component. Exempting
      // 'use client' was a hole that hid most of the platform.
      //
      // The only real exemption is the deliberate pattern: a file that gates
      // its clock read on useHydrated has already agreed with the server on
      // the first render, which is the whole point of that hook. Named rather
      // than inline so the coverage tests can assert the DECISION.
      if (isExempt(src)) continue
      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      if (KNOWN_UNFIXED.has(rel)) continue
      const hits = clockReads(src)
      if (hits.length > 0) {
        offenders.push(`${rel}\n    ${hits.join('\n    ')}`)
      }
    }
    expect(
      offenders,
      `a clock read during server render causes a hydration mismatch:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('every ratcheted file still exists and still has the defect, so the list cannot go stale', () => {
    // A ratchet entry for a file that is already fixed, or deleted, is a lie
    // that makes the list look bigger than the debt. Both are failures.
    const stale: string[] = []
    for (const [rel, why] of KNOWN_UNFIXED) {
      const full = path.join(ROOT, rel)
      let src: string
      try {
        src = readFileSync(full, 'utf8')
      } catch {
        stale.push(`${rel} no longer exists; remove it from KNOWN_UNFIXED`)
        continue
      }
      if (clockReads(src).length === 0) {
        stale.push(`${rel} is FIXED; remove it from KNOWN_UNFIXED (${why})`)
      }
    }
    expect(stale, stale.join('\n')).toEqual([])
  })

  it('the greeting itself is client-side and gated on hydration', () => {
    const src = readFileSync(path.join(ROOT, 'src/components/dashboard/greeting-text.tsx'), 'utf8')
    expect(src).toMatch(/^['"]use client['"]/m)
    expect(src).toContain('useHydrated')
    // The clock must sit behind the hydration check, never beside it.
    expect(src).toMatch(/hydrated \? timeOfDay\(new Date\(\)/)
  })

  /*
   * THE EXEMPTION IS ASSERTED, NOT DESCRIBED. Brought over from
   * feat/public-composer with isExempt, because an exemption nothing tests can
   * widen to swallow the platform and every other test here stays green while
   * it happens. That is precisely how this guard was blinded before: see
   * docs/roast/FALSE-POSITIVE-CHECKLIST.md entry 3.
   */
  describe('the exemption cannot quietly widen', () => {
    it('does not exempt a file merely for being a client component', () => {
      const clientWithDefect = [
        `'use client'`,
        '',
        `const when = new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' })`,
      ].join('\n')
      expect(isExempt(clientWithDefect)).toBe(false)
      expect(clockReads(clientWithDefect)).not.toEqual([])
    })

    it('exempts only the deliberate useHydrated pattern', () => {
      expect(isExempt('const hydrated = useHydrated()')).toBe(true)
      expect(isExempt('const x = 1')).toBe(false)
      expect(isExempt(`'use client'`)).toBe(false)
    })

    it('scans the whole of src, not only the dashboard', () => {
      expect(SCAN_DIRS).toEqual(['src'])
      const outsideDashboard = files.filter((f) => !f.includes('dashboard'))
      expect(outsideDashboard.length).toBeGreaterThan(200)
    })

    it('scans .ts as well as .tsx, which is where the third hole was', () => {
      // 345 of 788 TypeScript files under src were never scanned while this
      // walked .tsx alone, and the guard reported clean over all of them.
      expect(files.some((f) => f.endsWith('.ts'))).toBe(true)
      expect(files.some((f) => f.endsWith('.tsx'))).toBe(true)
    })
  })
})
