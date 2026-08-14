import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * THE ONE SAFE WAY FOR A TEST TO WALK THE SOURCE TREE.
 *
 * WHY THIS EXISTS, and why it is a shared helper rather than a fix applied file
 * by file. Twice in two days a test file reported healthy while running nothing,
 * and both times the mechanism was the same shape: a file vanished between being
 * enumerated and being read, the resulting ENOENT was thrown at MODULE SCOPE, and
 * vitest reported "no tests" rather than a failure. The suite went green having
 * silently run fewer tests. That is the worst failure a test suite has, because
 * every signal says everything is fine.
 *
 * The vanishing file is real and deliberate: tests/unit/ci/copy-gate-can-see.test.ts
 * plants src/__copy_gate_scratch__/scratch.tsx, runs the copy gate against the
 * real tree in a subprocess, and deletes it. Five of its six cases do that, each
 * around a seven second subprocess, so the window is wide and repeated, and
 * vitest runs test files in parallel workers.
 *
 * THE FIX THAT DID NOT WORK, recorded so it is not repeated. Each time this was
 * hit, somebody guarded the `readFileSync` and left `readdirSync` and `statSync`
 * bare. A recursive readdir into a directory that has just been removed, and a
 * stat on an entry that has just been removed, throw exactly the same ENOENT. A
 * guard that covers only the read is not a guard, it is a narrower blind spot.
 * So all three operations are guarded here, once, and tests import this instead
 * of writing their own walk.
 *
 * WHAT SKIPPING A VANISHED FILE MEANS. It is the correct answer on the merits,
 * not a way to silence a crash: a file that is not on disk cannot carry a clock
 * read, cannot leak an environment variable into the browser bundle, and cannot
 * ship a dead href. Every assertion built on these walks is about what the
 * repository CONTAINS, and a deleted scratch file is not part of that.
 */

/** True when an error is "the path is no longer there", in any of its forms. */
function vanished(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * Every file under `dir` whose name passes `matches`, depth first.
 *
 * Never throws for a path that disappears mid-walk. Any other error is rethrown,
 * because a permission fault or a broken mount is a real problem and must not be
 * swallowed by a helper written for a different purpose.
 */
export function safeWalk(dir: string, matches: (name: string) => boolean, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err) {
    if (vanished(err)) return out
    throw err
  }

  for (const entry of entries) {
    const full = path.join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch (err) {
      if (vanished(err)) continue
      throw err
    }
    if (stat.isDirectory()) safeWalk(full, matches, out)
    else if (matches(entry)) out.push(full)
  }
  return out
}

/** Convenience for the common case: every .ts and .tsx file under `dir`. */
export function safeWalkSource(dir: string): string[] {
  return safeWalk(dir, (name) => name.endsWith('.ts') || name.endsWith('.tsx'))
}

/**
 * Is this path a directory, when it may have been deleted since it was named?
 *
 * Returns false for a path that has vanished, which is the correct answer for
 * every caller here: a directory that is not there cannot serve a route and
 * cannot contain a file. Any other error is rethrown, for the same reason
 * safeWalk rethrows: a permission fault is a real problem.
 *
 * This exists because two callers were doing `statSync(p).isDirectory()` bare in
 * the middle of an otherwise guarded walk. A guard that covers the readdir and
 * not the stat is the same partial fix this helper's header already records as
 * having been shipped and failed.
 */
export function safeIsDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch (err) {
    if (vanished(err)) return false
    throw err
  }
}

/**
 * Read a file that may have been deleted since it was enumerated.
 *
 * Returns null rather than throwing, so a caller can `continue`. Callers must
 * handle null; that is deliberate, because silently substituting an empty string
 * would make a walked file look like a file with no offending content, which is
 * the same false-clean this whole helper exists to prevent.
 */
export function safeRead(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    if (vanished(err)) return null
    throw err
  }
}
