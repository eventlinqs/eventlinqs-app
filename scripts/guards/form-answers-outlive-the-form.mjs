/**
 * A FORM'S ANSWER OUTLIVES THE FORM. A build-failing guard (window 6, 31 October 2026; Lawal's 11:13, one defect is a
 * class).
 *
 * WHY THIS EXISTS. On 31 October a venue gave its calendar and saw no 'Thank you'; it stopped one and saw no 'Stopped'.
 * The answer lived in the form's own useActionState, the action refreshed the page (revalidatePath), and the refreshed
 * page no longer drew that form, so the answer unmounted in the same commit: never seen, never read out (WCAG 2.2,
 * 4.1.3). The same was true of six more forms on /dashboard/organisation/media (a withdrawn photograph, a withdrawn
 * image, a withdrawn or given permission). They now hold their answer above the form, through
 * src/components/ui/section-answers.tsx.
 *
 * WHAT IT HOLDS, reading the source:
 *   1. useActionState is called only by section-answers.tsx, or by a file in REVIEWED below, each with the reason its
 *      form is still drawn after its own success (or its action refreshes nothing). A new form that holds its own
 *      answer fails here until it moves onto the shared path or is reviewed and listed.
 *   2. every holder a form family exports (const <Name>Answers = Answers) is drawn by at least one page under src/app,
 *      as a whole JSX tag, so the family's answers are held where its forms are drawn.
 *   3. REVIEWED holds no stale entry: a listed file that no longer calls useActionState is reported, so the list cannot
 *      rot into an unexamined allowance.
 *
 * WHAT IT CANNOT SEE: whether a page wraps the RIGHT section (a holder inside a section that itself disappears on
 * success loses the answer again); the component tests tests/component/media-answers-outlive-the-form.test.tsx and
 * venue-calendar-answer-stays.test.tsx render that case for every family. Nor the same fault built without
 * useActionState, a message in useState followed by router.refresh(): the three found on 31 October (the dispute
 * respond form, the disburse panel, the gig apply form) now keep their host drawn after the refresh, each said in its
 * own header.
 *
 * Run: node scripts/guards/form-answers-outlive-the-form.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[form-answers-outlive-the-form]'
const SHARED = 'src/components/ui/section-answers.tsx'

// Each file here keeps its own useActionState because its form is still drawn after its own success, or its action
// refreshes nothing. Read on 31 October 2026 (window 6), file:line in the reason.
const REVIEWED = {
  'src/components/listings/venue-distribution-form.tsx':
    'one form per held venue, keyed by the venue, drawn while the venue is held (media/page.tsx, the distribution section); saving changes only its boxes',
  'src/app/admin/(authed)/campaigns/campaign-controls.tsx':
    'its answers sit in the component outside its forms, and campaigns/page.tsx draws <CampaignControls> on every render',
  'src/app/admin/(authed)/matches/match-run-form.tsx': 'matches/page.tsx draws it on every render; a run changes only the results below it',
  'src/app/marketing/preferences/rights-form.tsx': 'its action (marketing-rights.ts, stopFacilitationByEmailAction) refreshes nothing',
  'src/app/unsubscribe/outreach/outreach-unsubscribe-form.tsx':
    'its action refreshes nothing; the form swaps itself for the done words on purpose and moves focus to them',
  'src/components/api-keys/api-key-manager.tsx':
    'both answers are held by the manager, which api-keys/page.tsx draws on every render; the revoke confirm form unmounts, its answer does not',
  'src/components/organisation/organisation-profile-form.tsx': 'organisation/page.tsx draws it on every render once the organisation exists',
  'src/components/organisation/tax-details-form.tsx': 'organisation/page.tsx draws it on every render once the organisation exists',
  'src/components/listings/claim-form.tsx':
    'its actions (listing-claim.ts) refresh nothing, and its media forms skip the refresh when sent from the claim (flow=claim)',
}

const rel = (p) => relative(ROOT, p).split(sep).join('/')

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(join(ROOT, 'src'), [])
const faults = []
const callers = new Set()
const holders = [] // { name, file }
const pages = []

for (const path of files) {
  const r = rel(path)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    faults.push(`${r}: could not be read (${err instanceof Error ? err.message : String(err)})`)
    continue
  }
  // Calls only, never the word in a comment: an opening bracket or a type argument follows the name.
  if (/\buseActionState\s*[<(]/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))) callers.add(r)
  for (const m of text.matchAll(/export const (\w+Answers) = Answers\b/g)) holders.push({ name: m[1], file: r })
  if (r.startsWith('src/app/')) pages.push({ r, text })
}

for (const r of callers) {
  if (r === SHARED || REVIEWED[r]) continue
  faults.push(
    `${r} calls useActionState: its answer dies with the form if the refreshed page stops drawing it. Hold it through ${SHARED} (createSectionAnswers), or review the form and list it in REVIEWED with the reason it is still drawn after its success`,
  )
}
for (const r of Object.keys(REVIEWED)) {
  if (!callers.has(r)) faults.push(`REVIEWED lists ${r}, which no longer calls useActionState: take it off the list`)
}
for (const h of holders) {
  const tag = new RegExp(`<${h.name}[\\s>]`)
  if (!pages.some((p) => tag.test(p.text))) faults.push(`${h.file} exports ${h.name}, and no page under src/app draws <${h.name}>: its forms' answers are held nowhere`)
}

console.log(`${TAG} read ${files.length} file(s): ${callers.size} call useActionState, ${holders.length} answer holder(s), ${Object.keys(REVIEWED).length} reviewed`)

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s):`)
  for (const f of faults) console.error(`    ${f}`)
  console.error('')
  console.error("  On 31 October a venue gave its calendar and saw no 'Thank you': the answer lived in the form, and")
  console.error('  the refreshed page no longer drew the form. A form answer is held above the form, or the form is')
  console.error('  reviewed as one the page still draws after its success.')
  process.exit(1)
}

declareWork('form-answers-outlive-the-form', {
  did: { 'file read': files.length, 'answer holder checked': holders.length },
  found: { fault: 0 },
  zeroIsFine: { fault: 'every form answer held where it outlives the form is the goal state' },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every form answer is held where it outlives the form, or its form is reviewed as still drawn.`)
process.exit(0)
