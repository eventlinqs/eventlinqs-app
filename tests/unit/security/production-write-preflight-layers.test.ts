import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PRODUCTION_SUPABASE_REF } from '../../../src/lib/health/critical-env.mjs'

/**
 * A LOWER SOURCE CANNOT RE-POINT THE TARGET.
 *
 * WHY THIS TEST EXISTS (6 September 2026, close-out C2). The preflight built
 * its view of the environment one VARIABLE at a time, each from the highest
 * source that had it. The isolation rule prefers NEXT_PUBLIC_SUPABASE_URL_PREVIEW
 * over NEXT_PUBLIC_SUPABASE_URL, so a process whose own environment named the
 * PRODUCTION url, run from a directory whose .env.local carried the PREVIEW
 * url for TEST, was judged "TEST, proceeding". The script behind the preflight
 * reads process.env, so it would have written to production behind a green
 * preflight.
 *
 * It surfaced as tests/unit/security/production-write-preflight-approval.test.ts
 * failing on any machine whose .env.local carries the PREVIEW pair, and the
 * standing workaround was to park .env.local around every push. The fix takes
 * each pair (url names, key names) WHOLE from the highest source that defines
 * any name in it. These drills plant a .env.local in the harness directory,
 * which the preflight reads first among files, and prove it cannot outrank the
 * process environment, while PREVIEW still wins INSIDE one file.
 *
 * As in the sibling file: nothing here opens a socket, and the only key is a
 * fake token whose payload names the TEST ref, so refFromJwt has a ref to read.
 */

const ROOT = join(__dirname, '..', '..', '..')
const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
const TEST_URL = `https://${TEST_REF}.supabase.co`

/** A token-shaped string carrying only a ref claim. refFromJwt reads segment two as base64 JSON. */
function fakeJwt(ref: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '')
  return `${b64({ alg: 'none' })}.${b64({ ref, role: 'service_role' })}.x`
}

let dir: string
let harness: string

const PREFLIGHT_URL = pathToFileURL(join(ROOT, 'scripts', 'lib', 'production-write-preflight.mjs')).href
const HARNESS = `
import { assertNotProduction } from ${JSON.stringify(PREFLIGHT_URL)}
const out = assertNotProduction()
console.log('PROCEEDED override=' + out.override)
`

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'el-preflight-layers-'))
  harness = join(dir, 'harness.mjs')
  writeFileSync(harness, HARNESS, 'utf8')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function runHarness(args: string[], env: Record<string, string> = {}) {
  const clean = { ...process.env }
  for (const name of [
    'ALLOW_PRODUCTION_SUPABASE',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL_PREVIEW',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY_PREVIEW',
    'VERCEL_ENV',
    'NEXT_PUBLIC_VERCEL_ENV',
  ]) {
    delete clean[name]
  }
  const result = spawnSync(process.execPath, [...args, harness], { cwd: dir, encoding: 'utf8', env: { ...clean, ...env } })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

/** The harness directory's own .env.local, which the preflight reads before the repository's. */
function plantEnvLocal(lines: string[]) {
  writeFileSync(join(dir, '.env.local'), `${lines.join('\n')}\n`, 'utf8')
}

function writeEnvFile(name: string, lines: string[]) {
  writeFileSync(join(dir, name), `${lines.join('\n')}\n`, 'utf8')
  return name
}

/** Both key names, TEST, so the key pair never resolves from the developer's own file. */
const TEST_KEYS = [`SUPABASE_SERVICE_ROLE_KEY=${fakeJwt(TEST_REF)}`, `SUPABASE_SERVICE_ROLE_KEY_PREVIEW=${fakeJwt(TEST_REF)}`]

describe('production write preflight: sources are taken whole, highest first', () => {
  test('a --env-file naming production is refused even when .env.local carries a PREVIEW url for TEST', () => {
    plantEnvLocal([`NEXT_PUBLIC_SUPABASE_URL_PREVIEW=${TEST_URL}`, ...TEST_KEYS])
    const file = writeEnvFile('prod.env', [`NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`])

    const { status, out } = runHarness([`--env-file=${file}`])

    expect(status).toBe(1)
    expect(out).toContain('REFUSED BY THE PRODUCTION WRITE PREFLIGHT')
    expect(out).toContain(`Resolved project: ${PRODUCTION_SUPABASE_REF}`)
    expect(out).toContain('NEXT_PUBLIC_SUPABASE_URL via the process environment')
    expect(out).not.toContain('PROCEEDED')
  })

  test('a shell variable naming production is refused for the same reason', () => {
    plantEnvLocal([`NEXT_PUBLIC_SUPABASE_URL_PREVIEW=${TEST_URL}`, ...TEST_KEYS])

    const { status, out } = runHarness([], { NEXT_PUBLIC_SUPABASE_URL: PROD_URL })

    expect(status).toBe(1)
    expect(out).toContain(`Resolved project: ${PRODUCTION_SUPABASE_REF}`)
    expect(out).not.toContain('PROCEEDED')
  })

  test('inside ONE file PREVIEW still wins, as it does for Next with one .env.local', () => {
    plantEnvLocal([`NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`, `NEXT_PUBLIC_SUPABASE_URL_PREVIEW=${TEST_URL}`, ...TEST_KEYS])

    const { status, out } = runHarness([])

    expect(status).toBe(0)
    expect(out).toContain('PROCEEDED override=false')
    expect(out).toContain(`project ${TEST_REF} (not production)`)
    // The origin is the file, shown relative to the repository (the harness
    // directory sits outside it, so the path climbs), never the shell.
    expect(out).toMatch(/NEXT_PUBLIC_SUPABASE_URL_PREVIEW via \S*\/\.env\.local/)
  })

  test('the control: one file naming only production is refused', () => {
    plantEnvLocal([`NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}`, ...TEST_KEYS])

    const { status, out } = runHarness([])

    expect(status).toBe(1)
    expect(out).toContain(`Resolved project: ${PRODUCTION_SUPABASE_REF}`)
    expect(out).toMatch(/NEXT_PUBLIC_SUPABASE_URL via \S*\/\.env\.local/)
  })
})
