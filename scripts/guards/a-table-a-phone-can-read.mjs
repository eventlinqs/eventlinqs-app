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
 * ONE. The table stops being a table below its breakpoint, and the breakpoint
 * is whichever of the two shapes the table uses (see above). `lg` is the
 * default one and that was a measurement rather than a preference: the
 * organiser dashboard sits behind a 240px fixed sidebar and the admin sidebar
 * is `hidden ... lg:block`, so `lg` is the exact width at which both stop being
 * a single column.
 *
 * TWO. The header goes with it: `max-{bp}:hidden` on the `<thead`, or
 * `sr-only`, which hides it visually and keeps it for a screen reader. Five
 * column headings stacked above one card is worse than none.
 *
 * THREE. A `min-w-[...]` on the table is qualified at or above the breakpoint.
 * An unqualified minimum width is the instruction that forces the phone-width
 * scroller.
 *
 * FOUR. No class attribute in the file may turn on a horizontal overflow
 * behaviour below the breakpoint. `lg:overflow-x-auto` is fine; a bare
 * `overflow-hidden` is fine only when the same attribute carries
 * `max-lg:overflow-visible`, which is how a desktop card keeps its rounded
 * corners without clipping a phone.
 *
 * FIVE. A control rendered directly inside a table body is at least 44px:
 * `ROW_CONTROL`, `ADMIN_ROW_CONTROL`, or an explicit `min-h-11` / `h-11`. The
 * measured state was 16px tall on the dashboard at every width including 1440,
 * and 28 to 33px on the admin screens.
 *
 * ============================================================================
 * THE ADMIN TABLES JOINED THE FULL SCOPE ON 21 SEPTEMBER 2026
 * ============================================================================
 *
 * They used to be held to ONE clause, the clip, with this file saying plainly
 * what it was not holding: "thirteen admin tables lose the row's own name when
 * swiped to the right edge, and their controls sit between 19 and 39 pixels
 * tall". That was true, recorded with its numbers, and it has now been fixed
 * and measured (scripts/verify/admin-tables-fit-drive.mjs, evidence in
 * C:\dev\EVIDENCE\C8\admin-tables). So the admin files are judged by the same
 * five clauses as the dashboard, and the sentence above is history rather than
 * a scope.
 *
 * EVERY OTHER table under src, the checkout tax invoice, the orders table, the
 * payouts history and the marketing pricing page, is still held to exactly one:
 * the box wrapping it may not CLIP it. That half stays wide because it costs
 * nothing: none of them clips today.
 *
 * ============================================================================
 * THE BREAKPOINT IS DERIVED FROM THE TABLE, NOT ASSUMED TO BE `lg`
 * ============================================================================
 *
 * Two shapes of phone presentation exist in this tree and both are correct:
 *
 *   `max-lg:block` on the `<table>`          - the shared pattern, 16 admin
 *                                              files and the dashboard's five
 *   `block ... md:table-row` on each `<tr>`  - /admin/traffic, built in
 *                                              September and measured passing
 *                                              at 390, 768 and 1440
 *
 * A guard that demanded the first would have failed a screen that passes the
 * drive, which is a guard being wrong. So clause ONE finds the breakpoint the
 * table actually uses, and every other clause is then expressed RELATIVE to
 * it: the header must hide below it, a minimum width must be qualified at or
 * above it, and a horizontal overflow must not apply below it. One derived
 * number rather than four lists of accepted spellings.
 *
 * ============================================================================
 * WHAT THIS FILE CANNOT SEE, SAID SO IT IS NOT MISTAKEN FOR COVERAGE
 * ============================================================================
 *
 * Clause FIVE judges `<button>`, `<a>` and `<Link>` written in the file. A
 * COMPONENT that renders a button (`<ConfirmSubmitButton>`, `<SettleButton>`,
 * `<AuditDetailButton>`) carries its className at a call site as an expression
 * or not at all, and resolving that statically would be a type checker. Those
 * are judged by the DRIVE, which measures the rendered pixel height at three
 * widths, and all three were measured on 21 September 2026.
 *
 * AND THE CONSTANTS IT ACCEPTS BY NAME ARE VERIFIED, NOT TRUSTED. `ROW_CONTROL`
 * and `ADMIN_ROW_CONTROL` are accepted as satisfying the 44px floor, so this
 * guard reads both modules and fails if either constant has stopped carrying
 * one. A guard that accepts a name is only as good as what the name holds.
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
const SRC = join(ROOT, 'src')

