import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { normaliseEol, readSource } from '../../../scripts/guards/lib/source.mjs'

/**
 * A SCANNER MUST READ THE SAME CODE ON EVERY MACHINE.
 *
 * WHY THIS EXISTS. This repository stores LF in the index, sets
 * `core.autocrlf=true` and carries no `.gitattributes`, so every text file is
 * materialised CRLF on Windows and LF on the Linux CI runner. `git ls-files
 * --eol src/types/database.ts` reports `i/lf  w/crlf`.
 *
 * A structural pattern such as `\{\n {8}Row: \{` therefore matched 77 tables on
 * CI and 0 tables on the founder's machine, because the `\r` sits between the
 * `{` and the `\n` with nothing able to absorb it. Two guards
 * (sitemap-resolves, maintained-aggregates) reported FAIL on Windows and PASS
 * on CI from identical bytes in git.
 *
 * It fails in the DANGEROUS direction, exactly as the regex-literal bug pinned
 * in source-scanner-regex.test.ts did: a scanner that matches nothing finds no
 * problems. Those two guards went red only because each happened to carry a
 * "yielded no tables" sanity check. A scanner without one goes quietly green,
 * which is the shape of a verification that verifies nothing.
 *
 * The fix is at the READ boundary rather than in each pattern, because a
 * pattern-by-pattern sweep has to be repeated for every scanner ever added and
 * a boundary does not. These tests pin the boundary, not the patterns.
 */

const scratch = mkdtempSync(join(tmpdir(), 'eol-scan-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const write = (name: string, body: string) => {
  const p = join(scratch, name)
  writeFileSync(p, body)
  return p
}

describe('the shared guard scanner reads one line ending', () => {
  it('collapses CRLF to LF and leaves a lone CR alone', () => {
    expect(normaliseEol('a\r\nb\r\n')).toBe('a\nb\n')
    expect(normaliseEol('a\nb\n')).toBe('a\nb\n')
  })

  it('hands a guard LF no matter how the file sits on disk', () => {
    const body = ['export const x = {', '  a: 1,', '}', ''].join('\r\n')
    const p = write('crlf.ts', body)

    // The bytes really are CRLF; if this ever stops being true the test below
    // would pass for the wrong reason.
    expect(readFileSync(p, 'utf8')).toContain('\r\n')

    const { raw } = readSource(p)
    expect(raw).not.toContain('\r')
    expect(raw).toBe(['export const x = {', '  a: 1,', '}', ''].join('\n'))
  })

  it('gives a literal-newline pattern the same answer from CRLF and LF', () => {
    // THE LOAD-BEARING ASSERTION, and the exact shape that broke: a `\n`
    // preceded by a literal `\{`, with nothing that can consume the `\r`.
    const pattern = () => /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
    const lfBody = [
      '    Tables: {',
      '      events: {',
      '        Row: {',
      '          id: string',
      '          slug: string',
      '        }',
      '      }',
      '    }',
      '',
    ].join('\n')

    const lf = write('types-lf.ts', lfBody)
    const crlf = write('types-crlf.ts', lfBody.replace(/\n/g, '\r\n'))

    const tables = (path: string) =>
      [...readSource(path).raw.matchAll(pattern())].map(m => m[1])

    expect(tables(lf)).toEqual(['events'])
    expect(tables(crlf)).toEqual(['events'])

    // And the proof that the boundary is what saves it: read the same CRLF
    // file WITHOUT normalising and the pattern sees nothing at all.
    const unnormalised = [...readFileSync(crlf, 'utf8').matchAll(pattern())]
    expect(unnormalised).toHaveLength(0)
  })
})

describe('the fee document is compared on content, never on line endings', () => {
  /**
   * The most dangerous instance of this bug. `pricing-derive --check` compares
   * the derived block in docs/PRICING.md against a block it renders with \n.
   * The document is CRLF on Windows, so the comparison could never succeed and
   * the guard failed on every run claiming the worked figures were wrong.
   *
   * Its stated remedy is `--write`. So the guard whose whole purpose is to
   * protect the single authority for every fee figure was, on that machine,
   * instructing a rewrite of that document over a carriage return.
   */
  it('finds the shipped document already in agreement with the lock block', async () => {
    const { parseLockedValues, renderDerived, readDoc, currentDerived } = await import(
      '../../../scripts/lib/pricing-derive.mjs'
    )
    const root = process.cwd()
    const rendered = renderDerived(parseLockedValues(root))
    const current = currentDerived(readDoc(root))

    expect(current).not.toBeNull()
    // No \r may survive the read, or the comparison below is decided by the
    // checkout rather than by the figures.
    expect(readDoc(root)).not.toContain('\r')
    expect(rendered).not.toContain('\r')
    expect(current.trim()).toBe(rendered.trim())
  })
})

describe('the two guards that were bitten cannot read raw bytes again', () => {
  const guard = (name: string) =>
    readFileSync(join(process.cwd(), 'scripts', 'guards', name), 'utf8')

  it('sitemap-resolves normalises in its one read helper', () => {
    const src = guard('sitemap-resolves.mjs')
    expect(src).toContain('normaliseEol')
    // Its single read boundary, so there is nowhere else for raw bytes to enter.
    expect(src).toContain('normaliseEol(readFileSync(p, ')
  })

  it('maintained-aggregates routes every read through one helper', () => {
    const src = guard('maintained-aggregates.mjs')
    expect(src).toContain('normaliseEol')
    // Exactly one readFileSync CALL is permitted, the one inside readText, so
    // a later edit cannot quietly add a second read that skips the boundary.
    const calls = [...src.matchAll(/readFileSync\(/g)]
    expect(calls).toHaveLength(1)
    expect(src).toContain('const readText = (file) => normaliseEol(readFileSync(file, ')
  })
})
