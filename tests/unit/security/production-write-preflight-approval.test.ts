import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PRODUCTION_SUPABASE_REF } from '../../../src/lib/health/critical-env.mjs'

/**
 * THE PRODUCTION WRITE APPROVAL CANNOT BE PARKED IN A FILE.
 *
 * WHY THIS TEST EXISTS. scripts/lib/production-write-preflight.mjs carried a
 * comment stating that ALLOW_PRODUCTION_SUPABASE "is read from the real
 * environment ONLY, never from a file, so the approval is per run and cannot be
 * parked in .env.local and forgotten". The mechanism behind that sentence was
 * keeping the name off the module's own file-reader list, which is necessary and
 * is not sufficient: `node --env-file=<file>` loads the file's variables into
 * process.env before the script runs, so a bare process.env read cannot tell a
 * shell approval from a file approval.
 *
 * That was not theoretical. The founder runbook drives the production purge as
 * `node --env-file=<production env file> scripts/verify/seeded-purge-rehearsal.mjs`,
 * which is precisely the invocation that would have loaded a parked approval and
 * turned a per-run decision into a permanent one, silently, inside the control
 * written to prevent exactly that.
 *
 * These are DRILLS, not assertions about the source text. Each one spawns a real
 * child process with a real command line and reads what the preflight actually
 * did, because the failure being guarded against is a runtime behaviour and a
 * test that reads the file would have passed against the broken version too.
 *
 * The fixture never opens a socket. assertNotProduction() decides and exits
 * before any client is constructed, so a production-shaped URL here is a string
 * in a temp file and nothing more. No key material is used: the rule reads the
 * project ref out of the URL, and the ref is documented in refs.mjs as
 * non-secret because it is compiled into every production browser bundle.
 */

