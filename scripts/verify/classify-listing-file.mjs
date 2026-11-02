// CLASSIFY A LISTING FILE BY THE GUIDE'S ONE SET OF RULES (city first, directive 2; src/lib/categories/classify.ts).
//
//   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/classify-listing-file.mjs <in.csv> <out.csv>
//
// Reads a listing file in the import's columns, and writes a copy with four columns added: guide_category (the primary,
// empty when the rules send it to review), guide_rule (which rule set it), guide_secondary (up to three) and
// guide_matched. The file's own `category` is taken as a reviewer's choice, so a broad one is refined only where a
// precise category added since fits the words. Never edits the input, never touches a database.

import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output || input === output) {
  console.error('usage: classify-listing-file.mjs <in.csv> <out.csv> (two different files)')
  process.exit(2)
}

const { parseCsv } = await import('../../src/lib/listings/listing-rows.ts')
const { classify, GUIDE_CATEGORIES } = await import('../../src/lib/categories/classify.ts')

const rows = parseCsv(readFileSync(input, 'utf8'))
const [header, ...body] = rows
const at = (name) => header.indexOf(name)
for (const need of ['name', 'category']) if (at(need) < 0) throw new Error(`the file has no ${need} column`)

const q = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const counts = new Map()
const out = [[...header, 'guide_category', 'guide_rule', 'guide_secondary', 'guide_matched'].map(q).join(',')]
for (const r of body) {
  if (r.length === 1 && r[0] === '') continue
  const given = r[at('category')]?.trim()
  const c = classify({
    reviewerChoice: GUIDE_CATEGORIES.includes(given) ? given : null,
    title: [r[at('name')], at('what_happens') >= 0 ? r[at('what_happens')] : ''].join(' | '),
  })
  counts.set(`${c.primary ?? 'review'} (${c.rule})`, (counts.get(`${c.primary ?? 'review'} (${c.rule})`) ?? 0) + 1)
  out.push([...r, c.primary ?? '', c.rule, c.secondary.join(' '), c.matched.join(' ')].map(q).join(','))
}
writeFileSync(output, out.join('\n') + '\n', 'utf8')
console.log(`[classify-listing-file] ${body.length} rows -> ${output}`)
for (const [k, n] of [...counts.entries()].sort()) console.log(`  ${k}: ${n}`)
