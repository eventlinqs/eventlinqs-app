/**
 * DESIGN-SYSTEM AUDIT: is there a spacing and type SYSTEM, or is every component
 * guessing?
 *
 * The question matters before any fix, because if the system is real and simply
 * not applied in a few places, the answer is to apply it; and if spacing is
 * chosen per component, then fixing instances is wasted effort and the tokens
 * are the work. This counts rather than asserts.
 *
 * Usage: node scripts/design-system-audit.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (/\.tsx$/.test(entry.name)) files.push(p)
  }
})('src')

const rel = f => f.replace(/\\/g, '/')

let filesWithSectionToken = 0
const hardcodedSections = []
const containerLiteral = []
const headingRaw = []
let headingToken = 0

// A <section ...> opening tag and whatever className literal follows it.
const SECTION = /<section\b[^>]*?className=\{?[`"']([^`"']*)/g
const HEADING = /<h([12])\b[^>]*?className=\{?[`"']([^`"']*)/g

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  if (/SECTION_DEFAULT|SECTION_TIGHT|SECTION_RAIL|SECTION_HERO/.test(src)) {
    filesWithSectionToken += 1
  }

  for (const m of src.matchAll(SECTION)) {
    const cls = m[1]
    // A token interpolation reads as `${SECTION_RAIL}` and is not hardcoded.
    if (/\$\{SECTION_/.test(m[0])) continue
    if (/\b(py|pt|pb)-\d/.test(cls)) {
      hardcodedSections.push(`${rel(file)}  ${cls.slice(0, 74)}`)
    }
  }

  // The container cap. CONTAINER is the token; a literal max-w-7xl with its own
  // padding is the same decision taken again by hand.
  for (const m of src.matchAll(/max-w-7xl mx-auto px-4/g)) {
    void m
    if (!/\$\{CONTAINER\}|CONTAINER/.test(src)) containerLiteral.push(rel(file))
  }

  for (const m of src.matchAll(HEADING)) {
    const cls = m[2]
    if (/type-(h1|h2|rail-heading|display)/.test(cls)) headingToken += 1
    else if (/text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)/.test(cls)) {
      headingRaw.push(`${rel(file)}  h${m[1]}  ${cls.slice(0, 66)}`)
    }
  }
}

console.log(`[design-audit] ${files.length} .tsx file(s) scanned\n`)

console.log('SPACING')
console.log(`  files importing a SECTION_* token:            ${filesWithSectionToken}`)
console.log(`  <section> tags with HARDCODED py/pt/pb:       ${hardcodedSections.length}`)
for (const h of hardcodedSections.slice(0, 30)) console.log(`      ${h}`)
if (hardcodedSections.length > 30) console.log(`      ... and ${hardcodedSections.length - 30} more`)

console.log('\nCONTAINER')
console.log(`  literal "max-w-7xl mx-auto px-4" without the token: ${new Set(containerLiteral).size} file(s)`)
for (const c of [...new Set(containerLiteral)].slice(0, 15)) console.log(`      ${c}`)

console.log('\nTYPE')
console.log(`  headings using a .type-* class:               ${headingToken}`)
console.log(`  headings using a raw text-* size:             ${headingRaw.length}`)
for (const h of headingRaw.slice(0, 25)) console.log(`      ${h}`)
if (headingRaw.length > 25) console.log(`      ... and ${headingRaw.length - 25} more`)
