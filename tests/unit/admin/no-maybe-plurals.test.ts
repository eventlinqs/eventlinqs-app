import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * NO '(s)' IN THE ADMIN (the PM's 02:45 of 16 November 2026, fix 3): '5 piece(s)', '3 letter(s)' and '19 organiser
 * photo(s)' read as a machine's. Every count goes through src/lib/text/plural.ts; this fails on any word followed by
 * '(s)', '(es)' or '(ies)' in the admin's pages, components and reads, comments aside.
 */
const ROOTS = ['src/app/admin', 'src/components/admin', 'src/lib/admin']
const MAYBE_PLURAL = /[A-Za-z]\((s|es|ies)\)/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe("no '(s)' in the admin's own words", () => {
  it('every count is said through countOf, never as word(s)', () => {
    const found: string[] = []
    for (const root of ROOTS) {
      for (const f of files(join(process.cwd(), root))) {
        readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
          const code = line.trim()
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
          if (MAYBE_PLURAL.test(line)) found.push(`${f.slice(process.cwd().length + 1)}:${i + 1}: ${code.slice(0, 120)}`)
        })
      }
    }
    expect(found).toEqual([])
  })

  it('the check itself sees a maybe plural (drill)', () => {
    expect(MAYBE_PLURAL.test('`${n} piece(s) wait`')).toBe(true)
    expect(MAYBE_PLURAL.test('.filter((s) => s.ok)')).toBe(false)
  })
})
