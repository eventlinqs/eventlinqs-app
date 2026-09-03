// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * EVERY RAW FORM CONTROL CARRIES A PROGRAMMATIC LABEL.
 *
 * A raw <input>, <select> or <textarea> (a checkbox is an input) that no
 * assistive technology can name is unusable by anyone not looking at the screen,
 * and it is invisible to review because the screen looks finished.
 *
 * WHY THIS GUARD IS AST-BASED AND NOT A GREP, written down because the cheap
 * version was tried first and was wrong in both directions on the same day
 * (28 August 2026):
 *
 *   A grep for `aria-label` said 20 of 48 controls in seat-map-builder.tsx were
 *   labelled. The real number was 9: most of those 20 aria-labels were on
 *   BUTTONS, and a line-window grep cannot tell which element an attribute
 *   belongs to.
 *
 *   A corrected scan then said 39 controls were UNLABELLED. The real number was
 *   ZERO. Those 39 sit inside a <Field> wrapper that renders
 *   <label><span>{label}</span>{children}</label>, so every one of them is a
 *   DESCENDANT of its own <label> and is implicitly associated. The browser
 *   names them correctly and axe reports no violation.
 *
 * A detector that does not model JSX NESTING, and does not model a COMPONENT
 * THAT WRAPS ITS CHILDREN IN A LABEL, will fail a build over working markup.
 * That guard gets switched off within a week and the law loses its enforcement,
 * which is the failure mode CLAUDE.md names explicitly. So this walks the real
 * TypeScript AST and resolves four labelling mechanisms, in the order the
 * accessibility tree resolves them.
 *
 * WHAT COUNTS AS A LABEL:
 *   1. aria-label / aria-labelledby on the control
 *   2. id="x" on the control and htmlFor="x" somewhere in the same file
 *   3. an ancestor <label> element (implicit association, the HTML spec's
 *      "labeled control" is the first labelable descendant)
 *   4. an ancestor COMPONENT that itself renders <label>...{children}...</label>
 *
 * WHAT DOES NOT COUNT:
 *   - title="" alone. axe has a whole rule for it (label-title-only) because a
 *     tooltip is not a label; it does not show on touch or on keyboard focus.
 *   - a placeholder. It disappears the moment the field has content.
 *
 * DELIBERATELY NOT FAILED ON: a control carrying a {...spread}, because the
 * label can arrive through the spread and this cannot see it. Those are COUNTED
 * AND PRINTED rather than silently passed, so the blind spot is visible on every
 * run instead of being discovered later.
 *
 * THE BACKSTOP. This is a static guard and it runs on every build. The
 * authority remains the DOM: axe over the running application, which is what
 * established every number in this header. When the two disagree, the DOM is
 * right and this file has a bug.
 *
 * Usage: node scripts/guards/labelled-form-controls.mjs [--verbose]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const VERBOSE = process.argv.includes('--verbose')

const CONTROLS = new Set(['input', 'select', 'textarea'])

/** Every .tsx under src/. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

const tagName = node => {
  const n = ts.isJsxElement(node)
    ? node.openingElement.tagName
    : ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
      ? node.tagName
      : null
  return n ? n.getText() : null
}

const attributesOf = node => {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  return opening.attributes ? opening.attributes.properties : []
}

function attr(node, name) {
  for (const p of attributesOf(node)) {
    if (ts.isJsxAttribute(p) && p.name.getText() === name) {
      if (!p.initializer) return { present: true, literal: true, value: 'true' }
      if (ts.isStringLiteral(p.initializer)) return { present: true, literal: true, value: p.initializer.text }
      return { present: true, literal: false, value: null }
    }
  }
  return null
}

const hasSpread = node => attributesOf(node).some(p => ts.isJsxSpreadAttribute(p))

/**
 * Components that wrap their children in a <label>. Built across the WHOLE tree
 * before any file is judged, because the wrapper and the control routinely live
 * in different files.
 */