/*
 * THE TWO ADMIN FILES ANOTHER LANE OWNS, AND THE MECHANISM THAT DELETES THIS
 * LIST BY ITSELF.
 *
 * The three-lane protocol gives "pricing configuration" and "analytics" to lane
 * B, and both of these are lane B's by that wording and by its recent commits.
 * Lane C rebuilt the other sixteen admin tables on 21 September 2026 and raised
 * these two as BORDER lines in C:\dev\REVIEW-QUEUE-C.md rather than editing a
 * file another lane is working in: on 20 September two lanes fixed the same
 * sideways scroll on the same day and the duplicate refused the merge five
 * times.
 *
 * AN EXEMPTION THAT SURVIVES ITS REASON IS AN ALLOWLIST, so this one cannot.
 * Each entry is re-judged on every run and the build FAILS if an exempt file
 * has stopped violating, naming the line to delete. The debt clears itself the
 * moment lane B pays it, which is the same mechanism the marketplace notify
 * border used on the same day.
 */
const BORDERED = [
  {
    file: 'src/app/admin/(authed)/pricing/page.tsx',
    why: "lane B owns pricing configuration; BORDER raised in C:/dev/REVIEW-QUEUE-C.md on 21 September 2026",
  },
  {
    file: 'src/app/admin/(authed)/network/page.tsx',
    why: "lane B owns the growth and analytics screens; BORDER raised in C:/dev/REVIEW-QUEUE-C.md on 21 September 2026",
  },
]
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

/**
 * EVERY `const NAME = '...'` IN A SOURCE, exported or not.
 *
 * THE REASON THIS EXISTS, and it is the first thing that went wrong when admin
 * joined the scope: these classes are no longer written at the call site. A
 * table now reads `className={`${ADMIN_TABLE} lg:min-w-[720px]`}`, and a guard
 * matching on `max-lg:block` sees a template literal and a name. It failed
 * sixteen files that were all correct.
 *
 * Accepting the NAME would have been the cheap answer and it is the wrong one:
 * a guard that passes anything mentioning ADMIN_TABLE stops judging the day the
 * constant changes. So the constant is RESOLVED to its value and the real
 * classes are judged, which is the same thing a browser does.
 *
 * Non-exported constants are collected too, because the shared module composes
 * its skins from private shapes (`WRAP_SHAPE`, `ROW_SHAPE`) and a call site's
 * `btnClass` is a local.
 */
export function constantsIn(src) {
  const out = new Map()
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g
  let m
  while ((m = re.exec(src)) !== null) out.set(m[1], m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

/**
 * RESOLVE A className EXPRESSION AGAINST THOSE CONSTANTS.
 *
 * Two forms and deliberately no more: the whole expression IS an identifier
 * (`className={btnClass}`), and `${NAME}` inside a template. A bare identifier
 * in the middle of a class list is not substituted, because `relative` and
 * `block` are class names, and a resolver that guessed would rewrite them.
 *
 * Six passes, because the module composes a skin from a shape and a call site
 * composes from the skin. Bounded so a constant that refers to itself cannot
 * spin.
 */
export function expandClasses(expression, constants) {
  let out = String(expression ?? '').trim()
  if (constants.has(out)) out = constants.get(out)
  for (let pass = 0; pass < 6; pass += 1) {
    const next = out.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, name) =>
      constants.has(name) ? constants.get(name) : whole,
    )
    if (next === out) break
    out = next
  }
  return out
}

