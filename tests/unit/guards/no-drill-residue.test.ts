import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  JOURNAL_DIRNAME,
  close,
  digest,
  open,
  pending,
  restoreAll,
} from '../../../scripts/verify/lib/drill-journal.mjs'
import { stripComments } from '../../../scripts/lib/js-source.mjs'

/**
 * THE `finally` THAT WAS NOT CRASH SAFETY.
 *
 * scripts/verify/guard-failure-drills.mjs mutates a real source file to prove a
 * guard can fail and restores it in a `finally`. Its header asserted, in these
 * words, that this meant "an interrupted run cannot leave a mutated tree
 * behind". A `finally` runs when a block exits and never when the process is
 * killed, and the harness has been killed mid-drill twice:
 *
 *   16 September 2026, power loss. `process.exit(1)` stayed in
 *   scripts/guards/no-control-characters.mjs and went into commit 1aa059f6. The
 *   guard then exited 1 with no output at all, before reading a file, so every
 *   push was refused at the guards step with something that read exactly like a
 *   real finding. It took a day and commit b3cc6317 to undo by hand.
 *
 *   17 September 2026, the run killed on a usage limit.
 *   `<LoginForm googleEnabled={true} />` stayed in the login page, hardcoding an
 *   auth provider ON for every visitor whether or not it is configured, which is
 *   the 2 August 2026 production defect auth-provider-guard exists to stop.
 *
 * The second is the argument for a mechanism: it happened the day after the
 * first was diagnosed and written up at length. The moment the lesson applies is
 * the moment the process is no longer running, so no amount of care reaches it.
 *
 * These tests hold the two halves of the replacement. The JOURNAL, which records
 * the original bytes before the mutation so a crash can only ever ADD evidence,
 * and the WIRING, which keeps the harness journalling and the guard registered.
 * The guard's own red-and-green proof is driven, not unit-tested: the drills are
 * in C:\dev\EVIDENCE\MONEY\drill-residue-drills.txt.
 */

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'drill-journal-'))
  return root
}

