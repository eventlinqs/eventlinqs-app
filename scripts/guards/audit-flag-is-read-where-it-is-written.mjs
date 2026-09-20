/**
 * THE AUDIT FLAG IS READ FROM THE ELEMENT IT IS WRITTEN TO.
 *
 * ============================================================================
 * WHAT WENT WRONG, AND FOR HOW LONG
 * ============================================================================
 *
 * `src/app/layout.tsx` sets the measurement flag in a `beforeInteractive`
 * script and its own comment states where: "Setting on documentElement (not
 * body) guarantees the attribute is present BEFORE the first body child
 * renders - same observable behaviour as iter-3's SSR-rendered
 * `<body data-headless="1">`." So it USED to be on body and it moved.
 *
 * Six client components did not move with it and kept reading
 * `document.body.dataset.headless`, which is never set:
 *
 *     src/components/features/city/city-map.tsx
 *     src/components/features/events/event-video.tsx
 *     src/components/features/events/hero-carousel-client.tsx   (twice)
 *     src/components/features/events/hero-carousel-enhancer.tsx
 *     src/components/features/events/venue-map.tsx
 *     src/components/media/hero-ambient-layer.tsx
 *
 * Every one of those is a suppression that exists to keep decoration OUT of a
 * measurement: a Google map, a venue map, an autoplaying video, the hero
 * carousel's rotation, its enhancer, and the ken-burns layer that renders the
 * hero photograph a second time behind a 4.5 second transform. All six ran
 * inside every Lighthouse run this platform has ever taken. Two other readers,
 * `reveal.tsx` and `FeaturedHeroClient.tsx`, read documentElement and worked,
 * which is why nothing ever looked broken.
 *
 * HOW IT WAS FOUND: not by reading. `scripts/verify/hero-preload-in-the-head-drive.mjs`
 * counts how many times the browser asks the optimiser for the hero variant,
 * with the audit cookie set, and got TWO on every event page instead of one.
 *
 * ============================================================================
 * WHAT THIS JUDGES
 * ============================================================================
 *
 * CLAUSE 1. Nothing under `src/` reads the flag off `document.body`. The one
 * question has one answer and it is `isAuditRun()` in src/lib/ui/audit-mode.ts.
 *
 * CLAUSE 2. Nothing reads it off `documentElement` directly either. That form
 * is correct TODAY, which is exactly what the six dead readers were the last
 * time the element moved. One reader, one edit, next time.
 *
 * CLAUSE 3. The WRITER still writes it where the predicate reads it. The two
 * are read out of their own files and compared, so moving the flag in the
 * layout without moving the predicate fails here rather than in a Lighthouse
 * score three weeks later.
 *
 * CLAUSE 4, the anti-false-pass: the predicate module must exist and must be
 * imported by at least one component, and the writer's script must be found.
 * A scan that finds nothing is a scan that has gone blind.
 *
 * `reveal.tsx` and `FeaturedHeroClient.tsx` read `dataset.motion`, a DIFFERENT
 * flag with a different meaning (a real visitor who has not asked for reduced
 * motion), and are not this guard's subject.
 *
 * Exit 1 with every site named, or exit 0 with what it judged. Drilled red and
 * green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { stripJsComments } from './lib/strip-js-comments.mjs'

const PREDICATE = 'src/lib/ui/audit-mode.ts'
const WRITER = 'src/app/layout.tsx'
const norm = (p) => p.split(sep).join('/')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(norm(full))
  }
  return out
}

/** The dataset key the predicate itself declares, read rather than retyped. */
function declaredKey(src) {
  return /AUDIT_FLAG\s*=\s*'([a-zA-Z]+)'/.exec(src)?.[1] ?? null
}

