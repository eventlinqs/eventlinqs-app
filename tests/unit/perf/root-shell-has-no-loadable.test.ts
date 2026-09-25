import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { importsBareSpecifier } from '../../../scripts/guards/lib/bare-import.mjs'

/**
 * THE MATCHER BEHIND `scripts/guards/no-loadable-in-the-root-shell.mjs`, HELD
 * SHAPE BY SHAPE.
 *
 * This file exists because the guard it backs SHIPPED BLIND for the length of
 * one drill. The first version matched with
 *
 *     new RegExp(`import[^'"]*from\s*['"]${BANNED}['"]`)
 *
 * and in a template literal `\s` is not a recognised escape, so the backslash
 * is dropped and the pattern compiles to `from s*`. It required a literal
 * letter s after the word `from`, matched nothing, and reported
 * `0 of them import 'next/dynamic'. PASS` against a file whose third line was
 * `import dynamic from 'next/dynamic'`.
 *
 * The drill caught it, which is the whole argument for drilling a guard red as
 * well as green. A guard that has never been shown failing is a guard nobody
 * has evidence about. These cases are that evidence, kept, so the next edit to
 * the pattern has to survive them.
 */
describe('the matcher the root-shell guard reads source with', () => {
  it('sees the import shape that actually cost 1306 bytes', () => {
    expect(importsBareSpecifier("import dynamic from 'next/dynamic'", 'next/dynamic')).toBe(true)
  })

  it('sees double quotes, named clauses, side effects and a clause split over lines', () => {
    expect(importsBareSpecifier('import dynamic from "next/dynamic"', 'next/dynamic')).toBe(true)
    expect(importsBareSpecifier("import { a, b } from 'next/dynamic'", 'next/dynamic')).toBe(true)
    expect(importsBareSpecifier("import 'next/dynamic'", 'next/dynamic')).toBe(true)
    expect(importsBareSpecifier("import dynamic\n  from 'next/dynamic'", 'next/dynamic')).toBe(true)
  })

  it('does not see a type-only import, which tsc erases and which ships nothing', () => {
    expect(importsBareSpecifier("import type { X } from 'next/dynamic'", 'next/dynamic')).toBe(false)
  })

  it('does not see a dynamic import, which is the fix rather than an instance of the defect', () => {
    expect(importsBareSpecifier("void import('next/dynamic')", 'next/dynamic')).toBe(false)
  })

  it('matches the specifier exactly, so a neighbouring package is not a violation', () => {
    expect(importsBareSpecifier("import x from 'next/dynamic-thing'", 'next/dynamic')).toBe(false)
    expect(importsBareSpecifier("import x from 'next/image'", 'next/dynamic')).toBe(false)
  })

  /**
   * The bug was not that the pattern was wrong about JavaScript. It was that
   * the pattern never ran as written. A matcher that answers `true` to
   * everything would pass every case above except this one.
   */
  it('is capable of answering false at all', () => {
    expect(importsBareSpecifier("export function MeasurementBoot() {}", 'next/dynamic')).toBe(false)
  })
})

describe('the root layout boundary it protects', () => {
  const boot = readFileSync('src/components/analytics/measurement-boot.tsx', 'utf8')

  it('defers the measurement tree with a bare import, not with next/dynamic', () => {
    expect(importsBareSpecifier(boot, 'next/dynamic')).toBe(false)
    expect(boot).toMatch(/import\('\.\/measurement-stack'\)/)
  })

  it('renders nothing until the chunk has arrived, so the server and the first client render agree', () => {
    expect(boot).toMatch(/return Stack \? <Stack \/> : null/)
  })
})
