import { describe, expect, test } from 'vitest'
import { computePendingMigrations, productionEnvFromListing, judgeEnvParity } from '../../../scripts/ops/production-parity.mjs'

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
