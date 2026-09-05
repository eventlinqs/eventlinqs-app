import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { classifyKeys, judge, probeGeocoding, PROBE_ADDRESS } from '../../../scripts/guards/lib/geocoding-key-posture.mjs'

const ROOT = path.resolve(__dirname, '../../..')

/**
 * The guard's three shapes and its verdicts, with the probe stubbed. The
 * BROWSER shape is the one found in every environment on 4 September 2026.
 */
describe('classifyKeys', () => {
  test('absent, browser-as-server, and distinct', () => {
    expect(classifyKeys(undefined, 'browser-key-fixture').shape).toBe('ABSENT')
    expect(classifyKeys('  ', 'browser-key-fixture').shape).toBe('ABSENT')
    expect(classifyKeys('browser-key-fixture', 'browser-key-fixture').shape).toBe('BROWSER')
    expect(classifyKeys('server-key-fixture', 'browser-key-fixture').shape).toBe('DISTINCT')
    expect(classifyKeys('server-key-fixture', undefined).shape).toBe('DISTINCT')
  })

  test('the fingerprint is not the key', () => {
    const c = classifyKeys('server-key-fixture-value', 'browser-key-fixture')
    expect(c.serverFp).toHaveLength(8)
    expect('server-key-fixture-value').not.toContain(c.serverFp)
  })
})

describe('judge', () => {
  test('ABSENT and BROWSER are SKIP, never FAIL, and both name the founder step', () => {
    for (const c of [classifyKeys(undefined, 'browser-key-fixture'), classifyKeys('browser-key-fixture', 'browser-key-fixture')]) {
      const j = judge(c, null)
      expect(j.verdict).toBe('SKIP')
      expect(j.lines.join('\n')).toMatch(/FOUNDER STEP \(KEY ONLY\)/)
      expect(j.lines.join('\n')).toMatch(/verify-google-maps-keys\.mjs/)
    }
  })

  test('DISTINCT and OK is PASS', () => {
    expect(judge(classifyKeys('server-key-fixture', 'browser-key-fixture'), { status: 'OK', message: '', http: 200 }).verdict).toBe('PASS')
  })

  test('DISTINCT and REQUEST_DENIED is FAIL, the silent shape, and the reason is printed', () => {
    const j = judge(classifyKeys('server-key-fixture', 'browser-key-fixture'), { status: 'REQUEST_DENIED', message: 'The provided API key is invalid.', http: 200 })
    expect(j.verdict).toBe('FAIL')
    expect(j.lines[0]).toMatch(/REQUEST_DENIED: The provided API key is invalid/)
    expect(j.lines.join('\n')).not.toContain('server-key-fixture')
  })

  test('DISTINCT and unreachable is SKIP as UNKNOWN, not PASS', () => {
    const j = judge(classifyKeys('server-key-fixture', 'browser-key-fixture'), { status: 'UNREACHABLE', message: 'ENOTFOUND', http: 0 })
    expect(j.verdict).toBe('SKIP')
    expect(j.lines[0]).toMatch(/UNKNOWN, not good/)
  })

  test('DISTINCT with no probe is FAIL, so a guard that forgot to probe cannot pass', () => {
    expect(judge(classifyKeys('server-key-fixture', 'browser-key-fixture'), null).verdict).toBe('FAIL')
  })
})

describe('probeGeocoding', () => {
  test('asks for the fixed address in region au with the key, and reads Google status and message', async () => {
    let url = ''
    const r = await probeGeocoding('server-key-fixture', async (u: string) => {
      url = u
      return { status: 200, json: async () => ({ status: 'REQUEST_DENIED', error_message: 'nope' }) }
    })
    const params = new URL(url).searchParams
    expect(params.get('address')).toBe(PROBE_ADDRESS)
    expect(params.get('region')).toBe('au')
    expect(params.get('key')).toBe('server-key-fixture')
    expect(r).toEqual({ status: 'REQUEST_DENIED', message: 'nope', http: 200 })
  })

  test('a transport failure is UNREACHABLE, not a throw', async () => {
    const r = await probeGeocoding('server-key-fixture', async () => {
      throw new Error('ENOTFOUND')
    })
    expect(r.status).toBe('UNREACHABLE')
  })
})

describe('the guard and the founder script share the one library', () => {
  test('both import ./lib/geocoding-key-posture.mjs rather than re-deriving the decision', () => {
    const guard = readFileSync(path.join(ROOT, 'scripts/guards/geocoding-key-posture.mjs'), 'utf8')
    const ops = readFileSync(path.join(ROOT, 'scripts/ops/verify-google-maps-keys.mjs'), 'utf8')
    expect(guard).toMatch(/from '\.\/lib\/geocoding-key-posture\.mjs'/)
    expect(ops).toMatch(/from '\.\.\/guards\/lib\/geocoding-key-posture\.mjs'/)
  })

  test('the guard sets the exit code rather than calling process.exit after a fetch (the libuv assertion on Windows)', () => {
    const guard = readFileSync(path.join(ROOT, 'scripts/guards/geocoding-key-posture.mjs'), 'utf8')
    expect(guard).toMatch(/process\.exitCode = verdict === 'FAIL' \? 1 : 0/)
    // Comment lines may name process.exit(); the code must not call it.
    const codeOnly = guard
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(codeOnly).not.toMatch(/process\.exit\(/)
  })
})
