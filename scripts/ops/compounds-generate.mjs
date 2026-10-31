/**
 * LAWAL's DASH RULE FOR THE PLATFORM's OWN COPY (law 6 in C:\dev\CLAUDE.md, 31 October 2026; the CONTROLLER's 12:33;
 * window 2). The communication gateway keeps the list of compound modifiers that take a hyphen before a noun in
 * C:\dev\comms-gateway\compounds.json. The build cannot read C:\dev, so the list is copied here into
 * src/lib/copy/compounds.generated.json, which scripts/guards/compound-modifiers-hyphenated.mjs reads.
 *
 *   node scripts/ops/compounds-generate.mjs           write the JSON
 *   node scripts/ops/compounds-generate.mjs --check   exit 1 if the committed JSON is not what the gateway's list says now
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'C:/dev/comms-gateway/compounds.json'
const OUT = 'src/lib/copy/compounds.generated.json'

let raw
try {
  raw = JSON.parse(readFileSync(SOURCE, 'utf8'))
} catch (e) {
  console.error(`POLICY_UNAVAILABLE: cannot read ${SOURCE}: ${e instanceof Error ? e.message : e}`)
  process.exit(3)
}
if (!Array.isArray(raw.must_hyphenate_before_noun) || typeof raw.nouns_after !== 'string') {
  console.error(`POLICY_UNAVAILABLE: ${SOURCE} no longer carries must_hyphenate_before_noun and nouns_after`)
  process.exit(3)
}
const out = {
  _generated: `by scripts/ops/compounds-generate.mjs from ${SOURCE}; never edited by hand.`,
  why: raw.why,
  mustHyphenateBeforeNoun: raw.must_hyphenate_before_noun,
  nounsAfter: raw.nouns_after,
  // gateway.py checks these four compound words anywhere, not only before a noun.
  compoundWords: ['sister in law', 'brother in law', 'self employed', 'runner up'],
}
const text = JSON.stringify(out, null, 2) + '\n'
if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n')
  if (now !== text) {
    console.error(`[compounds] ${OUT} is not what ${SOURCE} says now; run the generator`)
    process.exit(1)
  }
  console.log(`[compounds] PASS: ${OUT} matches ${SOURCE}`)
} else {
  writeFileSync(OUT, text)
  console.log(`[compounds] wrote ${OUT}`)
}
