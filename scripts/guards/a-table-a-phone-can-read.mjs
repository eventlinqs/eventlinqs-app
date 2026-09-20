/**
 * EVERY ORGANISER DATA TABLE HAS A PRESENTATION A PHONE CAN READ.
 *
 * ============================================================================
 * THE DEFECT THIS HOLDS, MEASURED RATHER THAN FEARED
 * ============================================================================
 *
 * Driven on 21 September 2026 against a served production build, signed in as
 * a real organiser with real rows, at 390, 768 and 1440
 * (scripts/verify/organiser-tables-fit-drive.mjs, evidence in
 * C:\dev\EVIDENCE\C8\organiser-tables):
 *
 *   DISCOUNT CODES. A six-column table 668px wide inside a box showing 356 of
 *   them at 390 and 478 at 768, and the box was `overflow-hidden`. That is not
 *   a scroller, it is a CLIP: Deactivate and Delete rendered at x 561 to 669,
 *   outside the visible 16 to 374, with no scrollbar and no gesture that would
 *   ever reach them. An organiser on a phone could not switch off a live
 *   discount code. Six dead controls, on every width below `lg`.
 *
 *   REACH BY CHANNEL. `overflow-x-auto`, so nothing was clipped and every
 *   width check the platform already runs passed it. Swiped to the right edge,
 *   which is the only way to read Clicks and Views, the CHANNEL scrolled off:
 *   "Email" at x -187 to -47, entirely off the phone. Four numbers with no row
 *   label and no column headings left on screen.
 *
 *   THE GST REPORT. The same, with the quarter label reduced to 23 pixels of
 *   "Jul-Sep 2026". These are the figures a person copies onto a Business
 *   Activity Statement.
 *
 * ============================================================================
 * WHY A GUARD AND NOT JUST THE FIX
 * ============================================================================
 *
 * Because this class is invisible to everything else that runs. The document
 * width drive (scripts/verify/mobile-viewport-width-drive.mjs) passes on all
 * three of those screens, correctly, because it asks whether the DOCUMENT is
 * wider than the phone and exempts anything inside an `overflow-x-auto` box.
 * That exemption is right and it is also the hiding place. Nothing in the tree
 * asked whether the row inside the box still said whose row it was.
 *
 * And the events list had already been rebuilt for exactly this, hours
 * earlier. One table was fixed, four were left, and there was no mechanism by
 * which the next table anybody adds would inherit the lesson.
 *
 * ============================================================================
 * THE SUBJECTS ARE DERIVED, NEVER TYPED
 * ============================================================================
 *
 * The file list is every file under src/app/(dashboard)/dashboard containing
 * a `<table`, found by walking the directory. There is no list in this file to
 * fall out of date, which is the C18 lesson written down: a guard that says
 * its subjects are derived and holds a typed array protects the eight things
 * somebody remembered and nothing else.
 *
 * AND IT READS CODE, NOT COMMENTS. Every file this judges now carries a
 * paragraph explaining the defect, and those paragraphs contain the exact
 * strings `overflow-x-auto` and `overflow-hidden`. A guard that greps its own
 * post-mortem passes on a violating tree, which is how hero-text-over-a-
 * photograph was found green on 20 September. Comments are stripped first.
 *
 * ============================================================================
 * THE CLAUSES
 * ============================================================================
 *
 * ONE. The table stops being a table below `lg`: `max-lg:block` on the tag.
 * `lg` and not `md`, and that was a measurement rather than a preference: this
 * dashboard sits behind a 240px fixed sidebar, so a 768px tablet leaves 478px
 * of content, which is the width of a large phone and the width at which the
 * discount codes table was still clipping six controls.
 *
 * TWO. The header goes with it: `max-lg:hidden` on the `<thead`. Five column
 * headings stacked above one card is worse than none.
 *
 * THREE. A `min-w-[...]` on the table is `lg:`-qualified. An unqualified
 * minimum width is the instruction that forces the phone-width scroller.
 *
 * FOUR. No class attribute in the file may turn on a horizontal overflow
 * behaviour at phone width. `lg:overflow-x-auto` is fine; a bare
 * `overflow-hidden` is fine only when the same attribute carries
 * `max-lg:overflow-visible`, which is how a desktop card keeps its rounded
 * corners without clipping a phone.
 *
 * FIVE. A control rendered directly inside a table body is at least 44px:
 * `ROW_CONTROL`, or an explicit `min-h-11` / `h-11`. The measured state was
 * 16px tall, at every width including 1440.
 *
 * ============================================================================
 * AND A SECOND, NARROWER SCOPE: THE ADMIN TABLES
 * ============================================================================
 *
 * The eighteen admin files with a table are held to ONE clause, the clip, and
 * the split is honest rather than convenient. Those tables are NOT cards below
 * `lg` and are not claimed to be; they scroll, which is a legitimate answer for
 * a twelve-column operations screen that a person mostly reads on a desktop.
 * What is never legitimate is a wrapper that CLIPS, because a clip cannot be
 * swiped: `/admin/audit` rendered a 1,027px table inside a box showing 340 of
 * it at 390 and 718 at 768, with fifty View buttons outside the visible area
 * and no gesture that reaches them (driven 21 September 2026,
 * scripts/verify/admin-tables-fit-drive.mjs).
 *
 * WHAT IS MEASURED THERE AND NOT ENFORCED, said plainly so the scope is not
 * read as a claim: thirteen admin tables lose the row's own name when swiped to
 * the right edge, and their controls sit between 26 and 39 pixels tall against
 * a 44px law. Both are recorded with their numbers in
 * C:\dev\REVIEW-QUEUE-C.md. They are a rebuild, not a class name, and they are
 * the next item rather than a clause added here to look complete.
 *
 * Run standalone:  node scripts/guards/a-table-a-phone-can-read.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { stripComments, lineAt } from '../lib/js-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DASHBOARD = join(ROOT, 'src', 'app', '(dashboard)', 'dashboard')
const ADMIN = join(ROOT, 'src', 'app', 'admin')
// The Windows separator, built rather than written, because a lone backslash in
// a source line is the one character every tool in this chain rewrites.
const SEP = String.fromCharCode(92)

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** Every `className="..."` and `className={`...`}` literal in the source. */
export function classAttributes(src) {
  const out = []
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{`([^`]*)`\s*\})/g
  let m
  while ((m = re.exec(src)) !== null) {
    out.push({ value: m[1] ?? m[2] ?? m[3] ?? '', index: m.index })
  }
  return out
}

/** The opening tag starting at `index`, to its closing `>`. */
export function openingTag(src, index) {
  let i = index
  let depth = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0) return src.slice(index, i + 1)
    i += 1
  }
  return src.slice(index)
}

export function classesOf(tag) {
  const m = tag.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
}

/*
 * THE OVERFLOW UTILITIES THAT CHANGE HORIZONTAL BEHAVIOUR. `overflow-y-*` is
 * not one of them and is not judged: a vertically scrolling panel is not this
 * defect and failing it would be a guard with an opinion nobody asked for.
 */
const HORIZONTAL_OVERFLOW = /(?:^|\s)((?:[a-z-]+:)*)(overflow-x-(?:auto|scroll|hidden|clip)|overflow-(?:auto|scroll|hidden|clip))(?=\s|$)/g

/*
 * THE CLIP UTILITIES ALONE. `auto` and `scroll` are not here, and the split is
 * the whole reason the admin scope exists.
 *
 * A clip cannot be swiped and a scroller can. The organiser tables are cards
 * below `lg` and need neither, so their clause forbids both. The admin tables
 * are NOT cards and legitimately scroll, so theirs forbids only the one that
 * makes a control unreachable.
 */
const CLIP_ONLY = /(?:^|\s)((?:[a-z-]+:)*)(overflow-x-(?:hidden|clip)|overflow-(?:hidden|clip))(?=\s|$)/g

/**
 * THE BOX THAT WRAPS A TABLE, judged on its own rather than on the whole file.
 *
 * A file-wide rule cannot be used on the admin surfaces: `/admin/health` holds
 * a perfectly harmless `overflow-hidden` on something that is not a table
 * wrapper, and failing the build over it would be a guard nobody keeps. The
 * window is the 400 characters before the `<table`, which is where a wrapper
 * lives in every one of these files; it is a heuristic and it is stated as
 * one, and it was checked BOTH ways before being trusted: zero hits across the
 * eighteen admin files as they now stand, and exactly one hit on the pre-fix
 * `/admin/audit`, which is the defect it exists for.
 */
export function judgeClipWrappers(raw) {
  const src = stripComments(raw)
  const findings = []
  for (const table of src.matchAll(/<table\b/g)) {
    const window_ = src.slice(Math.max(0, table.index - 400), table.index)
    for (const div of window_.matchAll(/<div[^>]*className="([^"]*)"/g)) {
      if (/\bmax-lg:overflow-visible\b/.test(div[1])) continue
      for (const hit of div[1].matchAll(CLIP_ONLY)) {
        if (/\blg:/.test(hit[1] ?? '')) continue
        findings.push({
          line: lineAt(src, table.index),
          clause: 'clip',
          message:
            `the box wrapping this <table> carries \`${hit[2]}\`, which is a CLIP and not a scroller: ` +
            'whatever is past its right edge cannot be reached by any gesture. Measured on /admin/audit at 390, ' +
            'fifty View buttons sat outside a box showing 340 of 1,027 pixels. Use `overflow-x-auto` so a finger ' +
            'can reach the row, or give the table a phone presentation.',
        })
      }
    }
  }
  return findings
}

