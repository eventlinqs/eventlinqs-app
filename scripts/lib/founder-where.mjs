/**
 * WHERE A FOUNDER SCRIPT IS RUNNING FROM (THE FOUNDER STEP LAW, Lawal, 12 November 2026, 01:16: "Fix this error in every
 * other place ... make sure it doesn't repeat itself ever").
 *
 * THE ERROR. At 00:44 a window handed Lawal `npm run migrate:production` in C:\dev\EventLinqs\wt-ticketmaster for the
 * Growth OS migration. The window then moved that tree to another branch. Lawal ran the step at 01:14: "252 migration(s)
 * in the tree, 252 applied on production, 0 pending ... Nothing to apply". The step did nothing, and nothing on screen
 * said which folder, branch or commit it had read.
 *
 * So every founder script prints, before anything else, the folder it runs from, the branch and the commit, read from
 * git at that moment, never from a note. A wrong folder can then never pass silently: the first lines say where it is.
 * scripts/guards/founder-steps-read-back.mjs fails the build if a founder step names a script that does not call this.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'))

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

/**
 * The folder, branch and commit of the tree a script runs from. A detached head says so; a folder git cannot read says
 * that too, never a guess.
 * @param {string} [root]
 * @returns {{ folder: string, branch: string, commit: string, subject: string }}
 */
export function founderWhere(root = ROOT) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
  const commit = git(['rev-parse', 'HEAD'], root)
  const subject = git(['log', '-1', '--format=%s'], root)
  return {
    folder: root,
    branch: branch === null ? '(git could not read it)' : branch === 'HEAD' ? '(detached head, no branch)' : branch,
    commit: commit ?? '(git could not read it)',
    subject: subject ?? '',
  }
}

/** The lines a founder script prints first. */
export function whereLines(where) {
  return [
    `running from the folder ${where.folder}`,
    `  branch ${where.branch}, commit ${where.commit.slice(0, 12)}${where.subject ? ` (${where.subject.slice(0, 90)})` : ''}`,
  ]
}

/**
 * Print where this founder script runs, with its tag, and return it for the script's own refusals.
 * @param {string} tag
 * @param {string} [root]
 */
export function sayWhere(tag, root = ROOT) {
  const where = founderWhere(root)
  for (const line of whereLines(where)) console.log(`${tag} ${line}`)
  return where
}
