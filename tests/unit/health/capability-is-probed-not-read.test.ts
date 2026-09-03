/**
 * A CAPABILITY THAT MATTERS IS PROVED WHERE IT RUNS, NEVER READ OFF A FLAG.
 *
 * Founder condition, 29 August 2026: "Guard the lying flag, because that is the
 * real finding. sharp.format.svg.input reported true while an 8x8 red rectangle
 * failed to round-trip. Anywhere this platform relies on a declared capability
 * rather than a proven one is the same defect waiting."
 *
 * WHAT ACTUALLY HAPPENED, so the rule is anchored to evidence.
 *
 * Inside the Next server runtime, sharp reported
 *
 *     format.svg.input = {"file":true,"buffer":true,"stream":true,...}
 *
 * and then failed to convert an eight by eight red rectangle with "Input buffer
 * contains unsupported image format". That table is static metadata compiled
 * into the package; it is not a live probe of the libvips that actually loaded.
 * Every social card download answered 500 because of the gap between the two.
 *
 * WHAT MADE IT INVISIBLE is the part worth guarding. There WAS a test proving
 * the image pipeline worked, and it passed the whole time, because it runs in
 * vitest: a different process, with different module resolution, from the Next
 * server where the cards are actually rendered. A capability proven in one
 * runtime says nothing about another.
 *
 * SO THE RULE HAS TWO HALVES, and both are checked here:
 *
 *   1. No source file may branch on a declared capability table where a round
 *      trip is available. Reading `sharp.format.<x>.input` to decide whether to
 *      attempt something is the exact defect.
 *   2. The health sentinel, which runs IN the deployed runtime, must carry a
 *      check that proves the image pipeline by round-tripping real bytes.
 *      That is the only place this class can be caught before an organiser
 *      finds it.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../../../scripts/guards/lib/source.mjs'

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const codeOf = (p: string): string => stripComments(readFileSync(p, 'utf8')) as string

/*
 * The patterns are assembled rather than written out, for the same reason the
 * git-env test assembles its own: a literal here would make this file match its
 * own subject matter in any scanner that reads the tree.
 */
const CAPABILITY_READS = [
  // sharp's static format table, the one that lied.
  String.raw`\bformat\s*\.\s*(svg|avif|heif|webp|gif|jpeg|png)\s*\.\s*(input|output)\b`,
  // The same shape via an index.
  String.raw`\bformat\s*\[\s*['"](svg|avif|heif|webp)['"]\s*\]\s*\.\s*(input|output)\b`,
]

describe('declared capabilities', () => {
  const files = sourceFiles(SRC)

  it('there is source to scan', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('no source file decides what it can do by reading a capability table', () => {
    const offenders: string[] = []
    for (const file of files) {
      const code = codeOf(file)
      for (const pattern of CAPABILITY_READS) {
        if (new RegExp(pattern).test(code)) {
          offenders.push(file.replace(process.cwd(), '').replace(/\\/g, '/'))
          break
        }
      }
    }
    expect(
      offenders,
      'These files branch on a DECLARED capability. sharp.format.<x>.input reported true in the ' +
        'Next server runtime while an 8x8 red rectangle failed to round-trip, and every social card ' +
        'download answered 500 because of it. Round-trip real bytes instead, and do it in the runtime ' +
        'that matters. See docs/verification/SOCIAL-CARD-500-ROOT-CAUSE.md.',
    ).toEqual([])
  })

  it('the health sentinel proves the image pipeline by round trip, in the deployed runtime', () => {
    const checks = codeOf(join(SRC, 'lib', 'health', 'checks.ts'))

    // The check must exist and be registered, or it proves nothing.
    expect(checks, 'an image_pipeline check must exist').toContain('image_pipeline')
    expect(checks, 'and it must be registered in the battery').toMatch(
      /timed\(\s*['"]image_pipeline['"]/,
    )

    // It must actually round-trip: decode, encode, and rasterise a card.
    expect(checks, 'it must read bytes back, not a flag').toMatch(/\.metadata\(\)/)
    expect(checks, 'it must encode as well as decode').toMatch(/\.jpeg\(/)
    expect(checks, 'and it must exercise the real card rasteriser').toContain('renderCardPng')

    // And it must NOT be satisfied by the flag that lied.
    expect(checks).not.toMatch(new RegExp(CAPABILITY_READS[0]))
  })
})
