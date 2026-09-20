import { readFileSync } from 'node:fs'

/**
 * READ A TRACKED REPOSITORY FILE THE WAY EVERY READER OF IT SEES IT.
 *
 * WHY THIS EXISTS, 20 September 2026. Three tests that read a migration or a
 * component and assert on its LINES passed in the worktree that wrote those
 * files, passed in CI, and failed in the push lane's worktree:
 *
 *   AssertionError: expected [ '  new.updated_at := now();\r' ]
 *                   to deeply equal [ '  new.updated_at := now();' ]
 *
 * Nothing was wrong with the product, the test, or the file. This repository
 * sets `core.autocrlf = true` and `.gitattributes` declares `* text=auto`, so
 * git converts a tracked text file to CRLF WHEN IT CHECKS IT OUT. A lane that
 * creates a file has it on disk with the LF that Node wrote; a lane that
 * receives the same file through a merge has git write it, and gets CRLF. Same
 * commit, same content, different bytes on disk, and a test that splits on '\n'
 * can tell the difference.
 *
 * The line ending of a working-tree file is therefore a property of the
 * CHECKOUT and never of the code, so a test may not assert on it. Reading
 * through here removes the question. It does not fight autocrlf and it changes
 * no file on disk: only what the test sees.
 *
 * Use it for any test that reads a tracked file and compares its text. Use
 * `readFileSync` directly only when the bytes themselves are the subject, which
 * is the case for the proof artefacts pinned `text eol=lf` in `.gitattributes`.
 */
export function readRepoFile(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}
