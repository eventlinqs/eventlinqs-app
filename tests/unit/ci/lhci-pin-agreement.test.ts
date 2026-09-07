import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LHCI_SPEC } from '../../../scripts/ops/pre-push-gate.mjs'

/**
 * ONE LIGHTHOUSE, PINNED IN THREE PLACES THAT MUST AGREE.
 *
 * The Lighthouse CI package is named in .github/workflows/lighthouse.yml (the
 * runner), scripts/ops/pre-push-gate.mjs (the local gate collects with the
 * Lighthouse that spec bundles) and scripts/admin-lighthouse.mjs. The local
 * gate exists so a push measures what CI will measure; if the three pins drift,
 * the machine and the runner judge different Lighthouses and a number quoted
 * from one means nothing about the other. Close-out C8.1 (7 September 2026)
 * moved all three from 0.14.x (Lighthouse 12.1.0) to 0.15.1 (12.6.1) and this
 * test keeps them together from now on.
 */
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('the @lhci/cli pin', () => {
  test('is an exact version, not a range, so the runner and the machine cannot resolve differently', () => {
    expect(LHCI_SPEC).toMatch(/^@lhci\/cli@\d+\.\d+\.\d+$/)
  })

  test('the workflow names the same spec on collect, assert and upload', () => {
    const yml = read('.github/workflows/lighthouse.yml')
    const specs = [...yml.matchAll(/@lhci\/cli@[\w.-]+/g)].map((m) => m[0])
    expect(specs.length).toBeGreaterThanOrEqual(3)
    expect(new Set(specs)).toEqual(new Set([LHCI_SPEC]))
  })

  test('the admin Lighthouse script names the same spec', () => {
    const specs = [...read('scripts/admin-lighthouse.mjs').matchAll(/@lhci\/cli@[\w.-]+/g)].map((m) => m[0])
    expect(specs).toEqual([LHCI_SPEC])
  })

  test('lighthouserc.json records the same pin in its version note', () => {
    const rc = JSON.parse(read('lighthouserc.json')) as { ci: { collect: { _lighthouse_version_note: string } } }
    expect(rc.ci.collect._lighthouse_version_note).toContain(LHCI_SPEC.replace('@lhci/cli@', '@lhci/cli '))
  })
})
