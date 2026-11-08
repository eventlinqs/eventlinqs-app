/**
 * GUARD: AN ORGANISER'S EVENT NEVER GOES UP WITHOUT THE PHOTO THEY SENT (Lawal's law of 8 November 2026, 13:32 (4):
 * "Make it impossible to repeat: a guard and a test in the train that refuse to publish any accepted or self-listed
 * submission that carries a photo unless its photo is attached and showing").
 *
 * WHY. Kyivska Perepichka, A Moment of Sanity and Mr Snotbottom's two sessions were each sent in with the organiser's own
 * photo, accepted, and published text only on 8 November 2026: the import that listed them carried no photo, and the
 * backstop meant to add it waited for a per-row mark that a ruling withheld. Their photos went on through the live photo
 * path at 13:44 the same day. The one rule is src/lib/listings/organiser-photo-rule.ts.
 *
 * WHAT IT JUDGES, each clause printed on every run:
 *
 *   A. THE CODE (read from src, no network). The self-listing run tries the photo, then stands the rule's gate
 *      (mayStayPublished) BEFORE it records a submission published, and a night that fails it is paused, taken away and
 *      held; the hourly backstop for accepted submissions asks the rule whether a photo is still owed and waits for no
 *      approval mark; the photo is stored at the rule's one place (organiserCoverObject).
 *
 *   B. THE ROWS (read only, the service-role key). Every submission that carries a photo and is accepted or published
 *      has a PUBLISHED event whose cover is its own stored photo (isOrganiserCover's address,
 *      event-images/submissions/<id>/cover.<ext>). Any such submission with no event showing its photo fails the build,
 *      named, until its photo is on: an accepted submission is accepted to be listed, and it is listed with its photo.
 *      Without a real project address or the key it prints NOT JUDGED for the rows; clause A still runs.
 *
 * NOT JUDGED HERE, so a PASS is not read as more than it is: whether the live page draws the photo and its credit. That
 * is read on www after each car (the HTTP read of each page's image, then the 390 and 1440 look).
 */
import { existsSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'
import { selectRest, couldNotLook } from './lib/db-read.mjs'
import { tableReadCredential } from './lib/table-read-credential.mjs'

const TAG = '[organiser-photo-before-publish]'
export const RULE = 'src/lib/listings/organiser-photo-rule.ts'
export const RUN = 'src/lib/listings/self-listing-run.ts'

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null)

/** Clause A over the two files' text. Pure, so a drill and a test can hand it any source. */
export function judgeCode(rule, run) {
  const faults = []
  if (rule === null) return [`${RULE} is missing: the one rule an organiser's photo is judged by`]
  for (const name of ['mayStayPublished', 'photoStillOwed', 'isOrganiserCover', 'organiserCoverObject', 'ORGANISER_PHOTO_LAW']) {
    if (!new RegExp(`export (const|function) ${name}\\b`).test(rule)) faults.push(`${RULE} no longer exports ${name}`)
  }
  if (run === null) return [...faults, `${RUN} is missing`]
  const start = run.indexOf('export async function selfListSubmission')
  const end = run.indexOf('export async function selfListWaiting')
  if (start < 0 || end < start) return [...faults, `${RUN}: selfListSubmission could not be found to judge`]
  const self = run.slice(start, end)
  const tried = self.indexOf('const photo = await attachPhoto(')
  const gate = self.indexOf('if (!mayStayPublished(sub, photo)) {')
  const published = self.indexOf("update({ status: 'published'")
  if (tried < 0) faults.push(`${RUN}: selfListSubmission no longer tries the organiser's photo before publishing`)
  if (gate < 0 || gate < tried) faults.push(`${RUN}: selfListSubmission no longer stands the photo gate (if (!mayStayPublished(sub, photo)) {) after trying the photo`)
  if (published < 0 || published < gate) faults.push(`${RUN}: a submission is recorded published before the photo gate`)
  if (gate >= 0 && published > gate) {
    const held = self.slice(gate, published)
    if (!held.includes("update({ status: 'paused' })")) faults.push(`${RUN}: a night that fails the photo gate is no longer paused, so the hourly run would make it again`)
    if (!held.includes('await deleteEventEverywhere(')) faults.push(`${RUN}: a night that fails the photo gate is no longer taken away, so it stays up without its photo`)
    if (!held.includes("status: 'held'")) faults.push(`${RUN}: a submission whose photo failed is no longer held`)
  }
  const backstop = run.slice(run.indexOf('export async function attachApprovedPhotos'))
  if (!backstop.startsWith('export async function attachApprovedPhotos')) faults.push(`${RUN}: the hourly backstop attachApprovedPhotos is gone`)
  else {
    if (backstop.includes('photo_approved')) faults.push(`${RUN}: the backstop waits for a photo_approved mark again, which is how three organisers' photos were withheld (8 November 2026)`)
    if (!backstop.includes('if (!photoStillOwed(r, result)) continue')) faults.push(`${RUN}: the backstop no longer asks the rule (photoStillOwed) whether a photo is still owed`)
  }
  if (!run.includes('const object = organiserCoverObject(sub.id, ext)')) faults.push(`${RUN}: the photo is no longer stored at the rule's one place (organiserCoverObject), so clause B could not find it`)
  return faults
}