/**
 * JUDGE ONE FILE. Pure: source in, findings out, no filesystem and no exit.
 *
 * Separated from the walk so the clauses can be unit-tested against crafted
 * markup, including the two that a guard of this shape gets wrong in practice:
 * a class string that lives inside a COMMENT, and an opening tag whose
 * className is a template literal containing a `>`.
 *
 * @returns {{ line: number, message: string, clause: string }[]}
 */
export function judgeFile(raw) {
  const findings = []
  const src = stripComments(raw)
  const note = (line, clause, message) => findings.push({ line, clause, message })
  let tables = 0
  let controls = 0

  const tableRe = /<table\b/g
  let m
  while ((m = tableRe.exec(src)) !== null) {
    tables += 1
    const line = lineAt(src, m.index)
    const tag = openingTag(src, m.index)
    const classes = classesOf(tag)

    if (!/\bmax-lg:block\b/.test(classes)) {
      note(line, 'phone-presentation', 'this <table> has no phone presentation: it needs `max-lg:block` so it stops being a five-column table below lg, the width at which the discount codes table clipped six controls.')
    }
    for (const width of classes.matchAll(/(?:^|\s)((?:[a-z-]+:)*)min-w-\[/g)) {
      if (!/\blg:/.test(width[1])) {
        note(line, 'min-width', 'this <table> carries an unqualified `min-w-[...]`, which is the instruction that forces a phone-width scroller. Qualify it `lg:min-w-[...]`.')
      }
    }

    // The thead that belongs to THIS table, not the next one in the file.
    const tableEnd = src.indexOf('</table>', m.index)
    const scope = src.slice(m.index, tableEnd === -1 ? src.length : tableEnd)
    const headIndex = scope.search(/<thead\b/)
    if (headIndex !== -1) {
      const headTag = openingTag(scope, headIndex)
      if (!/\bmax-lg:hidden\b/.test(classesOf(headTag))) {
        note(lineAt(src, m.index + headIndex), 'header', 'this <thead> stays visible below lg, where the cells have already stacked: five column headings above one card. It needs `max-lg:hidden`.')
      }
    }

    const bodyStart = scope.search(/<tbody\b/)
    if (bodyStart !== -1) {
      const bodyEnd = scope.indexOf('</tbody>', bodyStart)
      const body = scope.slice(bodyStart, bodyEnd === -1 ? scope.length : bodyEnd)
      const controlRe = /<(button|a)\b/g
      let c
      while ((c = controlRe.exec(body)) !== null) {
        controls += 1
        const controlClasses = classesOf(openingTag(body, c.index))
        if (!/ROW_CONTROL|\bmin-h-11\b|\bh-11\b|\bmin-h-\[44px\]\b|\bsize-11\b/.test(controlClasses)) {
          note(
            lineAt(src, m.index + bodyStart + c.index),
            'touch-target',
            `this <${c[1]}> inside the table body has no 44px floor. Use ROW_CONTROL from src/components/features/dashboard/row-control.ts; the measured state was 16px tall at every width.`,
          )
        }
      }
    }
  }

  for (const attribute of classAttributes(src)) {
    const neutralised = /\bmax-lg:overflow-visible\b/.test(attribute.value)
    for (const hit of attribute.value.matchAll(HORIZONTAL_OVERFLOW)) {
      const variants = hit[1] ?? ''
      if (/\blg:/.test(variants) || /\bmax-lg:/.test(variants)) continue
      if (neutralised) continue
      note(
        lineAt(src, attribute.index),
        'overflow',
        `\`${hit[2]}\` applies at phone width in a file that renders an organiser table. Qualify it \`lg:${hit[2]}\`, or pair it with \`max-lg:overflow-visible\` when the desktop card needs it only for its corners.`,
      )
    }
  }

  return Object.assign(findings, { tables, controls })
}

/*
 * THE SCAN RUNS ONLY WHEN THIS FILE IS THE ONE INVOKED.
 *
 * Without this, importing the judgement for a unit test runs the whole
 * sweep as a side effect, and on a violating tree the import calls
 * process.exit(1) and takes the test worker with it: a guard that kills
 * the suite that is checking it. The idiom is the one
 * scripts/guards/no-hardcoded-spacing.mjs already uses.
 */
const invokedDirectly =
  Boolean(process.argv[1]) && /a-table-a-phone-can-read\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const files = walk(DASHBOARD)
    .map((f) => ({ path: f, raw: readFileSync(f, 'utf8') }))
    .filter((f) => stripComments(f.raw).includes('<table'))

  if (files.length === 0) {
    console.error('[a-table-a-phone-can-read] REFUSING: no dashboard file contains a <table.')
    console.error('  Either the organiser dashboard lost every table, or this guard is looking in the wrong place.')
    console.error(`  Looked under ${relative(ROOT, DASHBOARD)}`)
    process.exit(1)
  }

  let tablesJudged = 0
  let controlsJudged = 0
  const failures = []

  for (const file of files) {
    const rel = relative(ROOT, file.path).split(SEP).join('/')
    const findings = judgeFile(file.raw)
    tablesJudged += findings.tables
    controlsJudged += findings.controls
    for (const finding of findings) failures.push(`${rel}:${finding.line}  ${finding.message}`)
  }

  /*
   * THE ADMIN SURFACES, HELD TO THE NARROWER RULE, AND SAYING SO.
   *
   * The eighteen admin files with a table are NOT cards below `lg` and are not
   * claimed to be. What is enforced here is the one clause whose failure makes
   * a control unreachable: the box wrapping a table may not CLIP it. A
   * swipeable admin table still loses its own row label at the right edge, and
   * that is measured, recorded with its numbers in C:\dev\REVIEW-QUEUE-C.md,
   * and NOT enforced yet. Saying which half is held is the difference between
   * a scope and a claim.
   */
  const adminFiles = walk(ADMIN)
    .map((f) => ({ path: f, raw: readFileSync(f, 'utf8') }))
    .filter((f) => stripComments(f.raw).includes('<table'))

  if (adminFiles.length === 0) {
    console.error('[a-table-a-phone-can-read] REFUSING: no admin file contains a <table, which was true of eighteen of them.')
    console.error(`  Looked under ${relative(ROOT, ADMIN)}`)
    process.exit(1)
  }

  let adminTables = 0
  for (const file of adminFiles) {
    const rel = relative(ROOT, file.path).split(SEP).join('/')
    adminTables += [...stripComments(file.raw).matchAll(/<table\b/g)].length
    for (const finding of judgeClipWrappers(file.raw)) {
      failures.push(`${rel}:${finding.line}  ${finding.message}`)
    }
  }

  console.log(`[a-table-a-phone-can-read] ${files.length} dashboard file(s) with a table, ${tablesJudged} table(s), ${controlsJudged} in-body control(s) judged.`)
  console.log(`[a-table-a-phone-can-read] ${adminFiles.length} admin file(s) with a table, ${adminTables} table(s), judged for a CLIPPING wrapper only.`)

  if (failures.length > 0) {
    console.error(`[a-table-a-phone-can-read] FAIL - ${failures.length} problem(s):`)
    for (const failure of failures) console.error(`  ${failure}`)
    console.error('')
    console.error('  The pattern is one DOM and CSS only: below lg the table parts become blocks,')
    console.error('  the header hides, and each row is a bordered card whose numbers carry their')
    console.error('  own headings. src/app/(dashboard)/dashboard/events/events-table.tsx is the')
    console.error('  reference, and it says in its own comment why it is not two DOMs.')
    process.exit(1)
  }

  console.log('[a-table-a-phone-can-read] PASS - every organiser table has a presentation a phone can read.')
}