/*
 * THE BREAKPOINTS A PHONE PRESENTATION MAY USE, smallest first.
 *
 * `sm` is not one of them, and that is the whole point of the list being a
 * list: 640px is a large phone, so a table that only becomes readable from
 * `sm` up is still a sideways scroller on the device this guard exists for.
 * /admin/health used to do exactly that.
 */
const BREAKPOINTS = ['md', 'lg']

/*
 * WHAT COUNTS AS THE EDGE OF A CLASS NAME, and why it is not just whitespace.
 *
 * The first version anchored on `\s`, and it read `md:table-row` correctly out
 * of `"block md:table-row md:py-0"` and not at all out of
 * `"block md:table-row"`, where the next character is the closing quote. One
 * unit test caught it; a real file would have hidden it for as long as its
 * last class happened not to be the one being looked for.
 */
const CLASS_EDGE = '[\\s' + String.fromCharCode(34) + String.fromCharCode(39) + String.fromCharCode(96) + ']'

/** Does this class list contain exactly this utility? */
export function hasClass(haystack, utility) {
  const escaped = utility.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|${CLASS_EDGE})${escaped}(?=${CLASS_EDGE}|$)`).test(haystack ?? '')
}

/**
 * THE BREAKPOINT BELOW WHICH THIS TABLE STOPS BEING A TABLE, or null.
 *
 * Two shapes, both real, both measured passing at 390, 768 and 1440:
 *   `max-lg:block` on the <table>           -> 'lg'
 *   `block ... md:table-row` on its rows    -> 'md'   (/admin/traffic)
 *
 * Returning null is clause ONE failing, and the caller says so.
 */
export function breakpointOf(tableClasses, tableScope) {
  for (const bp of BREAKPOINTS) {
    if (hasClass(tableClasses, `max-${bp}:block`)) return bp
  }
  for (const bp of BREAKPOINTS) {
    if (hasClass(tableScope, `${bp}:table-row`)) return bp
  }
  return null
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
export function judgeClipWrappers(raw, shared = new Map()) {
  const src = stripComments(raw)
  const constants = new Map([...shared, ...constantsIn(src)])
  const findings = []
  for (const table of src.matchAll(/<table\b/g)) {
    const window_ = src.slice(Math.max(0, table.index - 400), table.index)
    /*
     * A plain string OR a braced expression, because the wrapper is now
     * `className={ADMIN_TABLE_WRAP}` on sixteen admin screens and a pattern
     * that only read `className="..."` stopped seeing any of them.
     */
    for (const div of window_.matchAll(/<div[^>]*className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      const value = expandClasses(div[1] ?? div[2] ?? '', constants)
      if (/\bmax-lg:overflow-visible\b/.test(value)) continue
      for (const hit of value.matchAll(CLIP_ONLY)) {
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
 * IS A BORDER STILL EARNED? Pure, so both branches have a test.
 *
 * A border is a promise that another lane owns this file and that the defect is
 * still in it. Both halves of that promise can stop being true, and neither
 * announces itself:
 *
 *   the file stops holding a table   the entry now exempts nothing
 *   the file stops violating         the other lane has paid it
 *
 * Either way the line has to go, and a guard that would not notice is an
 * allowlist with a nicer name. The cross-lane debt in src/lib/marketplace's
 * guards cleared itself by exactly this mechanism on 21 September 2026.
 *
 * @param {{ file: string, why: string }} entry
 * @param {number|null} outstanding findings, or null when the file is gone
 * @returns {string|null} the failure line, or null when the border is earned
 */
export function judgeBorder(entry, outstanding) {
  if (outstanding === null) {
    return `${entry.file}  is bordered here and no longer holds a table. Delete the entry in BORDERED.`
  }
  if (outstanding === 0) {
    return `${entry.file}  is bordered here but now passes all five clauses. The lane that owns it has paid it: delete its entry from BORDERED so it is enforced, and the matching entry in scripts/verify/admin-tables-fit-drive.mjs.`
  }
  return null
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
export function judgeFile(raw, shared = new Map()) {
  const findings = []
  const src = stripComments(raw)
  /*
   * The file's own constants win over the shared ones, because a local
   * `btnClass` is what that call site actually renders.
   */
  const constants = new Map([...shared, ...constantsIn(src)])
  const classesIn = (tag) => expandClasses(classesOf(tag), constants)
  const note = (line, clause, message) => findings.push({ line, clause, message })
  let tables = 0
  let controls = 0
  /*
   * THE BREAKPOINTS THE FILE'S OWN TABLES CHOSE. The overflow clause is judged
   * against these rather than against a constant, because a file whose table
   * becomes cards at `md` is entitled to an `md:`-qualified scroller and is
   * NOT entitled to an unqualified one.
   */
  const chosen = new Set()

  const tableRe = /<table\b/g
  let m
  while ((m = tableRe.exec(src)) !== null) {
    tables += 1
    const line = lineAt(src, m.index)
    const tag = openingTag(src, m.index)
    const classes = classesIn(tag)

    // The scope of THIS table, not the next one in the file.
    const tableEnd = src.indexOf('</table>', m.index)
    const scope = src.slice(m.index, tableEnd === -1 ? src.length : tableEnd)

    const bp = breakpointOf(classes, scope)
    if (bp === null) {
      note(line, 'phone-presentation', 'this <table> has no phone presentation. Either `max-lg:block` on the tag, so it stops being a multi-column table below lg (src/components/admin/table-card.ts), or `md:table-row` on each row, which is the shape /admin/traffic uses. Below lg the discount codes table clipped six controls and thirteen admin tables lost the row\'s own name.')
      continue
    }
    chosen.add(bp)

    for (const width of classes.matchAll(/(?:^|\s)((?:[a-z-]+:)*)min-w-\[/g)) {
      if (!qualifiedAtOrAbove(width[1], bp)) {
        note(line, 'min-width', `this <table> carries a \`min-w-[...]\` that applies below \`${bp}\`, which is the instruction that forces a phone-width scroller. Qualify it \`${bp}:min-w-[...]\`.`)
      }
    }

    const headIndex = scope.search(/<thead\b/)
    if (headIndex !== -1) {
      const headClasses = classesIn(openingTag(scope, headIndex))
      const hidden = hasClass(headClasses, `max-${bp}:hidden`) || hasClass(headClasses, 'sr-only')
      if (!hidden) {
        note(lineAt(src, m.index + headIndex), 'header', `this <thead> stays visible below \`${bp}\`, where the cells have already stacked: five column headings above one card. It needs \`max-${bp}:hidden\`, or \`sr-only\` if a screen reader should keep them.`)
      }
    }

    const bodyStart = scope.search(/<tbody\b/)
    if (bodyStart !== -1) {
      const bodyEnd = scope.indexOf('</tbody>', bodyStart)
      const body = scope.slice(bodyStart, bodyEnd === -1 ? scope.length : bodyEnd)
      /*
       * `<Link>` is here and a component that renders a button is not. Next's
       * Link emits an `<a>` and carries its className at the call site, so it
       * is judgeable; `<ConfirmSubmitButton className={btnClass}>` is not, and
       * the file header says which half the drive holds instead.
       */
      const controlRe = /<(button|a|Link)\b/g
      let c
      while ((c = controlRe.exec(body)) !== null) {
        controls += 1
        const controlClasses = classesIn(openingTag(body, c.index))
        if (!TOUCH_FLOOR.test(controlClasses)) {
          note(
            lineAt(src, m.index + bodyStart + c.index),
            'touch-target',
            `this <${c[1]}> inside the table body has no 44px floor. Use ROW_CONTROL (src/components/features/dashboard/row-control.ts) or ADMIN_ROW_CONTROL (src/components/admin/table-card.ts); the measured state was 16px tall on the dashboard and 28 to 33px in admin.`,
          )
        }
      }
    }
  }

  /*
   * The overflow clause needs a breakpoint and a file with no judgeable table
   * has none. `lg` is the floor rather than a guess: it is the strictest of the
   * two, so a file whose tables all failed clause ONE is not also let off this.
   */
  const floor = chosen.has('md') && !chosen.has('lg') ? 'md' : 'lg'
  for (const raw_ of classAttributes(src)) {
    const attribute = { value: expandClasses(raw_.value, constants), index: raw_.index }
    const neutralised = hasClass(attribute.value, `max-${floor}:overflow-visible`)
    for (const hit of attribute.value.matchAll(HORIZONTAL_OVERFLOW)) {
      const variants = hit[1] ?? ''
      if (qualifiedAtOrAbove(variants, floor)) continue
      if (new RegExp(String.raw`(?:^|\s|:)max-${floor}:`).test(variants)) continue
      if (neutralised) continue
      note(
        lineAt(src, attribute.index),
        'overflow',
        `\`${hit[2]}\` applies below \`${floor}\` in a file that renders a data table. Qualify it \`${floor}:${hit[2]}\`, or pair it with \`max-${floor}:overflow-visible\` when the desktop card needs it only for its corners.`,
      )
    }
  }

  return Object.assign(findings, { tables, controls })
}

