import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO SPACED HYPHEN IN COPY A VISITOR READS (Lawal's law 6 of 31 October 2026: 'no em dash, no en dash, no spaced
 * hyphen'). 2 November 2026: WINDOW 1 found an organiser page's title 'Party Pty Ltd - Events & Profile' on the preview;
 * the sweep that followed found ten more on this branch (five community subtitles, four screen-reader loading labels, a
 * dev page subtitle), all on production. One defect is a class, so this sweeps every title, subtitle, description and
 * aria-label written as a literal in src, the way the train's copy gate reads them.
 */
const ROOT = join(__dirname, '..', '..', '..', 'src')
const files = (readdirSync(ROOT, { recursive: true }) as string[])
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => join(ROOT, f))

const LITERAL = /(?:title|description|subtitle)\s*[:=]\s*["'`]([^"'`]+)["'`]/g
const ARIA = /aria-label=["']([^"']+)["']/g
const SPACED_HYPHEN = /[A-Za-z0-9.,)] - [A-Za-z0-9(]/

describe('visible copy carries no spaced hyphen', () => {
  it('every literal title, subtitle, description and aria-label in src', () => {
    const found: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        for (const re of [LITERAL, ARIA]) {
          for (const m of line.matchAll(re)) {
            if (SPACED_HYPHEN.test(m[1])) found.push(`${file.slice(ROOT.length + 1)}:${i + 1} ${m[1]}`)
          }
        }
      })
    }
    expect(files.length).toBeGreaterThan(500)
    expect(found).toEqual([])
  })
})