function seed(root: string, rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

describe('the journal records the original bytes before the damage', () => {
  test('an entry holds the file bytes and their digest, and pending() finds it', () => {
    const root = tempRoot()
    try {
      seed(root, 'src/a.tsx', 'ORIGINAL\n')
      const handle = open(root, 'src/a.tsx', { drill: 'a drill', planted: 'SABOTAGE' })
      expect(existsSync(handle.entryPath)).toBe(true)

      const [entry] = pending(root)
      expect(entry.file).toBe('src/a.tsx')
      expect(entry.drill).toBe('a drill')
      expect(entry.planted).toBe('SABOTAGE')
      expect(Buffer.from(entry.bytes, 'base64').toString('utf8')).toBe('ORIGINAL\n')
      expect(entry.sha256).toBe(digest(Buffer.from('ORIGINAL\n')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  /*
   * THE VERCEL CASE, AND THE REASON IT IS A TEST RATHER THAN A COMMENT.
   * .drill-journal/ is gitignored, so it is never uploaded, and a guard that
   * threw on a missing directory would fail every production build. Four
   * deployments have been lost to a build-time script reading a file that was
   * never uploaded (see .vercelignore's own header), so "absent is the clean
   * answer" is asserted rather than assumed.
   */
  test('an absent journal directory is clean, never an error', () => {
    const root = tempRoot()
    try {
      expect(existsSync(join(root, JOURNAL_DIRNAME))).toBe(false)
      expect(pending(root)).toEqual([])
      expect(restoreAll(root)).toEqual({ restored: [], stuck: [] })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('closing an entry is earned by observing the file, not by asking nicely', () => {
  test('a correct restore drops the entry', () => {
    const root = tempRoot()
    try {
      const path = seed(root, 'src/a.tsx', 'ORIGINAL\n')
      const handle = open(root, 'src/a.tsx')
      writeFileSync(path, 'SABOTAGED\n')
      writeFileSync(path, handle.original)

      expect(close(root, handle)).toEqual({ ok: true })
      expect(pending(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  /*
   * THE HALF-WRITE. Three worktrees share this disk and the push gate stops
   * under 5 GB free. A `writeFileSync` that did not land, with the entry dropped
   * on faith, would reproduce the exact defect this module exists to end: a tree
   * that is mutated and no longer says so.
   */
  test('a file that did not come back keeps its entry, so the alarm stands', () => {
    const root = tempRoot()
    try {
      const path = seed(root, 'src/a.tsx', 'ORIGINAL\n')
      const handle = open(root, 'src/a.tsx')
      writeFileSync(path, 'SABOTAGED\n')

      const result = close(root, handle)
      expect(result.ok).toBe(false)
      expect(result.why).toContain('not back to its recorded bytes')
      expect(pending(root)).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('restoreAll is the one-command undo the guard points at', () => {
  test('it puts the file back byte-exactly, CRLF included, and clears the entry', () => {
    const root = tempRoot()
    try {
      // CRLF on purpose: this repository holds CRLF in the working tree and a
      // restore that normalised line endings would leave every drilled file
      // "modified" for ever.
      const original = 'line one\r\nline two\r\n'
      const path = seed(root, 'src/a.tsx', original)
      open(root, 'src/a.tsx')
      writeFileSync(path, 'line one\nSABOTAGE\n')

      const { restored, stuck } = restoreAll(root)
      expect(stuck).toEqual([])
      expect(restored).toEqual(['src/a.tsx'])
      expect(readFileSync(path).equals(Buffer.from(original))).toBe(true)
      expect(pending(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('it is idempotent, so running it on a clean tree does nothing', () => {
    const root = tempRoot()
    try {
      const path = seed(root, 'src/a.tsx', 'ORIGINAL\n')
      open(root, 'src/a.tsx')
      writeFileSync(path, 'SABOTAGED\n')

      expect(restoreAll(root).restored).toEqual(['src/a.tsx'])
      expect(restoreAll(root)).toEqual({ restored: [], stuck: [] })
      expect(readFileSync(path, 'utf8')).toBe('ORIGINAL\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  /*
   * A CORRUPT ENTRY IS NOT A LICENCE TO GUESS. If the recorded bytes do not
   * hash to the recorded digest, the entry cannot say what the file used to be,
   * and writing them anyway would put unverifiable content into source. It stays
   * stuck, so the guard keeps objecting and a person is told to use git.
   */
  test('an entry whose bytes do not match its digest is refused and kept', () => {
    const root = tempRoot()
    try {
      const path = seed(root, 'src/a.tsx', 'ORIGINAL\n')
      const handle = open(root, 'src/a.tsx')
      const entry = JSON.parse(readFileSync(handle.entryPath, 'utf8'))
      entry.bytes = Buffer.from('NOT WHAT THE DIGEST SAYS\n').toString('base64')
      writeFileSync(handle.entryPath, JSON.stringify(entry))
      writeFileSync(path, 'SABOTAGED\n')

      const { restored, stuck } = restoreAll(root)
      expect(restored).toEqual([])
      expect(stuck).toHaveLength(1)
      expect(stuck[0].why).toContain('do not match the recorded sha256')
      expect(readFileSync(path, 'utf8')).toBe('SABOTAGED\n')
      expect(pending(root)).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  /*
   * The process died between mkdirSync and the end of writeFileSync. The file
   * the entry names may well be mutated, and the one move that is never
   * available is calling that tree clean.
   */
  test('a half-written entry is reported, never skipped', () => {
    const root = tempRoot()
    try {
      mkdirSync(join(root, JOURNAL_DIRNAME), { recursive: true })
      writeFileSync(join(root, JOURNAL_DIRNAME, 'torn.json'), '{"file": "src/a.tsx", "byt')

      const [entry] = pending(root)
      expect(entry.file).toBeNull()
      expect(entry.unreadable).toBeTruthy()

      const { stuck } = restoreAll(root)
      expect(stuck).toHaveLength(1)
      expect(stuck[0].why).toContain('could not be read')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

/*
 * THE WIRING. A journal nothing writes to and a guard nothing runs are both
 * inert, and both failures look exactly like a pass. These read the real files.
 */
describe('the mechanism stays wired in', () => {
  const ROOT = join(__dirname, '..', '..', '..')
  const HARNESS = readFileSync(join(ROOT, 'scripts', 'verify', 'guard-failure-drills.mjs'), 'utf8')
  const HARNESS_CODE = stripComments(HARNESS)

  test('the guard is registered in run-guards.mjs, so prebuild runs it', () => {
    const runner = readFileSync(join(ROOT, 'scripts', 'guards', 'run-guards.mjs'), 'utf8')
    expect(stripComments(runner)).toContain("'scripts/guards/no-drill-residue.mjs'")
  })

  test('.drill-journal/ is gitignored, so an entry can never be committed', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    expect(gitignore).toMatch(/^\.drill-journal\/$/m)
  })

  test('the harness opens a journal entry and closes it in the finally', () => {
    expect(HARNESS_CODE).toContain('journal.open(ROOT, drill.file')
    expect(HARNESS_CODE).toContain('journal.close(ROOT, handle)')
  })

  /*
   * ORDER MATTERS AND IS THE WHOLE POINT. Journalling AFTER the mutation leaves
   * the same unrecorded window the `finally` left, so the assertion is on the
   * position, not merely the presence.
   */
  test('the entry is written BEFORE the file is mutated', () => {
    const opened = HARNESS_CODE.indexOf('journal.open(ROOT, drill.file')
    const mutated = HARNESS_CODE.indexOf('writeFileSync(path, original.replace(anchor, drill.replace))')
    expect(opened).toBeGreaterThan(-1)
    expect(mutated).toBeGreaterThan(-1)
    expect(opened).toBeLessThan(mutated)
  })

  /*
   * `--restore` IS REACHED WHEN THINGS HAVE ALREADY GONE WRONG. Everything
   * further down this harness resolves an effective migration, asks Vercel for a
   * deployment held in ERROR, reads the CLI login and lists pull requests. A
   * repair that needs a token and a network is unavailable on exactly the machine
   * that needs it: the one whose power just failed.
   */
  test('--restore short-circuits before the harness touches the network', () => {
    const restore = HARNESS_CODE.indexOf("process.argv.includes('--restore')")
    const firstNetwork = HARNESS_CODE.indexOf('effectiveDefinitionOf(')
    expect(restore).toBeGreaterThan(-1)
    expect(firstNetwork).toBeGreaterThan(-1)
    expect(restore).toBeLessThan(firstNetwork)
  })

  /*
   * The harness repairs a previous run's damage before planting anything. A
   * drill that read a mutated file as its "original" would record the sabotage
   * as the thing to restore TO, and the residue would become permanent at the
   * moment it was next drilled.
   */
  /*
   * THE BUILD HOST HAS AN EMPTY .git, AND SEVEN SCRIPTS ONCE REACHED FOR GIT
   * THERE. One killed a deployment. So the clause that finds committed residue
   * enumerates the tree with the git-free walk (close-out F2.2) and only the
   * "is it tracked" clause needs a repository. Swapping the walk back to
   * `git ls-files` would pass every local gate and lose clause 3 on Vercel,
   * which is the failure shape this platform has paid for four times.
   */
  test('the tree is enumerated without git, so clause 3 survives the build host', () => {
    const guard = readFileSync(join(ROOT, 'scripts', 'guards', 'no-drill-residue.mjs'), 'utf8')
    const code = stripComments(guard)
    expect(code).toContain('walkTrackedFiles(ROOT)')
    // git appears exactly once, for the clause that cannot be answered without
    // it, and it is gated on availability rather than attempted and caught.
    expect(code).toContain('gitAvailability(ROOT)')
    expect(code.match(/execFileSync\('git'/g) ?? []).toHaveLength(1)
  })

  test('the git need is declared, and the declaration names what still runs without it', () => {
    const registry = readFileSync(join(ROOT, 'scripts', 'guards', 'lib', 'build-host-needs.mjs'), 'utf8')
    expect(registry).toContain("'scripts/guards/no-drill-residue.mjs'")
  })

  /*
   * THE ANCHOR IS A SHAPE RATHER THAN ONE SPELLING, and the reason is the merge
   * of 19 September 2026. Both lanes added a `--only` filter to the harness on
   * the same day, in the same file, and the two declarations collided on
   * `onlyAt`, so keeping both was a SyntaxError rather than a choice. The
   * surviving one is lane B's superset (a comma separated list, matching a guard
   * path as well as a drill name) and its loop variable is `selected`, so this
   * assertion's literal `SELECTED` matched nothing and the test failed on an
   * ordering that had not moved.
   *
   * What it is ACTUALLY about is the ordering: the harness must restore a
   * previous interrupted run BEFORE it starts drilling, or a killed run's
   * residue is still in the tree while the next run mutates it. That is what is
   * pinned. The name of the collection it iterates is not, and hard-coding one
   * spelling of it turned a naming detail into a red suite.
   */
  test('the harness restores a previous interrupted run before it drills', () => {
    const heals = HARNESS_CODE.indexOf('journal.restoreAll(ROOT)')
    const loop = HARNESS_CODE.search(/for \(const drill of (SELECTED|selected)\)/)
    expect(heals).toBeGreaterThan(-1)
    expect(loop).toBeGreaterThan(-1)
    expect(heals).toBeLessThan(loop)
  })
})