/**
 * THE 44px FLOOR, spelled every way this tree spells it.
 *
 * The two NAMED constants are accepted as names, and the runner then reads
 * both modules and fails if either has stopped carrying a floor. That check is
 * the price of accepting a name at all.
 */
const TOUCH_FLOOR = /ROW_CONTROL|\bmin-h-11\b|\bh-11\b|\bmin-h-\[44px\]\b|\bsize-11\b/

/** Does this variant prefix mean "at or above `bp`"? */
export function qualifiedAtOrAbove(variants, bp) {
  const from = BREAKPOINTS.indexOf(bp)
  for (let i = from; i < BREAKPOINTS.length; i += 1) {
    if (new RegExp(String.raw`(?:^|\s|:)${BREAKPOINTS[i]}:`).test(variants ?? '')) return true
  }
  return false
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
  const relOf = (path) => relative(ROOT, path).split(SEP).join('/')

  /*
   * THE SHARED CLASS MODULES, READ ONCE AND RESOLVED INTO EVERY JUDGEMENT.
   *
   * These two files hold the actual class strings every dashboard and admin
   * table now renders. Without them this guard reads `${ADMIN_TABLE}` and
   * judges a variable name, which is how its first run failed sixteen files
   * that were all correct.
   */
  const SHARED_CLASS_MODULES = [
    'src/components/features/dashboard/row-control.ts',
    'src/components/admin/table-card.ts',
  ]
  const shared = new Map()
  for (const module_ of SHARED_CLASS_MODULES) {
    const source = stripComments(readFileSync(join(ROOT, module_), 'utf8'))
    for (const [name, value] of constantsIn(source)) shared.set(name, value)
  }
  for (const [name, value] of shared) {
    if (/ROW_CONTROL$/.test(name) && !/\bmin-h-11\b|\bh-11\b|\bmin-h-\[44px\]\b/.test(value)) {
      console.error(`[a-table-a-phone-can-read] REFUSING: ${name} carries no 44px floor: "${value}"`)
      console.error('  Clause FIVE also accepts the bare NAME, for a call site this resolver cannot')
      console.error('  reach, so the constant behind the name has to be the floor it claims to be.')
      process.exit(1)
    }
  }
  if (![...shared.keys()].some((n) => /ROW_CONTROL$/.test(n))) {
    console.error('[a-table-a-phone-can-read] REFUSING: no *ROW_CONTROL constant found in the shared modules.')
    console.error(`  Looked in ${SHARED_CLASS_MODULES.join(', ')}`)
    process.exit(1)
  }

  /*
   * THE FULL FIVE CLAUSES, on the organiser dashboard AND on admin.
   *
   * Admin joined on 21 September 2026 when its sixteen non-bordered tables were
   * rebuilt and driven. Before that it was held to the clip alone, and this
   * file said so.
   */
  const bordered = new Set(BORDERED.map((b) => b.file))
  const files = [...walk(DASHBOARD), ...walk(ADMIN)]
    .map((f) => ({ path: f, raw: readFileSync(f, 'utf8'), rel: relOf(f) }))
    .filter((f) => stripComments(f.raw).includes('<table'))

  if (files.length === 0) {
    console.error('[a-table-a-phone-can-read] REFUSING: no dashboard or admin file contains a <table.')
    console.error('  Either both surfaces lost every table, or this guard is looking in the wrong place.')
    console.error(`  Looked under ${relOf(DASHBOARD)} and ${relOf(ADMIN)}`)
    process.exit(1)
  }

  let tablesJudged = 0
  let controlsJudged = 0
  const failures = []
  let adminJudged = 0

  for (const file of files) {
    if (bordered.has(file.rel)) continue
    const findings = judgeFile(file.raw, shared)
    tablesJudged += findings.tables
    controlsJudged += findings.controls
    if (file.rel.includes('src/app/admin')) adminJudged += findings.tables
    for (const finding of findings) failures.push(`${file.rel}:${finding.line}  ${finding.message}`)
  }

  /*
   * THE BORDERED FILES, RE-JUDGED SO THE EXEMPTION CANNOT OUTLIVE ITS REASON.
   */
  for (const entry of BORDERED) {
    const match = files.find((f) => f.rel === entry.file)
    const outstanding = match === undefined ? null : judgeFile(match.raw, shared).length
    console.log(
      `[a-table-a-phone-can-read] BORDERED ${entry.file} - ` +
        `${outstanding === null ? 'file absent or holds no table' : `${outstanding} finding(s)`} not enforced: ${entry.why}`,
    )
    const verdict = judgeBorder(entry, outstanding)
    if (verdict) failures.push(verdict)
  }

  const clipFiles = walk(SRC)
    .map((f) => ({ path: f, raw: readFileSync(f, 'utf8') }))
    .filter((f) => stripComments(f.raw).includes('<table'))

  if (clipFiles.length === 0) {
    console.error('[a-table-a-phone-can-read] REFUSING: no file under src contains a <table, which was true of twenty-two of them.')
    console.error(`  Looked under ${relative(ROOT, SRC)}`)
    process.exit(1)
  }

  let clipTables = 0
  const adminCount = clipFiles.filter((f) => relOf(f.path).includes('src/app/admin')).length
  for (const file of clipFiles) {
    const rel = relOf(file.path)
    clipTables += [...stripComments(file.raw).matchAll(/<table\b/g)].length
    for (const finding of judgeClipWrappers(file.raw, shared)) {
      failures.push(`${rel}:${finding.line}  ${finding.message}`)
    }
  }

  console.log(
    `[a-table-a-phone-can-read] ${files.length - bordered.size} dashboard and admin file(s) with a table judged by all five clauses ` +
      `(${tablesJudged} table(s), ${adminJudged} of them admin, ${controlsJudged} in-body control(s)); ${bordered.size} bordered.`,
  )
  console.log(`[a-table-a-phone-can-read] ${clipFiles.length} file(s) under src with a table (${adminCount} of them admin), ${clipTables} table(s), judged for a CLIPPING wrapper.`)

  if (failures.length > 0) {
    console.error(`[a-table-a-phone-can-read] FAIL - ${failures.length} problem(s):`)
    for (const failure of failures) console.error(`  ${failure}`)
    console.error('')
    console.error('  The pattern is one DOM and CSS only: below the breakpoint the table parts')
    console.error('  become blocks, the header hides, and each row is a bordered card whose')
    console.error('  numbers carry their own headings. The references are')
    console.error('  src/app/(dashboard)/dashboard/events/events-table.tsx (light) and')
    console.error('  src/components/admin/table-card.ts (the admin skins), and both say in')
    console.error('  their own comments why it is not two DOMs.')
    process.exit(1)
  }

  console.log('[a-table-a-phone-can-read] PASS - every organiser and admin table has a presentation a phone can read.')
}