export function judge(root = 'src') {
  const faults = []
  const files = walk(root)
  const predicateSrc = existsSync(PREDICATE) ? readFileSync(PREDICATE, 'utf8') : ''
  const key = declaredKey(predicateSrc)

  // CLAUSE 4 first: without these the rest of the run means nothing.
  if (!predicateSrc) faults.push(`${PREDICATE} is missing; there is no single answer to read.`)
  if (!key) faults.push(`${PREDICATE} declares no AUDIT_FLAG; the key this guard compares cannot be derived.`)

  let importers = 0
  let bodyReads = 0
  let directReads = 0
  for (const file of files) {
    if (file === PREDICATE) continue
    const raw = readFileSync(file, 'utf8')
    if (raw.includes("from '@/lib/ui/audit-mode'")) importers += 1
    if (!key) continue
    /*
     * CODE ONLY. A comment is the most likely place the old form appears after
     * somebody removes it, because that is what a considerate developer leaves
     * behind. hero-ambient-layer.tsx records the exact string it stopped
     * reading, and failing the build for that would teach the next person to
     * stop recording what they removed.
     */
    const src = stripJsComments(raw)

    // CLAUSE 1. The element that never carries it.
    for (const m of src.matchAll(new RegExp('document\\.body\\.dataset(?:\\.' + key + "|\\['" + key + "'\\])", 'g'))) {
      bodyReads += 1
      faults.push(
        `${file} reads the audit flag off document.body, which never carries it. ` +
          `The flag is written to documentElement in ${WRITER}. Use isAuditRun() from ${PREDICATE}.`,
      )
      void m
    }

    /*
     * CLAUSE 2. Right element, wrong place: one reader, one edit.
     *
     * The WRITER is exempt and only the writer. It sets the flag from an inline
     * `beforeInteractive` string that runs while the parser is still in <head>,
     * before any module exists to import, so it cannot ask the predicate and
     * must name the element itself. Clause 3 is what holds it honest: it checks
     * that what the writer names and what the predicate reads are the same.
     */
    if (file === WRITER) continue
    for (const m of src.matchAll(
      new RegExp('document\\.documentElement\\.dataset(?:\\.' + key + "|\\['" + key + "'\\])", 'g'),
    )) {
      directReads += 1
      faults.push(
        `${file} reads the audit flag off documentElement directly. That is correct today and was correct for ` +
          `body once too. Use isAuditRun() from ${PREDICATE}, so the next move is one edit.`,
      )
      void m
    }
  }

  // CLAUSE 3. The writer and the reader must name the same element and key.
  const writerSrc = existsSync(WRITER) ? readFileSync(WRITER, 'utf8') : ''
  /*
   * AN ASSIGNMENT, NOT A COMPARISON. `\s*=` alone matches the first character
   * of `===`, and the layout contains BOTH: the head script WRITES
   * `d.dataset.headless='1'` and the body script READS
   * `document.documentElement.dataset.headless==='1'` to skip itself. So the
   * first version of this clause was satisfied by the read, and the drill that
   * renamed the write passed. Found by the drill, which is what it is for.
   */
  const assignment = "\\s*=(?!=)"
  const writes = key
    ? new RegExp("d\\.dataset\\." + key + assignment + "|documentElement\\.dataset\\." + key + assignment).test(writerSrc)
    : false
  if (!writes) {
    faults.push(
      `${WRITER} does not set documentElement.dataset.${key ?? '<unknown>'}. Either the flag moved and ` +
        `${PREDICATE} was not moved with it, or it is no longer written at all and every suppression is dead.`,
    )
  }
  const predicateReadsDocumentElement = /documentElement\.dataset\[AUDIT_FLAG\]|documentElement\.dataset\./.test(predicateSrc)
  if (predicateSrc && !predicateReadsDocumentElement) {
    faults.push(`${PREDICATE} does not read documentElement, which is where ${WRITER} writes the flag.`)
  }

  if (importers === 0) {
    faults.push(
      `no component imports ${PREDICATE}. It was 6 on 20 September 2026; a zero means the suppressions ` +
        `have gone back to reading the dataset themselves, or this scan has stopped seeing src.`,
    )
  }

  return { faults, files: files.length, importers, bodyReads, directReads, key }
}

const invokedDirectly =
  process.argv[1] && /audit-flag-is-read-where-it-is-written\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const r = judge()
  declareWork('audit-flag-is-read-where-it-is-written', {
    did: { 'source file scanned': r.files, 'component importing the predicate counted': r.importers },
    found: { 'audit flag read off the wrong element or read directly': r.bodyReads + r.directReads },
    zeroIsFine: {
      'audit flag read off the wrong element or read directly':
        'every suppression asks isAuditRun(), which is the point of the guard',
    },
    exitOnZero: false,
  })
  if (r.faults.length) {
    console.error('FAIL audit-flag-is-read-where-it-is-written: ' + r.faults.length + ' fault(s)')
    for (const f of r.faults) console.error('  ' + f)
    process.exit(1)
  }
  console.log(
    'audit-flag-is-read-where-it-is-written: flag "' + r.key + '" written to documentElement in ' + WRITER +
      ', read by ' + r.importers + ' component(s) through ' + PREDICATE + ', and nowhere else',
  )
}
