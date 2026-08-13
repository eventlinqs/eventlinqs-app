// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/** Compresses the walk report into the defects a person would actually hit. */
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(process.argv[2] || 'docs/roast/sweep-evidence/report.json', 'utf8'))

const bucket = (name) => {
  const out = []
  for (const r of rows) {
    const v = name(r)
    if (v && (Array.isArray(v) ? v.length : true)) out.push([r, v])
  }
  return out
}

const show = (label, pairs, fmt) => {
  if (pairs.length === 0) return
  console.log(`\n### ${label}  (${pairs.length})`)
  for (const [r, v] of pairs) console.log(`  ${r.viewport.padEnd(7)} ${r.path.padEnd(44)} ${fmt(v)}`)
}

console.log(`records: ${rows.length}`)
const bad = rows.filter((r) => r.error || (r.status && r.status >= 400))
show('HTTP failure or crash', bad.map((r) => [r, r.error || r.status]), (v) => String(v))

show(
  'Copy: banned words, placeholders, value tells',
  bucket((r) => (r.copy?.length ? r.copy : null)),
  (v) => v.map((c) => `${c.id}: "${c.context.trim().slice(0, 100)}"`).join('\n           '),
)
show('Dead links', bucket((r) => (r.brokenLinks?.length ? r.brokenLinks : null)), (v) =>
  v.map((b) => `${b.status} ${b.href}`).join(', '),
)
show('Dead-end tiles', bucket((r) => (r.deadTiles?.length ? r.deadTiles : null)), (v) =>
  v.map((t) => `${t.w}x${t.h} ${t.alt || '(no alt)'}`).slice(0, 4).join(' | '),
)
show('Broken images', bucket((r) => (r.brokenImages?.length ? r.brokenImages : null)), (v) =>
  v.map((i) => i.src).slice(0, 3).join(' | '),
)
show('Inert anchors (href missing or #)', bucket((r) => (r.inertAnchors?.length ? r.inertAnchors : null)), (v) =>
  v.map((a) => `"${a.text}"=${a.href}`).slice(0, 5).join(' | '),
)
show('Horizontal overflow', bucket((r) => r.overflowX), (v) => `scrollWidth ${v.scrollWidth} > ${v.innerWidth}`)
show('Page errors', bucket((r) => (r.pageErrors?.length ? r.pageErrors : null)), (v) => v.join(' | '))
show('Console errors', bucket((r) => (r.consoleErrors?.length ? r.consoleErrors : null)), (v) =>
  v.slice(0, 2).join(' | '),
)
show('Failed same-origin requests', bucket((r) => (r.failedRequests?.length ? r.failedRequests : null)), (v) =>
  v.map((f) => `${f.status} ${f.url}`).slice(0, 3).join(' | '),
)
show(
  'Touch targets under 44px (mobile)',
  bucket((r) => (r.smallTargets?.length ? r.smallTargets : null)),
  (v) => `${v.length} targets, e.g. ${v.slice(0, 3).map((t) => `"${t.text}" ${t.w}x${t.h}`).join(', ')}`,
)

console.log('\n### Content volume (desktop): cards rendered per surface')
for (const r of rows.filter((r) => r.viewport === 'desktop')) {
  console.log(`  ${String(r.cards).padStart(4)} cards  ${r.path}`)
}
