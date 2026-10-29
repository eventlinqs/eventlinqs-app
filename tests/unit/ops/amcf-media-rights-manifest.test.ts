import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE AMCF MEDIA-RIGHTS MANIFEST MEETS THE DATABASE'S OWN RULES BEFORE ANY APPLY (29 October 2026). Window 3's
 * c7ab232f changed the credit to 'AMCF' and the dry run, which only prints SQL, passed; production refused the apply,
 * quoted: 'violates check constraint "social_assets_archival_says_so"'. The rule is read from the migration that made
 * it, so this test and the database can never hold two versions of it.
 */
const ROOT = join(__dirname, '..', '..', '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'ops', 'amcf-media-rights.manifest.json'), 'utf8')) as {
  archival: boolean
  attribution: string
  rightsHolder: string
}
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261028141001_social_campaigns.sql'), 'utf8')

describe('the AMCF media-rights manifest', () => {
  it('says a past festival is past wherever an archival photograph is credited (K3, social_assets_archival_says_so)', () => {
    const rule = /constraint social_assets_archival_says_so check \(not archival or attribution_text ~\* '([^']+)'\)/.exec(migration)
    expect(rule, 'the K3 constraint is where the migration put it').not.toBeNull()
    const pattern = new RegExp(rule![1], 'i')
    expect(!manifest.archival || pattern.test(manifest.attribution), `credit "${manifest.attribution}" with archival ${manifest.archival}`).toBe(true)
  })

  it('names AMCF as the rights holder and credits AMCF (the project manager, 29 October 14:52)', () => {
    expect(manifest.rightsHolder).toBe('AMCF')
    expect(manifest.attribution.startsWith('AMCF')).toBe(true)
  })
})
