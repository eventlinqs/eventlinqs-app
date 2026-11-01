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

  it('no title or message is built with a spaced hyphen: a join, an interpolated title, a sentence in a template', () => {
    // WINDOW 3, 2 November 09:23: every event page's title was `${titleParts.join(' - ')} - EventLinqs` and the venue
    // page's `${venue.name} - Events & Info...`, which the literal sweep above cannot see (a quote inside ${...} ends its
    // match), and the founder's health email said 'Good news - systems recovered'. These read the whole line.
    const found: string[] = []
    const JOIN = /\.join\(\s*['"`] - ['"`]\s*\)/
    for (const file of files) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        // A comment is not copy, and arithmetic inside ${...} ('a - b') is code: both are taken out before judging.
        const code = line.replace(/^\s*(\/\/|\*).*$/, '').replace(/\$\{[^}]*\}/g, 'X')
        // Each template literal is read on its own, its backticks paired in order, so the code BETWEEN two templates
        // (`${a}T00:00Z`) - Date.parse(`${b}...`) is never read as one template's text.
        const templates = [...code.matchAll(/`([^`]*)`/g)].map((m) => m[1])
        if (JOIN.test(code) || templates.some((t) => SPACED_HYPHEN.test(t))) found.push(`${file.slice(ROOT.length + 1)}:${i + 1} ${line.trim().slice(0, 120)}`)
      })
    }
    expect(found).toEqual([])
  })
})