const ROOT = join(__dirname, '..', '..', '..')
const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`

let dir: string
let harness: string

/**
 * A script that runs the preflight and reports what it decided.
 *
 * The specifier is a file:// URL, not a Windows path. An ESM import of `C:/...`
 * is rejected as an unsupported URL scheme, and the failure looks like the
 * preflight refusing when it is really the loader, which would make this drill
 * pass for the wrong reason if the assertions were any looser.
 */
const PREFLIGHT_URL = pathToFileURL(
  join(ROOT, 'scripts', 'lib', 'production-write-preflight.mjs'),
).href

const HARNESS = `
import { assertNotProduction } from ${JSON.stringify(PREFLIGHT_URL)}
const out = assertNotProduction()
console.log('PROCEEDED override=' + out.override)
`

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'el-preflight-drill-'))
  harness = join(dir, 'harness.mjs')
  writeFileSync(harness, HARNESS, 'utf8')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Run the harness with a chosen command line and environment.
 *
 * The parent's own ALLOW_PRODUCTION_SUPABASE and Supabase variables are stripped
 * from every child, so a developer who happens to have them exported cannot make
 * these drills pass or fail for the wrong reason.
 */
function runHarness(args: string[], env: Record<string, string> = {}) {
  const clean = { ...process.env }
  delete clean.ALLOW_PRODUCTION_SUPABASE
  delete clean.NEXT_PUBLIC_SUPABASE_URL
  delete clean.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
  delete clean.SUPABASE_URL
  delete clean.SUPABASE_SERVICE_ROLE_KEY
  delete clean.SUPABASE_SERVICE_ROLE_KEY_PREVIEW
  delete clean.VERCEL_ENV
  delete clean.NEXT_PUBLIC_VERCEL_ENV

  const result = spawnSync(process.execPath, [...args, harness], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...clean, ...env },
  })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

function writeEnvFile(name: string, lines: string[]) {
  const file = join(dir, name)
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
  return name
}

describe('production write preflight: the approval must come from the shell', () => {
  test('an approval parked in a --env-file is REFUSED, and says why', () => {
    const file = writeEnvFile('parked.env', [
      `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`,
      'ALLOW_PRODUCTION_SUPABASE=1',
    ])

    const { status, out } = runHarness([`--env-file=${file}`])

    expect(status).toBe(1)
    expect(out).toContain('REFUSED BY THE PRODUCTION WRITE PREFLIGHT')
    expect(out).toContain('IS SET, AND IT IS BEING IGNORED ON PURPOSE')
    expect(out).toContain(file)
    expect(out).not.toContain('PROCEEDED')
    expect(out).not.toContain('APPROVED BY OVERRIDE')
  })

  test('the spaced form --env-file <path> is closed too', () => {
    const file = writeEnvFile('parked-spaced.env', [
      `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`,
      'ALLOW_PRODUCTION_SUPABASE=1',
    ])

    const { status, out } = runHarness(['--env-file', file])

    expect(status).toBe(1)
    expect(out).toContain('IS SET, AND IT IS BEING IGNORED ON PURPOSE')
  })

  test('--env-file-if-exists is closed too', () => {
    const file = writeEnvFile('parked-if-exists.env', [
      `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`,
      'ALLOW_PRODUCTION_SUPABASE=1',
    ])

    const { status, out } = runHarness([`--env-file-if-exists=${file}`])

    expect(status).toBe(1)
    expect(out).toContain('IS SET, AND IT IS BEING IGNORED ON PURPOSE')
  })

  test('a shell approval alongside a clean --env-file still WORKS, and says so loudly', () => {
    // The path the runbook actually walks: production credentials in the file,
    // approval given in the shell for this one run. Closing the hole must not
    // close the door.
    const file = writeEnvFile('clean.env', [`NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`])

    const { status, out } = runHarness([`--env-file=${file}`], {
      ALLOW_PRODUCTION_SUPABASE: '1',
    })

    expect(status).toBe(0)
    expect(out).toContain('PRODUCTION WRITE APPROVED BY OVERRIDE')
    expect(out).toContain(PRODUCTION_SUPABASE_REF)
    expect(out).toContain('PROCEEDED override=true')
  })

  test('no approval anywhere against a production target is refused, unchanged', () => {
    const file = writeEnvFile('bare.env', [`NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`])

    const { status, out } = runHarness([`--env-file=${file}`])

    expect(status).toBe(1)
    expect(out).toContain('REFUSED BY THE PRODUCTION WRITE PREFLIGHT')
    // The parked wording must NOT appear when nothing was parked, or the message
    // starts blaming a file the person never wrote to.
    expect(out).not.toContain('IS SET, AND IT IS BEING IGNORED ON PURPOSE')
  })

  test('a non-production target is untouched by any of this', () => {
    // A TEST env file that happens to carry the approval must not be punished:
    // the approval is irrelevant there and refusing would break ordinary work.
    const file = writeEnvFile('test-target.env', [
      'NEXT_PUBLIC_SUPABASE_URL=https://vkapkibzokmfaxqogypq.supabase.co',
      'ALLOW_PRODUCTION_SUPABASE=1',
    ])

    const { status, out } = runHarness([`--env-file=${file}`])

    expect(status).toBe(0)
    expect(out).toContain('PROCEEDED override=false')
    expect(out).toContain('not production')
  })
})

describe('the measurement the fix depends on', () => {
  /**
   * The fix reads process.execArgv, which is only sufficient because a file
   * cannot inject --env-file by another route. Node does not publish the
   * NODE_OPTIONS refusal on
   * https://nodejs.org/api/cli.html#--env-fileconfig (fetched 15 August 2026),
   * so it is measured here rather than cited. If a future runtime starts
   * allowing it, this goes red and the fix needs a second reader.
   */
  test('--env-file is not accepted inside NODE_OPTIONS', () => {
    const result = spawnSync(process.execPath, ['-e', 'console.log("started")'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--env-file=whatever.env' },
    })

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('is not allowed in NODE_OPTIONS')
  })

  /**
   * Node documents this precedence, and the fix relies on it being the shell
   * that wins so that removing the line from the file is a complete remedy:
   * "If the same variable is defined in the environment and in the file, the
   * value from the environment takes precedence."
   * https://nodejs.org/api/cli.html#--env-fileconfig (fetched 15 August 2026)
   */
  test('a real environment variable beats the same name in a --env-file', () => {
    const file = join(dir, 'precedence.env')
    writeFileSync(file, 'EL_DRILL_PROBE=from_file\n', 'utf8')

    const result = spawnSync(
      process.execPath,
      [`--env-file=${file}`, '-e', 'process.stdout.write(String(process.env.EL_DRILL_PROBE))'],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, EL_DRILL_PROBE: 'from_shell' } },
    )

    expect(result.stdout).toBe('from_shell')
  })
})
