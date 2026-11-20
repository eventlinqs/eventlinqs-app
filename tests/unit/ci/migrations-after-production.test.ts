import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs module, no declarations
import { migrationsBehindProduction, versionOf } from '../../../scripts/ci/migrations-after-production.mjs'

// A TRAIN'S MIGRATIONS SORT AFTER PRODUCTION'S NEWEST (law 4; #324, 20 November 2026). The pipeline's production push
// refused #324's three migrations (written at 15:00) because another train's (16:00) had reached production first. The
// decision is driven here on those very versions: the drill is red on the three old names, green on their new ones.

const PRODUCTION = ['20261120010001', '20261120070001', '20261120160001', '20261120160002', '20261120160003']

describe("a train's migrations sort after production's newest", () => {
  it("DRILL: #324's three migrations as first named sort before production's newest and are refused, each named", () => {
    const train = [
      'supabase/migrations/20261120150001_social_usable_images_all.sql',
      'supabase/migrations/20261120150002_organiser_collab.sql',
      'supabase/migrations/20261120150003_social_pieces_moment.sql',
    ]
    const { newest, behind } = migrationsBehindProduction(train, PRODUCTION)
    expect(newest).toBe('20261120160003')
    expect(behind.map((m: { file: string }) => m.file)).toEqual(train)
  })

  it('their new names sort after production, and pass', () => {
    const train = [
      'supabase/migrations/20261120170001_social_usable_images_all.sql',
      'supabase/migrations/20261120170002_organiser_collab.sql',
      'supabase/migrations/20261120170003_social_pieces_moment.sql',
    ]
    expect(migrationsBehindProduction(train, PRODUCTION).behind).toEqual([])
  })

  it('a migration production already holds is not judged; one equal to the newest that production lacks cannot exist, one behind it is refused', () => {
    expect(migrationsBehindProduction(['supabase/migrations/20261120160002_platform_sentinel_runs.sql'], PRODUCTION).behind).toEqual([])
    expect(migrationsBehindProduction(['supabase/migrations/20261120160000_x.sql'], PRODUCTION).behind).toHaveLength(1)
  })

  it('a file with no version is refused, never passed', () => {
    expect(versionOf('supabase/migrations/notes.sql')).toBeNull()
    expect(migrationsBehindProduction(['supabase/migrations/notes.sql'], PRODUCTION).behind).toHaveLength(1)
  })

  it('with nothing applied, nothing is behind', () => {
    expect(migrationsBehindProduction(['supabase/migrations/20261120150001_a.sql'], []).behind).toEqual([])
  })
})
