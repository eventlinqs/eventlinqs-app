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
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')

/**
 * THE SCRATCH LIVES OUTSIDE THE REPOSITORY. This used to be
 * src/__copy_gate_scratch__/, and planting a file inside the tree that other
 * tests walk cost twice:
 *
 *   1. Any test walking src/ could list this file and then read it after the
 *      afterEach below deleted it. That throws ENOENT, and when it happens at
 *      module scope vitest reports the whole file as "no tests" rather than as a
 *      failure, so the suite went green having run LESS. Two test files were hit.
 *   2. An interrupted run left the scratch behind, and the copy gate then failed
 *      on a tree that was genuinely clean.
 *
 * In the system temp directory neither is possible: nothing in this repository
 * walks it, and a leftover cannot be seen by a gate run that does not opt in.
 * The gate reads it because COPY_GATE_EXTRA_DIR points there, an ADDITIVE input
 * that can only make the gate scan more (see scripts/copy-tell-gate.mjs).
 *
 * The directory keeps the name `__copy_gate_scratch__` because the assertions
 * below match on it to prove the gate reported THIS file and not another.
 *
 * No filesystem call happens at module scope here, deliberately: path.join and
 * tmpdir() cannot throw, so this file cannot fail to collect on a bad temp dir.
 */
const SCRATCH_ROOT = path.join(tmpdir(), `eventlinqs-copy-gate-${process.pid}`)
const SCRATCH_DIR = path.join(SCRATCH_ROOT, '__copy_gate_scratch__')
const SCRATCH = path.join(SCRATCH_DIR, 'scratch.tsx')

// Each case spawns the real gate, which walks 787 files. Under full-suite
// parallel load that is ~7s per run, well past vitest's 5s default, and the
// first full run of this suite timed out on exactly that.
const GATE_TIMEOUT_MS = 60_000

/** Runs the real gate. Returns its combined output and whether it failed. */
function runGate(): { failed: boolean; output: string } {
  try {
    const out = execFileSync('node', ['scripts/copy-tell-gate.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Point the gate at the out-of-tree scratch. Additive: src/ is scanned
      // either way, so this cannot hide anything, only reveal the planted file.
      env: { ...process.env, COPY_GATE_EXTRA_DIR: SCRATCH_DIR },
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
  // The whole temp root, not just the scratch directory, so nothing is left in
  // the system temp directory either.
  if (existsSync(SCRATCH_ROOT)) rmSync(SCRATCH_ROOT, { recursive: true, force: true })
})

describe('the copy gate can see wrapped JSX copy', () => {
  it('is clean before anything is planted, so a hit below is attributable', () => {
    const { failed, output } = runGate()
    expect(failed, `the tree is not clean to begin with:\n${output}`).toBe(false)
  }, GATE_TIMEOUT_MS)

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
  }, GATE_TIMEOUT_MS)

  it('catches an em-dash wrapped onto its own line', () => {
    plant(
      ['export function Scratch() {', '  return (', '    <p>', '      One thing — then another', '    </p>', '  )', '}', ''].join('\n'),
    )
    const { failed, output } = runGate()
    expect(failed).toBe(true)
    expect(output).toContain('em-or-en-dash')
  }, GATE_TIMEOUT_MS)

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
  }, GATE_TIMEOUT_MS)

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
  }, GATE_TIMEOUT_MS)

  it('is clean again once the scratch file is gone', () => {
    plant(['export function Scratch() {', '  return <p>Fine copy here.</p>', '}', ''].join('\n'))
    rmSync(SCRATCH_DIR, { recursive: true, force: true })
    const { failed } = runGate()
    expect(failed).toBe(false)
  }, GATE_TIMEOUT_MS)
})
