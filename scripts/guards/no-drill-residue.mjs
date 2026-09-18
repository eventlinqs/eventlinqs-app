/**
 * BUILD-FAILING GUARD: no interrupted guard-failure drill may leave a mutated
 * file in the tree.
 *
 * TWICE, IN TWO DAYS, THE SAME MECHANISM. scripts/verify/guard-failure-drills.mjs
 * mutates a real source file to prove a guard can fail, and restores it in a
 * `finally`. A `finally` does not run when the process is killed.
 *
 *   16 September 2026, power loss mid-drill. no-control-characters.mjs kept
 *   `process.exit(1)`, went into commit 1aa059f6, and thereafter exited 1 with
 *   NO OUTPUT AT ALL before reading a file. Every push was refused at the
 *   guards step, and what was printed was the guard's name and an exit code,
 *   which reads exactly like a real finding. A day of the push lane went to it.
 *
 *   17 September 2026, the run killed on a usage limit. src/app/(auth)/login/
 *   page.tsx kept `<LoginForm googleEnabled={true} />`, which hardcodes an auth
 *   provider ON for every visitor whether or not it is configured, and is the
 *   exact production defect of 2 August 2026 that auth-provider-guard exists to
 *   stop. It sat in the push lane's working tree while that lane measured a
 *   bundle baseline against it.
 *
 * THE SECOND ONE IS WHY THIS IS A GUARD AND NOT A NOTE. It happened the day
 * after the first was diagnosed and written up at length in a commit message.
 * Nothing was forgotten. The lesson simply is not one a person can act on,
 * because the moment it applies is the moment the process stops running.
 *
 * WHAT IT CHECKS, AND WHY EACH CLAUSE EARNS ITS PLACE.
 *
 *   1. THE JOURNAL IS EMPTY. The harness records a file's original bytes in
 *      .drill-journal/ BEFORE mutating it and deletes the entry after proving
 *      the restore. An entry that outlives its run is a drill that was killed,
 *      so the entry is the alarm. This inverts what has to succeed: a `finally`
 *      needed one more thing to RUN after the damage, this needs one thing to be
 *      ABSENT, and a crash can only ever add evidence.
 *
 *   2. THE JOURNAL IS NOT TRACKED. An entry holds a file's pre-mutation bytes
 *      and a machine's pid. Committing one would put a lane's half-finished
 *      drill into everybody's tree and, worse, would make clause 1 fail for
 *      every checkout for ever, which is how a gate gets switched off.
 *
 *   3. NO PLANTED MARKER SURVIVES IN A TRACKED FILE. Clause 1 cannot see
 *      residue that was already COMMITTED and whose journal is gone, which is
 *      precisely the 16 September case. Every drill that plants an executable
 *      sabotage line labels it `planted by the <id> drill`, so that phrase in a
 *      tracked file is residue by definition. Read from git's own file list, so
 *      it cannot be fooled by an ignored directory.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. Clause 3 finds only the plants that
 * carry the marker. A plant that is ordinary-looking code, like the login page
 * prop above, is invisible to it, and pretending otherwise would be the same
 * false assurance as the `finally` sentence. That case is held by clause 1,
 * which does not care what was planted.
 *
 * ON A BUILD HOST THERE IS NO JOURNAL AND THAT IS A PASS. .drill-journal/ is
 * gitignored, so it is never uploaded, and an absent directory means no drill is
 * in flight. This guard therefore reads nothing that has to survive the upload
 * (see Verification and gates, "What a build-time script may read"): clause 1
 * reads a directory whose absence is the clean answer.
 *
 * AND IT DOES NOT NEED GIT TO DO ITS JOB, which is not a detail on this
 * platform: the Vercel host has an EMPTY .git and seven build-time scripts once
 * reached for git there, one of which killed a deployment. So clause 3 enumerates
 * the tree with the git-free walk built for exactly that (close-out F2.2,
 * scripts/guards/lib/gitignore.mjs), and only clause 2 needs a real repository,
 * because "tracked" is not a question anything but git can answer. When there is
 * none, clause 2 says so in the one sentence every git-reading script here uses,
 * and the clauses that CAN run still run.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { gitEnv } from '../lib/git-env.mjs'
import { gitAvailability, noGitLine } from './lib/git-availability.mjs'
import { walkTrackedFiles } from './lib/gitignore.mjs'
import { JOURNAL_DIRNAME, pending } from '../verify/lib/drill-journal.mjs'

const TAG = '[no-drill-residue]'
const ROOT = process.cwd()
const RESTORE = 'node scripts/verify/guard-failure-drills.mjs --restore'

/**
 * The marker every sabotage line carries, assembled from parts so that this
 * guard's own source does not contain the phrase it forbids. The earlier
 * no-control-characters guard flagged itself for exactly that reason and the
 * fix there was the same one.
 */
const MARKER = ['planted', 'by', 'the'].join(' ')
const MARKER_TAIL = 'drill'

/** Extensions a drill can plant into: anything the harness mutates. */
const PLANTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|sql)$/