/** Clause B over the rows. Pure. */
export function judgeRows(submissions, events) {
  const covers = events.filter((e) => e.status === 'published').map((e) => String(e.cover_image_url ?? ''))
  return submissions
    .filter((s) => s.photo_path && (s.status === 'accepted' || s.status === 'published'))
    .filter((s) => !covers.some((c) => c.includes(`/event-images/submissions/${s.id}/cover.`)))
    .map((s) => `"${String(s.title ?? '').slice(0, 60)}" (${s.status}, submission ${s.id}) carries its organiser's photo, and no published event shows it`)
}

async function main() {
  const code = judgeCode(read(RULE), read(RUN))
  if (code.length) {
    for (const f of code) console.error(`${TAG} FAIL (A, code): ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} A, code: the self-listing run tries the photo, stands the gate before publishing, and pauses, takes away and holds a night without it; the backstop waits for no mark; one place to store it`)

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  if (!/^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/.test(url)) {
    console.log(`${TAG} B, rows: NOT JUDGED, no real Supabase project URL in the environment (${url.length} characters); clause A passed`)
    return
  }
  const credential = tableReadCredential(process.env)
  if (!credential.key) {
    console.log(`${TAG} B, rows: NOT JUDGED [no-credential]: ${credential.reason}. No submission was read; clause A passed`)
    return
  }
  const subs = await selectRest({ url, key: credential.key, query: 'listing_submissions?select=id,status,title,photo_path&photo_path=not.is.null&status=in.(accepted,published)&limit=1000' })
  if (!subs.ok) {
    console.error(`${TAG} FAIL (B, rows): ${couldNotLook('listing_submissions', subs)}`)
    process.exitCode = 1
    return
  }
  const events = await selectRest({ url, key: credential.key, query: 'events?select=id,status,cover_image_url&status=eq.published&cover_image_url=like.*%2Fevent-images%2Fsubmissions%2F*&limit=1000' })
  if (!events.ok) {
    console.error(`${TAG} FAIL (B, rows): ${couldNotLook('events', events)}`)
    process.exitCode = 1
    return
  }
  const missing = judgeRows(subs.value, events.value)
  declareWork('organiser-photo-before-publish', {
    did: { 'submission carrying a photo read': subs.value.length, 'published event on an organiser photo read': events.value.length },
    found: { 'missing organiser photo': missing.length },
    zeroIsFine: {
      'submission carrying a photo read': 'a database where no organiser has yet sent a photo has nothing to show',
      'published event on an organiser photo read': 'none is owed while no submission carries a photo',
    },
  })
  if (missing.length) {
    for (const m of missing) console.error(`${TAG} FAIL (B, rows): ${m}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} B, rows: every accepted or published submission that carries a photo (${subs.value.length}) has a published event showing its own photo`)
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/guards/organiser-photo-before-publish.mjs')) await main()
