import { describe, expect, test } from 'vitest'
import { computePendingMigrations, judgeEnvParity, judgeStoredLogin, productionEnvFromListing, vercelCliAuthCandidates } from '../../../scripts/ops/production-parity.mjs'

/**
 * PRODUCTION PARITY (close-out C16.2): the two questions a production build
 * answers that a pull request never asked, judged as pure functions here so the
 * refusal can be proven without a token: a migration production lacks, a
 * required variable the store lacks, a forbidden one it holds, and a readable
 * value off its shape.
 */
describe('computePendingMigrations', () => {
  test('a migration the tree carries and production has not applied is pending; applied and non-sql files are not', () => {
    const files = ['20260901000001_a.sql', '20260906000001_event_status_archived.sql', '20260906000002_event_lifecycle_archive_delete.sql', 'README.md']
    const applied = new Set(['20260901000001'])
    expect(computePendingMigrations(files, applied).map((m: { file: string }) => m.file)).toEqual([
      '20260906000001_event_status_archived.sql',
      '20260906000002_event_lifecycle_archive_delete.sql',
    ])
    expect(computePendingMigrations(files, new Set(['20260901000001', '20260906000001', '20260906000002']))).toEqual([])
  })
})

describe('productionEnvFromListing', () => {
  test('keeps production records without a git branch, marks sensitive ones unreadable, and drops preview-only records', () => {
    const listing = productionEnvFromListing([
      { key: 'A', value: 'value-a', type: 'encrypted', target: ['production', 'preview'] },
      { key: 'B', value: '', type: 'sensitive', target: ['production'] },
      { key: 'C', value: 'preview-only', type: 'plain', target: ['preview'] },
      { key: 'D', value: 'branch-pinned', type: 'plain', target: ['production'], gitBranch: 'main' },
      { key: 'E', value: 'single-target', type: 'plain', target: 'production' },
    ])
    expect([...listing.keys()].sort()).toEqual(['A', 'B', 'E'])
    expect(listing.get('A')).toEqual({ readable: true, value: 'value-a', type: 'encrypted' })
    expect(listing.get('B')).toEqual({ readable: false, value: null, type: 'sensitive' })
  })
})

describe('judgeEnvParity', () => {
  // a three-entry manifest with only the fields the judge reads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest: any[] = [
    { name: 'REQ_URL', describe: 'a required url', requiredOn: ['production'], forbiddenOn: [], shape: { pattern: '^https://[a-z]+\\.example$', minLength: 12, describe: 'https://<x>.example' } },
    { name: 'SECRET', describe: 'a secret', requiredOn: ['production'], forbiddenOn: [], shape: { pattern: '^sk_[a-z0-9]{10,}$', minLength: 13, describe: 'sk_ then the body' } },
    { name: 'FIXTURE_FLAG', describe: 'a fixture flag', requiredOn: [], forbiddenOn: ['production'], shape: { pattern: '^1$', minLength: 1, describe: '1' } },
  ]

  test('a store that satisfies the manifest passes, with a sensitive record noted rather than judged', () => {
    const listing = productionEnvFromListing([
      { key: 'REQ_URL', value: 'https://app.example', type: 'encrypted', target: ['production'] },
      { key: 'SECRET', value: '', type: 'sensitive', target: ['production'] },
    ])
    const { findings, notes } = judgeEnvParity(listing, manifest)
    expect(findings).toEqual([])
    expect(notes.map((n) => n.name)).toEqual(['SECRET'])
  })

  test('a missing required record, a forbidden record held, an empty value and a malformed value each fail and never carry the value', () => {
    const listing = productionEnvFromListing([
      { key: 'REQ_URL', value: 'http://not-a-match', type: 'encrypted', target: ['production'] },
      { key: 'FIXTURE_FLAG', value: '1', type: 'plain', target: ['production'] },
    ])
    const { findings } = judgeEnvParity(listing, manifest)
    const states = Object.fromEntries(findings.map((f) => [f.name, f.state]))
    expect(states).toEqual({ REQ_URL: 'malformed', SECRET: 'missing', FIXTURE_FLAG: 'forbidden-present' })
    for (const f of findings) expect(JSON.stringify(f)).not.toContain('not-a-match')
    const empty = judgeEnvParity(productionEnvFromListing([{ key: 'REQ_URL', value: '   ', type: 'plain', target: ['production'] }, { key: 'SECRET', value: 'sk_abcdefghijk', type: 'plain', target: ['production'] }]), manifest)
    expect(empty.findings.map((f) => `${f.name}:${f.state}`)).toEqual(['REQ_URL:empty'])
  })
})

/**
 * The environment half on a developer machine (7 September 2026): the Vercel
 * CLI's own login stands in for a minted token. The CLI writes auth.json by
 * the XDG rules, and on this machine the fresh login sat under
 * %APPDATA%\xdg.data while a stale July copy sat under the legacy Data path,
 * so the order of the candidates is the difference between a real check and a
 * 403.
 */
describe('the Vercel CLI login as the local token', () => {
  test('candidates run XDG_DATA_HOME, then the Windows xdg.data paths, then ~/.local/share, and the legacy Data path last', () => {
    const paths = vercelCliAuthCandidates({ XDG_DATA_HOME: '/xdg', APPDATA: 'C:/Roaming', LOCALAPPDATA: 'C:/Local' }, '/home/lawal').map((p) => p.replace(/\\/g, '/'))
    expect(paths).toEqual([
      '/xdg/com.vercel.cli/auth.json',
      'C:/Roaming/xdg.data/com.vercel.cli/auth.json',
      'C:/Local/xdg.data/com.vercel.cli/auth.json',
      '/home/lawal/.local/share/com.vercel.cli/auth.json',
      'C:/Roaming/com.vercel.cli/Data/auth.json',
    ])
    expect(vercelCliAuthCandidates({}, '/home/lawal').map((p) => p.replace(/\\/g, '/'))).toEqual(['/home/lawal/.local/share/com.vercel.cli/auth.json'])
  })

  test('a stored login is usable only with a token that is not within a minute of its expiry; the token is returned, never reshaped', () => {
    const now = 1_788_700_000
    expect(judgeStoredLogin(null, now)).toEqual({ state: 'absent' })
    expect(judgeStoredLogin({ token: '   ' }, now)).toEqual({ state: 'absent' })
    expect(judgeStoredLogin({ token: 'abc', expiresAt: now - 1 }, now)).toEqual({ state: 'expired', expiresAt: now - 1 })
    expect(judgeStoredLogin({ token: 'abc', expiresAt: now + 59 }, now).state).toBe('expired')
    expect(judgeStoredLogin({ token: 'abc', expiresAt: now + 3600 }, now)).toEqual({ state: 'usable', token: 'abc' })
    expect(judgeStoredLogin({ token: 'abc' }, now)).toEqual({ state: 'usable', token: 'abc' })
  })
})
