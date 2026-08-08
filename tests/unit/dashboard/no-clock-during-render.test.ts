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
const SCAN_DIRS = ['src/components/dashboard', 'src/app/(dashboard)']

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
const TO_LOCALE = /\.toLocale(String|DateString|TimeString)\(/

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
    else if (/\.tsx$/.test(e)) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))

describe('server-rendered dashboard components do not read a clock', () => {
  it('finds dashboard components to scan, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('has no clock read in a component that is not a client component', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (/^['"]use client['"]/m.test(src)) continue
      const hits = clockReads(src)
      if (hits.length > 0) {
        offenders.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}\n    ${hits.join('\n    ')}`)
      }
    }
    expect(
      offenders,
      `a clock read during server render causes a hydration mismatch:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the greeting itself is client-side and gated on hydration', () => {
    const src = readFileSync(path.join(ROOT, 'src/components/dashboard/greeting-text.tsx'), 'utf8')
    expect(src).toMatch(/^['"]use client['"]/m)
    expect(src).toContain('useHydrated')
    // The clock must sit behind the hydration check, never beside it.
    expect(src).toMatch(/hydrated \? timeOfDay\(new Date\(\)/)
  })
})
