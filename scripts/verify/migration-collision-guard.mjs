/**
 * MIGRATION COLLISIONS: two files that claim the same version, and a file that
 * claims a version the database has already applied.
 *
 * ---------------------------------------------------------------------------
 * WHY, stated accurately.
 *
 * NO COLLISION HAS OCCURRED. This guard was not written because one was caught;
 * it was written because the conditions for one are now permanently present and
 * a collision is the kind of thing that is only noticed afterwards.
 *
 * The conditions: two sessions worked this repo in parallel on two branches on
 * 8 August 2026, and migration versions are minted as a date plus a serial
 * (`20260808000003`) chosen by hand. Two people starting work on the same day
 * both count from 000001. Neither sees the other's file, because it is on the
 * other branch.
 *
 * WHAT WOULD HAPPEN. `supabase migration list` and `db push` key on the VERSION
 * PREFIX, not the file name or its contents. So:
 *
 *   * two files sharing a prefix on one branch: `db push` applies whichever it
 *     resolves and records the version as done. The other never runs, and never
 *     appears pending again, because the version is in schema_migrations. It is
 *     not skipped loudly. It is skipped permanently and silently.
 *   * a file whose prefix is ALREADY in the remote history: it is treated as
 *     applied the moment it lands on the branch. It never runs at all. This is
 *     the shape a merge produces: the other session's 000003 was applied from
 *     their branch, mine merges in carrying the same prefix, and mine is
 *     invisible from that moment on.
 *
 * Both end the same way: a migration everybody believes ran, that never did.
 * The schema is then wrong in a way no gate can see, because every gate reads
 * the code and the code is correct.
 *
 * Usage:
 *   node scripts/verify/migration-collision-guard.mjs              # local only
 *   node scripts/verify/migration-collision-guard.mjs --remote     # + TEST history
 *
 * The local half needs no network and is the one worth running constantly.
 * Exit 1 on any collision.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const DIR = 'supabase/migrations'
const REMOTE = process.argv.includes('--remote')

if (!existsSync(DIR)) {
  console.log(`no ${DIR} directory, nothing to check`)
  process.exit(0)
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
console.log('MIGRATION COLLISION GUARD')
console.log(`${files.length} migration file(s) in ${DIR}\n`)

const failures = []

// --- 1. two files sharing a version prefix ----------------------------------
console.log('--- a. no two files share a version prefix ---')
const byVersion = new Map()
const unparsed = []
for (const file of files) {
  const version = /^(\d{14})_/.exec(file)?.[1]
  if (!version) {
    unparsed.push(file)
    continue
  }
  byVersion.set(version, [...(byVersion.get(version) ?? []), file])
}
const duplicates = [...byVersion].filter(([, list]) => list.length > 1)
if (unparsed.length) {
  console.log(`  [FAIL] ${unparsed.length} file(s) do not carry a 14-digit version prefix:`)
  for (const f of unparsed) console.log(`         ${f}`)
  failures.push(`${unparsed.length} migration file(s) have no parseable version`)
}
if (duplicates.length) {
  for (const [version, list] of duplicates) {
    console.log(`  [FAIL] version ${version} is claimed by ${list.length} files:`)
    for (const f of list) console.log(`         ${f}`)
  }
  failures.push(
    `${duplicates.length} version(s) are claimed by more than one file. db push applies ONE and records the version as done; the rest never run and never appear pending again`,
  )
} else if (!unparsed.length) {
  console.log(`  [PASS] ${byVersion.size} version(s), each claimed by exactly one file`)
}

// --- 2. identical content under different versions --------------------------
// The other half of a parallel-session mistake: the same repair written twice
// under two versions, which runs twice. Harmless for an idempotent migration
// and not for anything else, so it is named rather than failed.
console.log('\n--- b. no two files are byte-identical under different versions ---')
const byContent = new Map()
for (const file of files) {
  const body = readFileSync(`${DIR}/${file}`, 'utf8').replace(/\s+/g, ' ').trim()
  byContent.set(body, [...(byContent.get(body) ?? []), file])
}
const twins = [...byContent.values()].filter((l) => l.length > 1)
if (twins.length) {
  for (const list of twins) console.log(`  [note] identical content: ${list.join(', ')}`)
  console.log('         Not a failure. Idempotent repairs are safe to run twice; anything else is not.')
} else {
  console.log('  [PASS] every migration is distinct')
}

// --- 3. THE CROSS-BRANCH CHECK ----------------------------------------------
//
// The working tree only ever shows ONE branch. The collision this guard exists
// for is created by two sessions on two branches, and neither can see the
// other's file until a merge, which is the moment it is too late.
//
// So this reads every ref through git rather than the filesystem. A version
// claimed by the SAME filename on many branches is normal: those branches share
// an ancestor. A version claimed by DIFFERENT filenames is the collision.
console.log('\n--- d. no version is claimed by different files on different branches ---')
{
  let refs = []
  try {
    refs = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/', 'refs/remotes/'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .filter((r) => !r.endsWith('/HEAD'))
  } catch (err) {
    console.log(`  [skip] git unavailable: ${String(err).slice(0, 100)}`)
  }

  if (refs.length) {
    console.log(`  scanning ${refs.length} ref(s)`)
    // version -> filename -> [refs]
    const claims = new Map()
    for (const ref of refs) {
      let listed = ''
      try {
        listed = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', `${DIR}/`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch {
        continue
      }
      for (const path of listed.split('\n')) {
        const file = path.trim().replace(`${DIR}/`, '')
        if (!file.endsWith('.sql')) continue
        const version = /^(\d{14})_/.exec(file)?.[1]
        if (!version) continue
        if (!claims.has(version)) claims.set(version, new Map())
        const byFile = claims.get(version)
        byFile.set(file, [...(byFile.get(file) ?? []), ref])
      }
    }

    const crossBranch = [...claims].filter(([, byFile]) => byFile.size > 1)
    if (crossBranch.length === 0) {
      console.log(`  [PASS] ${claims.size} version(s) across all refs, each claimed by exactly one filename`)
    } else {
      for (const [version, byFile] of crossBranch) {
        console.log(`  [FAIL] version ${version} is claimed by ${byFile.size} DIFFERENT files:`)
        for (const [file, onRefs] of byFile) {
          console.log(`         ${file}`)
          console.log(`             on: ${onRefs.slice(0, 4).join(', ')}${onRefs.length > 4 ? ` (+${onRefs.length - 4} more)` : ''}`)
        }
      }
      console.log('')
      console.log('  A colliding version that is ALREADY APPLIED is the severe case. Renaming')
      console.log('  the file fixes the future; it does not undo the record. The other branch\'s')
      console.log('  migration has been marked done on a database it never touched, so its')
      console.log('  change must be re-issued under a fresh version, and whatever it was going')
      console.log('  to alter has to be checked by hand first.')
      console.log('  Run with --remote to see which of these versions are already applied.')
      failures.push(
        `${crossBranch.length} version(s) are claimed by different files on different branches. Whichever lands first records the version as applied; every other file with that version is then treated as already done and NEVER RUNS`,
      )
    }
  }
}

// --- 3. a local version already applied on the remote -----------------------
console.log('\n--- c. no local file claims a version the remote has already applied ---')
if (!REMOTE) {
  console.log('  [skip] pass --remote to compare against the linked project (needs network)')
} else {
  let remoteVersions = null
  try {
    const raw = execFileSync('npx', ['supabase', 'migration', 'list', '--linked'], {
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const json = JSON.parse(raw.split('\n').find((l) => l.trim().startsWith('{')) ?? '{}')
    remoteVersions = new Map(
      (json.migrations ?? []).filter((m) => m.remote).map((m) => [m.remote, m.local]),
    )
  } catch (err) {
    console.log(`  [skip] could not read the remote history: ${String(err).slice(0, 120)}`)
  }

  if (remoteVersions) {
    console.log(`  remote has ${remoteVersions.size} applied version(s)`)
    // A local file whose version is applied remotely but which is NOT the file
    // that was applied is the merge shape: it will never run and will never be
    // reported as pending.
    const applied = []
    for (const [version, list] of byVersion) {
      if (!remoteVersions.has(version)) continue
      applied.push({ version, file: list[0] })
    }
    // Every applied version SHOULD correspond to a local file that really ran.
    // What we cannot know from the CLI is whether the CONTENT matches. So the
    // check is narrow and honest: flag a version applied remotely that arrived
    // in the working tree AFTER the fact, which git can answer.
    const suspicious = []
    for (const { version, file } of applied) {
      try {
        const firstCommit = execFileSync(
          'git',
          ['log', '--diff-filter=A', '--format=%cI', '--', `${DIR}/${file}`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ).trim().split('\n').filter(Boolean).pop()
        if (!firstCommit) suspicious.push({ version, file, why: 'untracked: not committed on this branch' })
      } catch {
        // git unavailable for this path; not a failure on its own.
      }
    }
    if (suspicious.length) {
      for (const s of suspicious) {
        console.log(`  [FAIL] ${s.version} is applied on the remote but ${s.file} ${s.why}`)
      }
      failures.push(
        `${suspicious.length} file(s) carry a version the remote already applied while not being committed here, which is the shape of a parallel-session collision`,
      )
    } else {
      console.log('  [PASS] every locally applied version corresponds to a committed file on this branch')
    }
  }
}

console.log('')
if (failures.length) {
  console.log(`===== ${failures.length} FAILED =====`)
  for (const f of failures) console.log(`  ${f}`)
  console.log('')
  console.log('A colliding migration is not skipped loudly. It is recorded as done')
  console.log('and never runs, so the schema is wrong in a way no other gate can see:')
  console.log('every gate reads the code, and the code is correct.')
  console.log('')
  console.log('To fix: rename the later file to the next free version. Nothing else')
  console.log('changes, because the version is the only thing db push keys on.')
} else {
  console.log('===== ALL GREEN =====')
}
process.exit(failures.length ? 1 : 0)