/**
 * Anything under the journal directory that git is tracking, or null when there
 * is no repository to ask.
 *
 * `env: gitEnv()` is not optional. Inside a git hook GIT_DIR is set, an
 * inheriting child ignores `cwd` when it chooses a repository, and that is how
 * `core.bare=true` was once written into the shared config and broke
 * `git status` in all nine worktrees.
 */
function trackedUnderJournal() {
  const { usable } = gitAvailability(ROOT)
  if (!usable) return null
  try {
    return execFileSync('git', ['ls-files', '-z', '--', JOURNAL_DIRNAME], {
      cwd: ROOT,
      env: gitEnv(),
      maxBuffer: 8 * 1024 * 1024,
    })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
  } catch (error) {
    // Spoken, never swallowed: an unanswered question is reported as unanswered
    // rather than as a clean answer.
    console.warn(
      `${TAG} git is present but \`ls-files\` failed, so whether the journal is tracked is NOT JUDGED: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

function main() {
  const failures = []
  const skipped = []
  let judged = 0

  // Clause 1: the journal is empty.
  judged += 1
  const open = pending(ROOT)
  for (const entry of open) {
    if (entry.unreadable) {
      failures.push(
        `${entry.entryPath} could not be read (${entry.unreadable}). A half-written journal entry means the ` +
          `drill harness died between creating it and finishing it, so a source file may be mutated with no ` +
          `record of its original bytes. Check with: git status --short`,
      )
      continue
    }
    failures.push(
      `${entry.file} has an OPEN drill journal entry from ${entry.openedAt} (pid ${entry.pid}` +
        `${entry.drill ? `, drill ${entry.drill}` : ''}). A guard-failure drill mutated it and was killed ` +
        `before restoring it${entry.planted ? `; it planted: ${JSON.stringify(entry.planted)}` : ''}. ` +
        `The original bytes are in the entry, so this is one command: ${RESTORE}`,
    )
  }

  // Clause 2: the journal is not tracked. The only clause that needs git.
  const trackedJournal = trackedUnderJournal()
  if (trackedJournal === null) {
    skipped.push(noGitLine(TAG, 'whether anything under the journal directory is TRACKED', ROOT))
  } else {
    judged += 1
    if (trackedJournal.length > 0) {
      failures.push(
        `${trackedJournal.length} journal entr(y/ies) are TRACKED by git (${trackedJournal.slice(0, 3).join(', ')}). ` +
          `An entry holds one machine's pre-mutation bytes and pid; committing it would fail clause 1 in every ` +
          `checkout for ever, which is how a gate gets switched off. Add ${JOURNAL_DIRNAME}/ to .gitignore and ` +
          `remove them with: git rm -r --cached ${JOURNAL_DIRNAME}`,
      )
    }
  }

  // Clause 3: no planted marker survives in a file the repository would carry.
  // Enumerated without git, so this runs on the build host too.
  const tree = walkTrackedFiles(ROOT)
  for (const rel of tree) {
    if (!PLANTABLE.test(rel)) continue
    // The harness itself holds every plant as data, and this guard names the
    // marker. Neither is residue.
    if (rel === 'scripts/verify/guard-failure-drills.mjs') continue
    if (rel === 'scripts/guards/no-drill-residue.mjs') continue
    judged += 1
    let text
    try {
      text = readFileSync(join(ROOT, rel), 'utf8')
    } catch (error) {
      // A file that cannot be read is a HOLE in the enumeration, not a clean
      // file, so it is named rather than skipped in silence.
      console.warn(
        `${TAG} ${rel} could not be read, so it is NOT JUDGED for a planted sabotage line: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
    if (!text.includes(MARKER)) continue
    for (const [i, line] of text.split('\n').entries()) {
      if (line.includes(MARKER) && line.includes(MARKER_TAIL)) {
        failures.push(
          `${rel}:${i + 1} still carries a drill's planted sabotage line: ${line.trim()}. ` +
            `It was committed by an interrupted drill run, exactly as commit b3cc6317 records. ` +
            `Restore the file: git checkout -- "${rel}"`,
        )
      }
    }
  }

  declareWork('no-drill-residue', {
    did: {
      'journal clause checked': trackedJournal === null ? 1 : 2,
      'source file read for a planted sabotage marker': tree.filter((f) => PLANTABLE.test(f)).length,
    },
    found: { 'piece of drill residue': failures.length },
  })

  for (const s of skipped) console.log(s)

  if (failures.length > 0) {
    for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
    console.error(`${TAG} FAIL - ${failures.length} fault(s) across ${judged} check(s).`)
    process.exit(1)
  }

  console.log(
    `${TAG} PASS - ${judged} check(s): no open drill journal entry (${JOURNAL_DIRNAME}/ holds ${open.length}), ` +
      `${trackedJournal === null ? 'whether it is tracked is UNJUDGED here (no repository)' : 'nothing under it is tracked'}, ` +
      `and no source file carries a planted sabotage line.`,
  )
}

main()
