/**
 * TODAY'S READING OF THE ELEVEN SOURCES WRITTEN ON TEST'S REGISTER (the project manager's ruling of 29 October 2026,
 * 16:28 (1), and window 4's 16:38: scripts/ops/register-sources-production.mjs writes a source to production as 'read'
 * only when its terms and the 'yes' that lets it be read were read TODAY, as the TEST row records them).
 *
 *   node --env-file=<a TEST env file> scripts/verify/source-terms-record-test.mjs <reread.json> [--apply]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for TEST (vkapkibzokmfaxqogypq); refused anywhere else.
 * <reread.json> is scripts/verify/source-terms-reread.mjs's output. For each source by name: terms_quote and
 * terms_read_on from today's reading; for a 'read' source still offering its feed, may_subscribe's quote, address and
 * date too; a 'no' answer whose words are still there is dated today; a source that could not be read keeps no read
 * date and says why; a recorded 'read' no longer offering its feed becomes 'ask' with may_subscribe 'unknown'. Without
 * --apply it prints what it would write and writes nothing; with it, each row is read back.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('source-terms-record-test writes TEST only')
  process.exit(2)
}
const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const apply = process.argv.includes('--apply')
if (!file) {
  console.error('usage: node --env-file=<TEST env> scripts/verify/source-terms-record-test.mjs <reread.json> [--apply]')
  process.exit(2)
}
const reread = JSON.parse(readFileSync(file, 'utf8'))
const db = createClient(url, key, { auth: { persistSession: false } })
const { data: rows, error } = await db.from('listing_sources').select('*')
if (error) throw new Error(`the register could not be read: ${error.message}`)

let failures = 0
for (const r of reread) {
  const row = rows.find((s) => s.name === r.name)
  if (!row) {
    failures += 1
    console.log(`MISSING ${r.name}: no TEST row of that name`)
    continue
  }
  const day = r.readOn
  const readable = r.checks.every((c) => c.status !== null && c.status < 400)
  const patch = {}
  if (row.collection === 'read' || r.recorded === 'read') {
    const [offer, feed, robots] = r.checks
    if (r.verdict === 'read') {
      patch.terms_quote = `Read ${day}: the events page (${offer.url}) still offers the publisher's own calendar feed, ${offer.saw}; the feed (${feed.url}) answered ${feed.status}, ${feed.saw}; robots.txt ${robots.saw}.`
      patch.terms_read_on = day
      patch.may_subscribe_quote = String(offer.saw).slice(0, 2000)
      patch.may_subscribe_url = offer.url
      patch.may_subscribe_read_on = day
    } else {
      patch.terms_quote = `Read ${day}: the calendar offer no longer stands (${r.checks.filter((c) => !c.ok).map((c) => `${c.what}: ${c.saw}`).join('; ')}), so it is asked, never read.`
      patch.terms_read_on = readable ? day : null
      patch.may_subscribe = 'unknown'
      patch.may_subscribe_quote = null
      patch.may_subscribe_url = null
      patch.may_subscribe_read_on = null
      patch.collection = 'ask'
    }
  } else if (readable) {
    patch.terms_quote = `Read ${day}: ${r.quote}`
    patch.terms_read_on = day
    for (const k of ['may_redistribute_facts', 'may_reuse_media']) {
      if (row[k] === 'no' && row[`${k}_quote`] && r.checks[0].saw === 'the recorded words are still there') patch[`${k}_read_on`] = day
    }
  } else {
    patch.terms_quote = `Not readable on ${day}: ${r.quote}; not tried around, so it is asked, never read.`
    patch.terms_read_on = null
  }
  console.log(`${apply ? 'WRITE' : 'WOULD WRITE'} ${r.name} (${row.collection}${patch.collection ? ` -> ${patch.collection}` : ''}): ${Object.keys(patch).join(', ')}`)
  if (!apply) continue
  const { error: uerr } = await db.from('listing_sources').update(patch).eq('id', row.id)
  if (uerr) {
    failures += 1
    console.log(`  REFUSED: ${uerr.message}`)
    continue
  }
  const { data: back } = await db.from('listing_sources').select('collection, terms_read_on, may_subscribe, may_subscribe_read_on').eq('id', row.id).single()
  console.log(`  READ BACK: ${JSON.stringify(back)}`)
}
console.log(failures === 0 ? `${apply ? 'WRITTEN' : 'DRY RUN'}: ${reread.length} source(s)` : `FAILED: ${failures}`)
process.exitCode = failures === 0 ? 0 : 1
