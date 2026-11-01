import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error a plain .mjs build script module, no declaration file
import { SERVICE_KEY_NAMES, withholdServiceKeyOnReadOnlyPreview } from '../../../scripts/lib/preview-read-only-build.mjs'

/*
 * THE READ-ONLY PREVIEW BUILDS WITH NO SERVICE KEY. 2 November 2026, 04:23: the preview of feat/w5-design-preview
 * stopped in prebuild, "pricing_rules could not be read (HTTP 401 read as service role)", because the branch reads
 * production by URL and anon key while the preview scope still carries TEST's service key. Under PREVIEW_READ_ONLY=1 the
 * build withholds the service key, so every build-time reader reads as anon, the CI shape.
 */
const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')

describe('the read-only preview build withholds the service key', () => {
  it('under PREVIEW_READ_ONLY=1 both service-key variables are removed and named', () => {
    const env: Record<string, string | undefined> = { PREVIEW_READ_ONLY: '1', SUPABASE_SERVICE_ROLE_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY_PREVIEW: 'b', NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW: 'anon' }
    expect(withholdServiceKeyOnReadOnlyPreview(env)).toEqual(SERVICE_KEY_NAMES)
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
    expect(env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW).toBeUndefined()
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW).toBe('anon')
  })

  it('anywhere else (production, every other preview) it changes nothing', () => {
    for (const flag of [undefined, '', '0', 'true']) {
      const env: Record<string, string | undefined> = { PREVIEW_READ_ONLY: flag, SUPABASE_SERVICE_ROLE_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY_PREVIEW: 'b' }
      expect(withholdServiceKeyOnReadOnlyPreview(env)).toEqual([])
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('a')
      expect(env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW).toBe('b')
    }
  })

  it('both build-time readers call it before they read: the pricing lock and the guard runner', () => {
    for (const file of ['scripts/check-pricing-lock.mjs', 'scripts/guards/run-guards.mjs']) {
      const src = read(file)
      const call = src.indexOf('withholdServiceKeyOnReadOnlyPreview(process.env)')
      expect(call, file).toBeGreaterThan(-1)
    }
    const lock = read('scripts/check-pricing-lock.mjs')
    expect(lock.indexOf('withholdServiceKeyOnReadOnlyPreview(process.env)')).toBeLessThan(lock.indexOf('PRICING_LOCK_RULE.resolve('))
    const guards = read('scripts/guards/run-guards.mjs')
    expect(guards.indexOf('withholdServiceKeyOnReadOnlyPreview(process.env)')).toBeLessThan(guards.indexOf('spawnSync(process.execPath'))
  })
})
