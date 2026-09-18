/**
 * ============================================================================
 * THE DRILL JOURNAL: WHY A `finally` IS NOT CRASH SAFETY
 * ============================================================================
 *
 * scripts/verify/guard-failure-drills.mjs mutates a real source file, runs the
 * guard that should object, and restores the file. Its header claimed, in these
 * words, that "files are restored in a `finally` ... so an interrupted run
 * cannot leave a mutated tree behind."
 *
 * THAT CLAIM WAS FALSE, AND IT COST TWO SESSIONS. A `finally` runs when the
 * block exits. It does not run when the process is killed, and on this machine
 * the harness has now been killed twice mid-drill:
 *
 *   1. 16 September 2026, power loss. `scripts/guards/no-control-characters.mjs`
 *      kept the planted `process.exit(1)` and went into commit 1aa059f6 with
 *      lane C's real work. The guard then exited 1 with NO OUTPUT AT ALL,
 *      before reading a single file, so every push was refused at the guards
 *      step with a message that read exactly like a real finding. Fixed by
 *      b3cc6317, by hand, after the lane had been blocked for a day.
 *
 *   2. 17 September 2026, the run killed on a usage limit. `src/app/(auth)/
 *      login/page.tsx` kept the planted `<LoginForm googleEnabled={true} />`,
 *      which hardcodes an auth provider on for every visitor regardless of
 *      whether it is configured. It sat uncommitted in the push lane's tree
 *      while the lane measured a bundle baseline against it.
 *
 * The second one is the argument for a mechanism rather than more care. The
 * same fault, in the same harness, one day after it was diagnosed and written
 * up at length. Nobody forgot the lesson; the lesson was simply not something a
 * person can hold, because the failure happens when the process is no longer
 * running.
 *
 * THE FIX INVERTS WHAT HAS TO SUCCEED. A `finally` needs one more thing to run
 * after the damage is done. This journal needs one thing to be ABSENT, and it
 * is written BEFORE the damage:
 *
 *   open()   writes .drill-journal/<slug>.json holding the file's ORIGINAL
 *            BYTES, base64, plus its digest, before the file is touched.
 *   close()  deletes that entry, after verifying the file is byte-identical to
 *            what was recorded.
 *
 * So a killed process leaves the entry behind, and the entry is the alarm:
 * scripts/guards/no-drill-residue.mjs FAILS the build while any entry exists.
 * A crash can no longer be silent, because a crash can only ever ADD evidence.
 *
 * AND IT CARRIES ITS OWN UNDO. The entry holds the original bytes, so the
 * remedy is `node scripts/verify/guard-failure-drills.mjs --restore`, one
 * command, which is Law 10: the founder's step is scripted and offered at the
 * moment it is identified, not described in a runbook.
 *
 * RESTORE VERIFIES BY OBSERVING, NEVER BY TRUSTING ITS OWN WRITE. It re-reads
 * the file and compares the digest, and refuses to drop the entry when they
 * disagree. Three worktrees share this disk and the gate stops under 5 GB free;
 * a `writeFileSync` that half-succeeded and an entry deleted on faith would
 * reproduce the exact defect this module exists to end.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Gitignored, so an entry can never be committed, and at the repository root so
 * one glance finds it. Absent is the normal state and means no drill is in
 * flight, which is why every reader below treats a missing directory as clean
 * rather than as an error: on a Vercel build host the directory does not exist
 * and must not need to.
 */
export const JOURNAL_DIRNAME = '.drill-journal'

export const digest = (buf) => createHash('sha256').update(buf).digest('hex')

const journalDir = (root) => join(root, JOURNAL_DIRNAME)

/** A file path flattened into one safe filename, so the entry names its subject. */
const slugFor = (relPath) => relPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/**
 * Record a file's original bytes BEFORE it is mutated, and return the handle
 * `close` needs.
 *
 * `planted` is the text about to be written in. It is recorded so the guard's
 * message can name the exact damage rather than only the file, which is the
 * difference between "restore this" and "work out what happened here first".
 */
export function open(root, relPath, { drill, planted } = {}) {
  const dir = journalDir(root)
  mkdirSync(dir, { recursive: true })
  const original = readFileSync(join(root, relPath))
  const entryPath = join(dir, `${slugFor(relPath)}.json`)
  writeFileSync(
    entryPath,
    `${JSON.stringify(
      {
        file: relPath,
        drill: drill ?? null,
        planted: planted ?? null,
        sha256: digest(original),
        bytes: original.toString('base64'),
        openedAt: new Date().toISOString(),
        pid: process.pid,
      },
      null,
      2,
    )}\n`,
  )
  return { entryPath, relPath, original }
}

/**
 * Drop the entry, but only once the file on disk is provably back to the
 * recorded bytes. A failed restore keeps its entry, so the guard keeps
 * objecting, which is the correct end state: residue that cannot be repaired
 * automatically must not be allowed to look repaired.
 */
export function close(root, handle) {
  const onDisk = readFileSync(join(root, handle.relPath))
  if (digest(onDisk) !== digest(handle.original)) {
    return {
      ok: false,
      why:
        `${handle.relPath} is not back to its recorded bytes after the restore, so its journal entry is ` +
        `kept. Run: node scripts/verify/guard-failure-drills.mjs --restore`,
    }
  }
  rmSync(handle.entryPath, { force: true })
  return { ok: true }
}

/** Every entry currently open, oldest first. An absent directory is clean. */
export function pending(root) {
  const dir = journalDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const entryPath = join(dir, f)
      try {
        return { entryPath, ...JSON.parse(readFileSync(entryPath, 'utf8')) }
      } catch (err) {
        /*
         * A half-written entry is itself residue: the process died between
         * `mkdirSync` and the end of `writeFileSync`. It is reported, never
         * skipped, because the file it names may well be mutated and the one
         * thing we must not do is call that tree clean.
         */
        return { entryPath, file: null, unreadable: String(err?.message ?? err) }
      }
    })
    .sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)))
}

/**
 * Put every journalled file back and clear the entries it could prove.
 *
 * Idempotent: a file already identical to its recorded bytes is still verified
 * and its entry still dropped, so running this twice is safe and running it on
 * a clean tree does nothing at all.
 */
export function restoreAll(root) {
  const restored = []
  const stuck = []
  for (const entry of pending(root)) {
    if (!entry.file || typeof entry.bytes !== 'string') {
      stuck.push({
        entryPath: entry.entryPath,
        why: entry.unreadable
          ? `the entry itself could not be read (${entry.unreadable}), so the original bytes are gone`
          : 'the entry records no file and no bytes, so there is nothing to restore from',
      })
      continue
    }
    const original = Buffer.from(entry.bytes, 'base64')
    if (digest(original) !== entry.sha256) {
      stuck.push({
        entryPath: entry.entryPath,
        why: `the recorded bytes do not match the recorded sha256, so the entry is corrupt and ${entry.file} must be restored by hand (git checkout -- "${entry.file}")`,
      })
      continue
    }
    const target = join(root, entry.file)
    writeFileSync(target, original)
    // Observed, not assumed. See the header.
    if (digest(readFileSync(target)) !== entry.sha256) {
      stuck.push({ entryPath: entry.entryPath, why: `${entry.file} did not take the write` })
      continue
    }
    rmSync(entry.entryPath, { force: true })
    restored.push(entry.file)
  }
  return { restored, stuck }
}
