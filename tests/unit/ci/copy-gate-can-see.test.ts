/**
 * The copy gate must be able to READ the copy it judges.
 *
 * THE FAILURE THIS PREVENTS. copy-tell-gate matched JSX text with
 * `/>(text)</` on a SINGLE line. Prettier wraps any copy longer than the print
 * width onto its own line, so the overwhelming majority of user-facing copy in
 * this repository was invisible to every rule the gate enforces: em-dashes,
 * the banned word, AI tells, fee literals, competitor names. Measured after
 * the fix, 3,134 lines across 488 files had never been readable, including the
 * whole legal corpus (organiser-terms, privacy, terms, refunds).
 *
 * The gate reported "clean" the entire time. A gate that cannot see is worse
 * than no gate, because it is trusted.
 *
 * So this does not test the RULES. It tests the EYES: it plants a known
 * violation in the wrapped shape that was previously invisible, runs the real
 * gate as a subprocess, and asserts it is caught. If the chunker ever narrows
 * again, this goes red immediately rather than in six months.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const SCRATCH_DIR = path.join(ROOT, 'src/__copy_gate_scratch__')
const SCRATCH = path.join(SCRATCH_DIR, 'scratch.tsx')

/** Runs the real gate. Returns its combined output and whether it failed. */
function runGate(): { failed: boolean; output: string } {
  try {
    const out = execFileSync('node', ['scripts/copy-tell-gate.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { failed: false, output: out }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return { failed: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

function plant(body: string): void {
  mkdirSync(SCRATCH_DIR, { recursive: true })
  writeFileSync(SCRATCH, body, 'utf8')
}

afterEach(() => {
  if (existsSync(SCRATCH_DIR)) rmSync(SCRATCH_DIR, { recursive: true, force: true })
})

describe('the copy gate can see wrapped JSX copy', () => {
  it('is clean before anything is planted, so a hit below is attributable', () => {
    const { failed, output } = runGate()
    expect(failed, `the tree is not clean to begin with:\n${output}`).toBe(false)
  })

  it('catches a banned placeholder wrapped onto its own line', () => {
    // EXACTLY the shape that was invisible: text alone between the tags.
    plant(
      [
        'export function Scratch() {',
        '  return (',
        '    <p>',
        '      Insights are coming soon',
        '    </p>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    const { failed, output } = runGate()
    expect(failed, 'the gate did not fail on a wrapped placeholder').toBe(true)
    expect(output).toContain('__copy_gate_scratch__')
    expect(output).toContain('placeholder-copy')
  })

  it('catches an em-dash wrapped onto its own line', () => {
    plant(
      ['export function Scratch() {', '  return (', '    <p>', '      One thing — then another', '    </p>', '  )', '}', ''].join('\n'),
    )
    const { failed, output } = runGate()
    expect(failed).toBe(true)
    expect(output).toContain('em-or-en-dash')
  })

  it('catches copy that mixes text with an interpolation', () => {
    // The second blind spot: any line containing { or < was skipped whole.
    plant(
      [
        'export function Scratch({ n }: { n: number }) {',
        '  return (',
        '    <p>',
        '      {n} tickets, coming soon',
        '    </p>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    const { failed, output } = runGate()
    expect(failed, 'a line with an interpolation is still invisible').toBe(true)
    expect(output).toContain('placeholder-copy')
  })

  it('does NOT flag the same words inside a block comment', () => {
    // A noisy gate gets ignored. Design provenance notes are documentation.
    plant(
      [
        'export function Scratch() {',
        '  return (',
        '    <p>',
        '      {/* This section is coming soon in the design doc sense only,',
        '        * which is a note to a maintainer and not user-facing copy. */}',
        '      A perfectly ordinary sentence.',
        '    </p>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    const { failed, output } = runGate()
    expect(failed, `a block comment was treated as copy:\n${output}`).toBe(false)
  })

  it('is clean again once the scratch file is gone', () => {
    plant(['export function Scratch() {', '  return <p>Fine copy here.</p>', '}', ''].join('\n'))
    rmSync(SCRATCH_DIR, { recursive: true, force: true })
    const { failed } = runGate()
    expect(failed).toBe(false)
  })
})
