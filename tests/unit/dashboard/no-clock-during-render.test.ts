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
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { safeRead, safeWalk } from '../../helpers/safe-walk'

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
      /*
       * A DATE BUILT FROM EXPLICIT LOCAL COMPONENTS NEEDS NO timeZone, and
       * demanding one there was a false positive that failed this suite on
       * origin/main and on every branch that carried the pattern.
       *
       * `new Date(y, m, d, hh, mm)` does not read a clock and does not name an
       * instant. It builds a Date whose LOCAL components ARE those numbers.
       * Formatting it with no `timeZone` reads those same local components back
       * out, so the printed label is identical in every zone: the construction
       * and the format cancel. Pinning a zone would in fact be WRONG here,
       * because it would shift a wall-clock time the organiser typed.
       *
       * The two sites this cleared are `formatParts` in
       * src/lib/launch/draft-artefacts.ts and `dayAndTime` in
       * src/lib/ai/draft-fallbacks.ts, both of which parse "YYYY-MM-DDTHH:mm"
       * into parts and hand those parts to the constructor.
       *
       * The teeth are intact. A Date made from an INSTANT still needs a zone,
       * and every one of those forms has no comma in its arguments:
       * `new Date()`, `new Date(Date.now())`, `new Date(isoString)`,
       * `new Date(row.starts_at)`. Three or more comma-separated arguments is
       * the components constructor and nothing else. The "still catches" cases
       * below prove the guard did not go blind.
       */
      /*
       * RESOLVE THE VALUE BEING FORMATTED, not merely "is there a components
       * constructor somewhere nearby".
       *
       * The first version of this narrowing asked whether ANY line in a
       * twelve-line lookback built a Date from components. A drill showed that
       * is blind at close range: an instant-derived
       * `.format(new Date())` placed on the line immediately after
       * `const date = new Date(y, m, d, hh, mm)` was cleared, while the same
       * call thirteen lines later was caught. A guard whose verdict depends on
       * how far apart two lines happen to sit is not a guard.
       *
       * So the receiver is identified first, and only a declaration of THAT
       * identifier counts. An expression rather than an identifier, which is
       * exactly what `.format(new Date())` is, resolves to nothing and is
       * therefore flagged, which is the correct answer.
       */
      let formatted: string | null = null
      const formatCall = /\.format\(\s*([^)]*)\)/.exec(window)
      if (formatCall) {
        const arg = formatCall[1].trim()
        formatted = /^[A-Za-z_$][\w$]*$/.test(arg) ? arg : null
      } else {
        const receiver = /([A-Za-z_$][\w$]*)\s*\.toLocale(?:String|DateString|TimeString)\(/.exec(l)
        if (receiver) formatted = receiver[1]
      }

      let fromLocalComponents = false
      if (formatted) {
        // The arguments contain parentheses in real code
        // (`new Date(Number(y), Number(mo) - 1, ...)`), so the commas are
        // counted rather than matched with a paren-free character class.
        const declares = new RegExp(`(?:const|let|var)\\s+${formatted}\\s*=\\s*new Date\\(`)
        for (const back of lines.slice(Math.max(0, i - 12), i + 1)) {
          if (!declares.test(back)) continue
          const args = back.slice(back.indexOf('new Date(') + 'new Date('.length)
          fromLocalComponents = (args.match(/,/g) ?? []).length >= 2
          break
        }
      }
      if (!fromLocalComponents && !/timeZone\s*:/.test(window)) {
        out.push(`${i + 1}: ${l.slice(0, 90)}  (date, no timeZone)`)
      }
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
 * MERGE NOTE. fix/production-sweep had the identical rule INLINE in the sweep,
 * as `if (/useHydrated/.test(src)) continue`. feat/public-composer extracted it
 * and added the assertions below, for a reason recorded as entry 3 of
 * docs/roast/FALSE-POSITIVE-CHECKLIST.md: the first coverage assertion checked
 * the WALK and not the SWEEP, so restoring a `use client` skip INSIDE the loop
 * left every coverage test green. That was the same blindness the assertion was
 * written to prevent, one level down. Drilled and confirmed before that
 * refactor: with `use client` back in here, the sweep silently stopped
 * examining most of the platform and nothing went red. An exemption that is not
 * a named function cannot be tested, only described.
 *
 * Behaviour is unchanged: same regex, same decision, same place in the loop.
 * The two branches fixed this guard in complementary ways and both fixes are
 * kept: the broader .ts AND .tsx walk from one, and isExempt from the other.
 *
 * A file gating its clock read on useHydrated has already agreed with the
 * server on the first render, which is the whole point of that hook. Nothing
 * else is exempt: Next.js server-renders a client component too, so a
 * runtime-zone format mismatches there exactly as in a server component.
 */
function isExempt(src: string): boolean {
  return /useHydrated/.test(src)
}

/*
 * THE WALK IS THE SHARED ONE. It used to be a local copy, and although it did
 * guard readdirSync and statSync, both catches swallowed EVERY error rather than
 * only "the path is gone". A permission fault or a broken mount therefore read
 * as an empty directory, and this guard would have reported clean over a tree it
 * never managed to open, at MODULE SCOPE, where the failure is silent. safeWalk
 * rethrows anything that is not ENOENT or ENOTDIR, so that cannot happen.
 *
 * Why the vanish guard is needed at all: the copy-gate self test used to write a
 * scratch .tsx under src/ and delete it while vitest ran this file in a parallel
 * worker. That scratch now lives outside the repository, so the race is closed at
 * its source too; the guard stays for the next writer under src/.
 *
 * MERGE NOTE. main still walks only .tsx here. Taking main's line would re-open
 * the hole below, which is the third time this guard has been narrowed in a way
 * that made it report HEALTHIER. Narrowing a guard is not a smaller scope, it is
 * a blind spot, so the broader walk is kept.
 *
 * .ts AND .tsx. THE THIRD HOLE, found 2026-08-09. This walked only .tsx, so 345
 * of the 788 TypeScript files under src were never scanned at all, and the guard
 * reported clean over them. The unscanned half included the ORDER CONFIRMATION
 * email, the city digest email, the poster route and the attendee export, each
 * formatting an event's start_date with no timeZone. Those render on the Vercel
 * server in UTC, so a 9pm Perth event is emailed to the buyer as the next day.
 * No hydration mismatch there, and the same wrong answer.
 */
const files = SCAN_DIRS.flatMap((d) =>
  safeWalk(path.join(ROOT, d), (name) => /\.tsx?$/.test(name)),
)

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
/**
 * EMPTY, as of 9 August 2026. All four entries were fixed and removed one at a
 * time, each with its ratchet entry deleted in the same change.
 *
 * The type parameters are explicit BECAUSE it is empty: `new Map([])` infers
 * Map<unknown, unknown>, which makes `rel` unknown and breaks the staleness
 * loop below at compile time. The next person to add an entry should get a
 * type error if they pass the wrong shape, not a silently untyped map.
 *
 * The contract for anyone adding one back: key is the repo-relative path, value
 * is what a USER experiences until it is fixed, not what the code does.
 *
 * MERGE NOTE. main still lists all four entries here. They are NOT re-added,
 * and this is not a preference: every one of them was fixed on these lines of
 * work, and the staleness test below fails an entry that is listed but already
 * fixed. Re-adding main's list would go red naming the files, and if that test
 * were also lost it would quietly re-declare four working surfaces as broken.
 */
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
      // Same race as the walk above: the list was built earlier, and a scratch
      // file written by a concurrent test can be gone by the time it is read.
      let src: string
      try {
        src = readFileSync(f, 'utf8')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw err
      }
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

  /**
   * THE COVERAGE ASSERTION. This is the part that stops the guard going blind.
   *
   * This guard has already narrowed TWICE without anybody noticing, and both
   * times it reported FEWER violations and therefore looked HEALTHIER:
   *
   *   1. It skipped every file marked 'use client', which is most of the
   *      platform. Next.js server-renders a client component too, so those
   *      files mismatch exactly like a server component.
   *   2. It matched `.toLocaleString()` and not `new Intl.DateTimeFormat()`,
   *      so it missed /tickets, the worst instance on the platform.
   *
   * That is the same shape as the copy gate that went blind to 3,134 lines
   * while reporting clean: a scanner whose SCOPE shrinks looks like a codebase
   * whose QUALITY improved, and nothing tells them apart from the outside.
   *
   * So the scope is now asserted, not assumed. These fixtures are planted
   * strings the matcher MUST catch. If someone narrows the regexes, restores
   * the 'use client' skip, or points the walk at a smaller tree, this goes red
   * with a message naming what stopped being covered, instead of the sweep
   * quietly reporting zero.
   */
  describe('the guard cannot narrow without going red', () => {
    const MUST_CATCH: [string, string][] = [
      [
        'toLocaleString with no timeZone',
        `const x = new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium' })`,
      ],
      [
        'toLocaleDateString with no timeZone',
        `const x = new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' })`,
      ],
      [
        'toLocaleTimeString with no timeZone',
        `const x = new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric' })`,
      ],
      [
        'new Intl.DateTimeFormat with no timeZone (the /tickets miss)',
        `const x = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(d)`,
      ],
      ['a local accessor on a clock read', `const h = new Date().getHours()`],
      ['a bare toLocaleString on a number', `const n = count.toLocaleString()`],
    ]

    it.each(MUST_CATCH)('still catches: %s', (_name, fixture) => {
      expect(clockReads(fixture)).not.toEqual([])
    })

    const MUST_NOT_CATCH: [string, string][] = [
      [
        'a correctly pinned date',
        `const x = new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Perth' })`,
      ],
      [
        'a pinned Intl.DateTimeFormat',
        `const x = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: zone }).format(d)`,
      ],
      ['an epoch read, identical in every zone', `const t = Date.now()`],
      ['toISOString, always UTC', `const s = new Date().toISOString()`],
      ['a number with an explicit locale', `const n = count.toLocaleString('en-AU')`],
    ]

    it.each(MUST_NOT_CATCH)('still allows: %s', (_name, fixture) => {
      expect(clockReads(fixture)).toEqual([])
    })

    /**
     * The scope itself. A walk pointed at a narrower tree reports fewer
     * violations and looks better, so the size of the swept set is asserted
     * rather than trusted. The floor is deliberately well below the current
     * count so ordinary deletions do not trip it, and well above zero so a
     * broken walk does.
     */
    it('sweeps the whole component tree, not a corner of it', () => {
      expect(files.length).toBeGreaterThan(300)
    })

    it('sweeps client components, which is the hole that hid most of the platform', () => {
      // safeRead guards the vanish race the walk and the other reads in this
      // file already guard: a file deleted since the walk listed it is skipped
      // rather than throwing ENOENT out of the assertion.
      const clientFiles = files.filter((f) => {
        const src = safeRead(f)
        return src !== null && /^['"]use client['"]/m.test(src)
      })
      expect(clientFiles.length).toBeGreaterThan(100)
    })

    /**
     * The assertion above only proves the WALK lists client files. The skip
     * that caused the original hole lived INSIDE the sweep, so it left every
     * coverage test green when this block was first written. This is the one
     * that actually bites: it tests the exemption decision itself.
     */
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
