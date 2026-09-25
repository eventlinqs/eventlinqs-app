import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * THE DRILL FOR shared-log-is-opened-for-append.
 *
 * A guard is worth what its failure path is worth, so this runs the REAL guard
 * against real files: a truncating open beside a `stdio` option must go RED and
 * name the file and the line, and the same file opening for append must go
 * GREEN. It also pins the two judgements the guard makes that are easy to lose
 * in a refactor - prose is not a call site, and a file that starts no process is
 * out of scope however it opens its own files.
 *
 * The scratch call sites live in a temp directory and the guard is pointed at it
 * with `--root`, so the drill never mutates the repository. That matters on a
 * machine running three build lanes against one tree each.
 */

const ROOT = join(__dirname, '..', '..', '..')
const GUARD = join(ROOT, 'scripts', 'guards', 'shared-log-is-opened-for-append.mjs')

/** Writes one scratch file, runs the guard over its directory, cleans up. */
function drill(name: string, lines: string[]): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'eventlinqs-append-guard-'))
  try {
    writeFileSync(join(dir, name), `${lines.join('\n')}\n`, 'utf8')
    const r = spawnSync(process.execPath, [GUARD, '--root', dir], { cwd: ROOT, encoding: 'utf8' })
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('shared-log-is-opened-for-append, drilled in both directions', () => {
  test('GREEN on this repository as it stands', () => {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8' })
    expect(`${r.stdout ?? ''}${r.stderr ?? ''}`).toContain('PASS')
    expect(r.status).toBe(0)
  })

  test('RED when a descriptor handed to a child is opened truncating, and it names the line', () => {
    const { code, out } = drill('offender.mjs', [
      "import { openSync } from 'node:fs'",
      "import { spawn } from 'node:child_process'",
      "const fd = openSync('server.log', 'w')",
      "spawn('node', ['server.mjs'], { stdio: ['ignore', fd, fd] })",
    ])
    expect(code).toBe(1)
    expect(out).toContain('FAIL')
    expect(out).toContain('offender.mjs:3')
    expect(out).toContain("'w'")
  })

  test("RED on 'w+' too: the plus adds reading, it does not move the writes to the end", () => {
    const { code, out } = drill('offender.mjs', [
      "import { openSync } from 'node:fs'",
      "import { spawn } from 'node:child_process'",
      "const fd = openSync('server.log', 'w+')",
      "spawn('node', [], { stdio: ['ignore', fd, fd] })",
    ])
    expect(code).toBe(1)
    expect(out).toContain("'w+'")
  })

  test('GREEN on the same file once it opens for append', () => {
    const { code, out } = drill('fixed.mjs', [
      "import { openSync, writeFileSync } from 'node:fs'",
      "import { spawn } from 'node:child_process'",
      "writeFileSync('server.log', '')",
      "const fd = openSync('server.log', 'a')",
      "spawn('node', ['server.mjs'], { stdio: ['ignore', fd, fd] })",
    ])
    expect(out).toContain('PASS')
    expect(code).toBe(0)
  })

  test('a file that starts no process is out of scope, however it opens its own files', () => {
    const { code } = drill('own-file.mjs', [
      "import { openSync } from 'node:fs'",
      "const fd = openSync('report.json', 'w')",
      'export default fd',
    ])
    expect(code).toBe(0)
  })

  test('prose is not a call site: a doc comment quoting the bad form does not fail', () => {
    const { code, out } = drill('documented.mjs', [
      '/**',
      " * WHY THIS IS NOT openSync(path, 'w'): a truncating descriptor keeps its own",
      ' * offset, so a second writer gets overwritten.',
      ' */',
      "import { openSync } from 'node:fs'",
      "import { spawn } from 'node:child_process'",
      "const fd = openSync('server.log', 'a')",
      "spawn('node', [], { stdio: ['ignore', fd, fd] })",
    ])
    expect(out).toContain('PASS')
    expect(code).toBe(0)
  })

  test('a read-only descriptor is not a writer and is left alone', () => {
    const { code } = drill('reader.mjs', [
      "import { openSync } from 'node:fs'",
      "import { spawn } from 'node:child_process'",
      "const fd = openSync('input.txt', 'r')",
      "spawn('node', [], { stdio: [fd, 'inherit', 'inherit'] })",
    ])
    expect(code).toBe(0)
  })
})
