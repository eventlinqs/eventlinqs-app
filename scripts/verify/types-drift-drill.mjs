// No shebang on this file. Vite does not strip one when a test imports the module.
// Run as: node scripts/verify/types-drift-drill.mjs <pending|stale|invented>
/**
 * THE TYPES-DRIFT DRILL - prove the guard both ways.
 *
 * A guard that has only ever been seen to PASS is not known to work. This drives
 * the real decision function and the real reporting path from
 * scripts/ci/types-drift-analyse.mjs through three scenarios, two of which must
 * FAIL. Nothing here is a re-implementation: `analyse` and `renderVerdict` are
 * the same functions scripts/ci/types-drift-guard.mjs calls in CI.
 *
 * The fixtures are the SHAPE OF THE ACTUAL INCIDENT on PR #118, not invented
 * examples: the committed side carries share_links.destination_url,
 * share_links.draft_code, a nullable share_links.event_id and
 * events.external_ticket_url, the live side carries none of them, and the
 * migration handed to the pending list is read from disk at
 * supabase/migrations/20260815000001_external_ticketing.sql.
 *
 * WHAT THIS DRILL DOES NOT COVER, stated so nobody reads more into it: the
 * network layer. `supabase gen types` and the Management API call cannot run
 * without a token, so they are exercised by the CI job itself, which is the
 * real end-to-end proof.
 *
 *   pending   every difference is explained by a pending migration  -> exit 0
 *   stale     the live DB has a column the committed types lack     -> exit 1
 *   invented  the committed types carry a column no migration makes -> exit 1
 *
 * Exit 2 means the DRILL is broken: the guard did something other than what the
 * scenario expects, which is the one outcome that invalidates the drill itself.
 */
import { readFileSync } from 'node:fs'

import { analyse, renderVerdict } from '../ci/types-drift-analyse.mjs'

const MIGRATION = 'supabase/migrations/20260815000001_external_ticketing.sql'

/** The post-migration shape: what the committed types say today. */
const COMMITTED_POST_MIGRATION = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          external_ticket_url: string | null
          id: string
          title: string
        }
        Insert: {
          external_ticket_url?: string | null
          id?: string
          title: string
        }
        Update: {
          external_ticket_url?: string | null
          id?: string
          title?: string
        }
      }
      share_links: {
        Row: {
          code: string
          destination_url: string | null
          draft_code: string | null
          event_id: string | null
          id: string
        }
        Insert: {
          code: string
          destination_url?: string | null
          draft_code?: string | null
          event_id?: string | null
          id?: string
        }
        Update: {
          code?: string
          destination_url?: string | null
          draft_code?: string | null
          event_id?: string | null
          id?: string
        }
      }
    }
  }
}
`

/** The pre-migration shape: what production actually answers today. */
const LIVE_PRE_MIGRATION = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          title: string
        }
        Insert: {
          id?: string
          title: string
        }
        Update: {
          id?: string
          title?: string
        }
      }
      share_links: {
        Row: {
          code: string
          event_id: string
          id: string
        }
        Insert: {
          code: string
          event_id: string
          id?: string
        }
        Update: {
          code?: string
          event_id?: string
          id?: string
        }
      }
    }
  }
}
`

const scenario = process.argv[2]
const SCENARIOS = {
  /* Every difference accounted for by a migration in the tree, unapplied. */
  pending: () => ({
    committedText: COMMITTED_POST_MIGRATION,
    liveText: LIVE_PRE_MIGRATION,
    pending: [{ version: '20260815000001', file: '20260815000001_external_ticketing.sql', sql: readFileSync(MIGRATION, 'utf8') }],
    expect: { status: 'pending-migrations', exitCode: 0 },
    why: 'the committed types are the POST-migration shape and the migration is in the tree, unapplied',
  }),

  /*
   * THE DEFECT THE GUARD EXISTS FOR. The live database has moved - somebody
   * applied a migration adding share_links.retired_at - and the committed types
   * never caught up. No pending migration DROPS that column, so nothing can
   * account for the live database having it and the types not.
   */
  stale: () => ({
    committedText: COMMITTED_POST_MIGRATION,
    liveText: LIVE_PRE_MIGRATION.replace(
      '          event_id: string\n          id: string',
      '          event_id: string\n          id: string\n          retired_at: string | null',
    ),
    pending: [{ version: '20260815000001', file: '20260815000001_external_ticketing.sql', sql: readFileSync(MIGRATION, 'utf8') }],
    expect: { status: 'drift', exitCode: 1 },
    why: 'the live DB carries share_links.retired_at and the committed types do not',
  }),

  /*
   * A capability the OLD guard did not have. The committed types carry a column
   * that no migration in the repository ever creates - a hand-edit, a bad merge,
   * or a type invented to make a compile error go away. The old guard called
   * this "drift" and prescribed regenerating from production, which would have
   * silently deleted it with nobody the wiser.
   */
  invented: () => ({
    committedText: COMMITTED_POST_MIGRATION.replace(
      '          external_ticket_url: string | null',
      '          external_ticket_url: string | null\n          invented_column: string | null',
    ),
    liveText: LIVE_PRE_MIGRATION,
    pending: [{ version: '20260815000001', file: '20260815000001_external_ticketing.sql', sql: readFileSync(MIGRATION, 'utf8') }],
    expect: { status: 'drift', exitCode: 1 },
    why: 'events.invented_column is in the committed types and no migration in the tree creates it',
  }),
}

if (!SCENARIOS[scenario]) {
  console.error(`usage: node scripts/verify/types-drift-drill.mjs <${Object.keys(SCENARIOS).join('|')}>`)
  process.exit(2)
}

const { committedText, liveText, pending, expect, why } = SCENARIOS[scenario]()

console.log(`=== DRILL: ${scenario} ===`)
console.log(`scenario: ${why}`)
console.log(`expecting: status=${expect.status}, exit code ${expect.exitCode}`)
console.log('--- raw guard output ---')

const result = analyse({ committedText, liveText, pending })
const { lines, exitCode } = renderVerdict(result, {
  committedPath: 'src/types/database.ts',
  projectId: 'gndnldyfudbytbboxesk',
  migrationsDir: 'supabase/migrations',
})
for (const line of lines) console.log(line)

console.log('--- end raw guard output ---')
console.log(`actual: status=${result.status}, exit code ${exitCode}`)

if (result.status !== expect.status || exitCode !== expect.exitCode) {
  console.error(`DRILL BROKEN: expected status=${expect.status} exit=${expect.exitCode}, got status=${result.status} exit=${exitCode}`)
  process.exit(2)
}

console.log(`DRILL MATCHES EXPECTATION (exiting ${exitCode}, which is the guard's real verdict for this scenario)`)
process.exit(exitCode)
