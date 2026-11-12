/**
 * A KIT SENT READS THE TOUCH (order 4, Release 2 item 9: "kit sent recorded apart from kit used"; WINDOW 5A,
 * 13 November 2026).
 *
 * A partner kit reaches its organiser by hand (Lawal marks it sent on /admin/social: a social_piece_postings row,
 * post_url 'sent') or by email (he sends the message carrying the kit's own tracked link, and the Sent Items sync records
 * that touch as 'sent'). Five readers judged whether a piece had gone from the postings alone (the founder dashboard's
 * kits sent, the social report, /admin/social's piece state, /admin/today's withdrawn images, the withdrawal message's
 * wait), so a kit Lawal sent from his own mailbox read as never sent.
 *
 * Whether a kit went is decided in src/lib/social/kit-sent.ts and nowhere else. This fails the build where a file in
 * src/ reads social_piece_postings and neither goes through that module nor reads public posts only (the same read
 * leaves out post_url 'sent', so no partner kit is in it). A read is a .from('social_piece_postings') select or the rows
 * embedded in another table's select. Comments are stripped first. It also fails if the module
 * stops reading the touch in state 'sent' by its tracked link.
 */
import { relative, resolve } from 'node:path'
import { readSource, sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[kit-sent-reads-the-touch]'
const ROOT = process.cwd()
const THE_RULE = 'src/lib/social/kit-sent.ts'
const READS_POSTINGS = /\.from\(\s*['"`]social_piece_postings['"`]\s*\)\s*\.select\(/g
// The same rows embedded in another table's select, as the social pieces' readers take them.
const EMBEDS_POSTINGS = /social_piece_postings(?:!inner)?\(/g
const USES_THE_RULE = /from\s+['"`](?:@\/lib\/social\/kit-sent|\.\/kit-sent|\.\.\/social\/kit-sent)['"`]/
const PUBLIC_POSTS_ONLY = /\.neq\(\s*['"`]post_url['"`]\s*,\s*['"`]sent['"`]\s*\)/
const WINDOW_LINES = 12

const files = sourceFiles(ROOT)
const failures = []
let ruleSeen = false
let readers = 0
let publicOnly = 0
for (const file of files) {
  const rel = relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
  if (!rel.startsWith('src/') || rel.startsWith('src/types/')) continue
  const code = readSource(resolve(ROOT, file)).withStrings
  if (rel === THE_RULE) {
    ruleSeen = true
    if (!/\.from\(\s*['"`]outreach_touches['"`]\s*\)/.test(code) || !/\.eq\(\s*['"`]state['"`]\s*,\s*['"`]sent['"`]\s*\)/.test(code) || !/['"`]tracked_link['"`]/.test(code)) {
      failures.push(`${THE_RULE} no longer reads the touch Lawal sent (outreach_touches, state 'sent', by tracked_link): a kit sent from his mailbox would read as never sent.`)
    }
    continue
  }
  const uses = USES_THE_RULE.test(code)
  const reads = []
  for (const re of [READS_POSTINGS, EMBEDS_POSTINGS]) {
    re.lastIndex = 0
    let found
    while ((found = re.exec(code)) !== null) reads.push(found)
  }
  for (const m of reads) {
    readers += 1
    const after = code.slice(m.index).split('\n').slice(0, WINDOW_LINES).join('\n')
    if (PUBLIC_POSTS_ONLY.test(after)) {
      publicOnly += 1
      continue
    }
    if (!uses) {
      const line = code.slice(0, m.index).split('\n').length
      failures.push(`${rel}:${line} judges whether a piece went from social_piece_postings alone: a partner kit Lawal sent by email would read as never sent. Read it through ${THE_RULE}, or leave out post_url 'sent' if only public posts are meant.`)
    }
  }
}
if (!ruleSeen) failures.push(`${THE_RULE} is missing: the one rule for whether a partner kit went is gone.`)

declareWork('kit-sent-reads-the-touch', {
  did: { 'source file': files.length, 'postings reader': readers, 'public posts only': publicOnly },
  found: { failure: failures.length },
})
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} read(s) of whether a kit went miss the touch Lawal sent.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${readers} postings readers: ${publicOnly} read public posts only, the rest go through ${THE_RULE}.`)