function findLabelWrappers(sourceFiles) {
  const names = new Set()
  for (const sf of sourceFiles) {
    const visit = node => {
      // A component is any function-ish declaration with a capitalised name.
      let name = null
      if (ts.isFunctionDeclaration(node) && node.name) name = node.name.getText()
      else if (
        ts.isVariableDeclaration(node) &&
        node.name &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        name = node.name.getText()
      }
      if (name && /^[A-Z]/.test(name)) {
        // Does it contain a <label> that (anywhere below it) renders {children}?
        let wraps = false
        const scanLabel = n => {
          if (wraps) return
          if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && tagName(n) === 'label') {
            let found = false
            const scanChildren = m => {
              if (found) return
              if (ts.isJsxExpression(m) && m.expression && /(^|\.)children$/.test(m.expression.getText())) {
                found = true
                return
              }
              ts.forEachChild(m, scanChildren)
            }
            ts.forEachChild(n, scanChildren)
            if (found) wraps = true
          }
          ts.forEachChild(n, scanLabel)
        }
        ts.forEachChild(node, scanLabel)
        if (wraps) names.add(name)
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
  }
  return names
}

/** Walk with an explicit ancestor stack so nesting can be resolved. */
function findControls(sf, labelWrappers) {
  const text = sf.getFullText()
  const fileHasHtmlFor = /htmlFor\s*=/.test(text)
  const htmlForLiterals = new Set([...text.matchAll(/htmlFor\s*=\s*"([^"]+)"/g)].map(m => m[1]))
  const out = []

  const visit = (node, stack) => {
    const isEl = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
    const tag = isEl ? tagName(node) : null

    if (isEl && CONTROLS.has(tag)) {
      const type = attr(node, 'type')
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
      const record = { tag, line, type: type?.value ?? (tag === 'input' ? 'text' : tag) }

      if (type?.literal && type.value === 'hidden') {
        out.push({ ...record, verdict: 'skipped', how: 'type=hidden' })
      } else if (attr(node, 'aria-label')) {
        out.push({ ...record, verdict: 'ok', how: 'aria-label' })
      } else if (attr(node, 'aria-labelledby')) {
        out.push({ ...record, verdict: 'ok', how: 'aria-labelledby' })
      } else if (stack.some(a => a === 'label')) {
        out.push({ ...record, verdict: 'ok', how: 'ancestor <label>' })
      } else if (stack.some(a => labelWrappers.has(a))) {
        const w = stack.find(a => labelWrappers.has(a))
        out.push({ ...record, verdict: 'ok', how: `wrapper <${w}>` })
      } else {
        const id = attr(node, 'id')
        if (id?.literal && htmlForLiterals.has(id.value)) {
          out.push({ ...record, verdict: 'ok', how: 'htmlFor' })
        } else if (id && !id.literal && fileHasHtmlFor) {
          out.push({ ...record, verdict: 'ok', how: 'htmlFor (dynamic id)' })
        } else if (hasSpread(node)) {
          out.push({ ...record, verdict: 'unknown', how: '{...spread}' })
        } else {
          out.push({ ...record, verdict: 'FAIL', how: 'nothing names it' })
        }
      }
    }

    const nextStack = tag ? [tag, ...stack] : stack
    ts.forEachChild(node, c => visit(c, nextStack))
  }

  ts.forEachChild(sf, c => visit(c, []))
  return out
}

// ── Run ──────────────────────────────────────────────────────────────────────
const files = walk(SRC)
const sourceFiles = files.map(parse)
const labelWrappers = findLabelWrappers(sourceFiles)

let controls = 0
let ok = 0
let skipped = 0
let unknown = 0
const failures = []
const byMechanism = {}
const filesWithControls = []

for (let i = 0; i < files.length; i++) {
  const found = findControls(sourceFiles[i], labelWrappers)
  if (!found.length) continue
  const rel = relative(ROOT, files[i]).replace(/\\/g, '/')
  filesWithControls.push({ rel, n: found.length })
  for (const c of found) {
    controls++
    if (c.verdict === 'skipped') skipped++
    else if (c.verdict === 'unknown') unknown++
    else if (c.verdict === 'ok') {
      ok++
      // The wrapper's real name is kept, not normalised away: which component
      // supplied the label is the single most useful fact when this number
      // looks wrong, and it is what the drills assert against.
      byMechanism[c.how] = (byMechanism[c.how] || 0) + 1
    } else failures.push({ ...c, file: rel })
  }
}

console.log('[labelled-form-controls] WHAT WAS SCANNED')
console.log(`  .tsx files under src/            : ${files.length}`)
console.log(`  files containing a raw control   : ${filesWithControls.length}`)
console.log(`  raw controls found               : ${controls}`)
console.log(`    labelled                       : ${ok}`)
console.log(`    skipped (type=hidden)          : ${skipped}`)
console.log(`    not judged ({...spread})       : ${unknown}`)
console.log(`    UNLABELLED                     : ${failures.length}`)
console.log(`  label-wrapping components found  : ${labelWrappers.size}${labelWrappers.size ? ' (' + [...labelWrappers].sort().join(', ') + ')' : ''}`)
console.log('  labelled by mechanism            :')
for (const [k, v] of Object.entries(byMechanism).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(v).padStart(4)}  ${k}`)
}

if (VERBOSE) {
  console.log('  files, busiest first:')
  for (const f of filesWithControls.sort((a, b) => b.n - a.n).slice(0, 25)) {
    console.log(`      ${String(f.n).padStart(3)}  ${f.rel}`)
  }
}

if (failures.length) {
  console.log('')
  console.log('[labelled-form-controls] FAILED. These controls cannot be named by assistive technology:')
  for (const f of failures) {
    console.log(`  ${f.file}:${f.line}  <${f.tag} type="${f.type}">  ${f.how}`)
  }
  console.log('')
  console.log('  Give each one ONE of:')
  console.log('    aria-label="..."                      when nothing visible names it')
  console.log('    id="x" with a <label htmlFor="x">     when a visible label exists elsewhere')
  console.log('    wrap it in <label>...</label>          when the label sits beside it')
  console.log('')
  console.log('  A placeholder is not a label and title alone is not a label.')
  process.exit(1)
}

console.log('')
console.log('[labelled-form-controls] PASS. Every raw control can be named.')
