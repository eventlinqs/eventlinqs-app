/**
 * Rebuild an audit REPORT.md from its raw.json.
 *
 * WHY THIS EXISTS. The audit's markdown was destroyed once, by the audit itself:
 * a deep-only pass overwrote the full walk's REPORT.md with its own fifteen
 * surfaces and then crashed before writing anything, so an hour of walking
 * survived only in a JSON file with no reader. The raw record is the expensive
 * artefact and it should never depend on a formatter finishing.
 *
 * So the markdown is now a VIEW of the JSON rather than a second original, and
 * this is the view. The formatting is deliberately identical to the audit's own,
 * because two renderers that drift are worse than one.
 *
 *   node scripts/verify/audit-report-from-raw.mjs <raw.json> [out.md]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/verify/audit-report-from-raw.mjs <raw.json> [out.md]')
  process.exit(2)
}
const out = process.argv[3] ?? src.replace(/raw(-deep)?\.json$/, 'REPORT$1.md')

const { report, surfaces = [], findings = [], deep = [] } = JSON.parse(readFileSync(src, 'utf8'))
const SEVNAME = ['MONEY PATH', 'DEAD LINK OR CONTROL', 'ERROR', 'EMPTY STATE', 'COSMETIC']

const lines = []
lines.push('# Full platform audit')
lines.push('')
lines.push(`Base: ${report.base}`)
lines.push(`Run: ${report.startedAt}`)
if (report.census) {
  lines.push(
    `Catalogue census: ${report.census.total} event pages, ${report.census.sampled} sampled, ` +
      `${report.census.blocked} cannot sell, ${report.census.paid ?? '?'} paid and sellable, ${report.census.free ?? '?'} free.`,
  )
}
lines.push(`Surfaces recorded: ${surfaces.length}. Findings: ${findings.length}.`)
lines.push('')
lines.push('## Findings, most severe first')
lines.push('')
lines.push('| Severity | Surface | Kind | Detail |')
lines.push('|---|---|---|---|')
for (const f of [...findings].sort((a, b) => a.severity - b.severity)) {
  lines.push(
    `| ${SEVNAME[f.severity]} | ${f.surface}${f.vp ? ` (${f.vp})` : ''} | ${f.kind} | ${String(f.detail).replace(/\|/g, '\\|').slice(0, 300)} |`,
  )
}
lines.push('')
lines.push('## The deep phases: what was opened, clicked and read')
lines.push('')
lines.push('| Phase | Item | Verdict | Detail |')
lines.push('|---|---|---|---|')
for (const d of deep) {
  lines.push(`| ${d.phase} | ${d.item} | ${d.verdict} | ${String(d.detail).replace(/\|/g, '\\|').slice(0, 240)} |`)
}
lines.push('')
lines.push('## Every surface')
lines.push('')
lines.push('| Surface | Viewport | Measured | Status | State | Console | Links | Controls |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const s of surfaces) {
  lines.push(
    `| ${s.label} | ${s.vp} | ${s.measuredViewport ?? '-'} | ${s.status} | ${s.state} | ${s.consoleErrors?.length ?? 0} | ${s.links ?? 0} | ${s.controls ?? 0} |`,
  )
}

writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`rebuilt ${out} from ${src}: ${surfaces.length} surfaces, ${findings.length} findings, ${deep.length} deep rows`)
