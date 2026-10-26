// IMPORT ONE CHECKED LISTINGS FILE (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 6).
//
// The project manager's checked file (C:\dev\design\listings) becomes hosts
// (venues), their nights (event_series) and one listing check per night. This
// script never edits the file, never invents a value and never mends a row: a
// row is imported as written or refused with its reason, under the plan's rules
// and the 21 October 22:25 answers. The rules live in src/lib/listings (listing-rows.ts judges
// a row, import-plan.ts says what it writes); this file reads, prints and runs
// the plan.
//
// Usage, from the repository root in PowerShell (the token comes from the
// Supabase CLI's own login and is never printed):
//
//   scripts\ops\with-supabase-token.ps1 node --import ./scripts/lib/src-alias-loader.mjs scripts/ops/import-city-listings.mjs "<file.csv>" --target test
//     ... --target production   production (gndnldyfudbytbboxesk). Every production
//                               run waits for Lawal's yes to that run.
//     ... --apply               write; asks the operator to type APPLY first.
//                               Without it, a dry run that writes nothing.
//   ... scripts/ops/import-city-listings.mjs --categories --target test
//                               print the live category slugs the category column takes.
//
// A production apply is logged in C:\dev\PRODUCTION-WRITES.txt (operating rule 4
// of 25 September 2026).
//
// IT REFUSES BEFORE IT ACTS:
//   - no --target, or a target other than test or production;
//   - the WI2 migration (20261023000010) is not applied on the target;
//   - the listings organisation (slug eventlinqs-listings) does not exist there;
//   - the file's header is not the listings columns.
// THE WRITE IS ONE STATEMENT, so it lands whole or not at all, and every update
// re-checks in the database that the row is still EventLinqs' own, unclaimed
// and not removed, raising (and so writing nothing) if anything moved since the
// plan was read.
// IT PROVES ITSELF by reading the target again and planning the same file once
// more: every row it wrote must now plan as unchanged. Running it twice writes
// nothing the second time.
//
// OCCURRENCES are not written here: the dated walk-in events for each night are
// made by the listings run (/api/cron/listing-occurrences, ten past every hour;
// a first fill takes several runs, each stopping inside its time), through the
// WI1 publish gate, and this script says so on every run rather than implying
// them.

import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync, readSync } from 'node:fs'
import { basename } from 'node:path'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const LISTINGS_ORG_SLUG = 'eventlinqs-listings'
const MIGRATION = '20261023000010_city_guide_listings.sql'

class Refusal extends Error {}

function parseArgs(argv) {
  const out = { file: null, target: null, apply: false, categories: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--categories') out.categories = true
    else if (a === '--target') {
      out.target = argv[i + 1] ?? null
      i += 1
    } else if (a.startsWith('--')) throw new Refusal(`unknown argument ${JSON.stringify(a)}`)
    else if (out.file === null) out.file = a
    else throw new Refusal(`one file at a time; also given ${JSON.stringify(a)}`)
  }
  if (!out.target || !(out.target in TARGETS)) {
    throw new Refusal(`--target must be test or production (got ${JSON.stringify(out.target)}); there is no default`)
  }
  if (!out.categories && !out.file) throw new Refusal('name the checked listings file')
  if (out.categories && out.apply) throw new Refusal('--categories only prints; it takes no --apply')
  return out
}

/** One synchronous read of the console, so nothing of ours is pending afterwards. */
function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(256)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    return ''
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

function makeClient(target, token) {
  const ref = TARGETS[target]
  return async function query(sql, readOnly) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: readOnly }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`query failed on ${target} (HTTP ${res.status}): ${text.slice(0, 600)}`)
    return JSON.parse(text)
  }
}

async function loadRules() {
  try {
    const rows = await import('../../src/lib/listings/listing-rows.ts')
    const plan = await import('../../src/lib/listings/import-plan.ts')
    const write = await import('../../src/lib/listings/import-write.ts')
    return {
      judgeFile: rows.judgeFile,
      planImport: plan.planImport,
      buildImportWrite: write.buildImportWrite,
      WriteRefusal: write.WriteRefusal,
      sqlLiteral: write.sqlLiteral,
    }
  } catch (error) {
    throw new Refusal(
      `the listing rules in src/lib/listings could not be loaded (${error.message}). Run with ` +
        '--import ./scripts/lib/src-alias-loader.mjs, as the usage line says',
    )
  }
}

async function readState(query) {
  const [migrated] = await query(
    "select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'cities' and column_name = 'free_guide'",
    true,
  )
  if (!migrated || migrated.n !== 1) throw new Refusal(`the WI2 migration ${MIGRATION} is not applied on this target`)
  const [org] = await query(`select id from public.organisations where slug = '${LISTINGS_ORG_SLUG}'`, true)
  const categories = await query('select id, slug from public.event_categories where is_active order by slug', true)
  const cities = await query(
    'select slug, name, state, timezone from public.cities where free_guide and is_active order by slug',
    true,
  )
  const venues = await query(
    `select id, name, address, slug, suburb, city_slug, website_url, instagram_handle, published_email,
            listing_source, claimed_at, removed_at
       from public.venues`,
    true,
  )
  const series = await query(
    `select id, venue_id, name, rule, anchor_date::text as anchor_date, starts_at::text as starts_at,
            ends_at::text as ends_at, timezone, category_id, age_restriction_min, summary,
            instagram_post_url, donation_optional, listing_source, status, last_checked_on::text as last_checked_on
       from public.event_series`,
    true,
  )
  return {
    organisationId: org?.id ?? null,
    categories,
    state: {
      categoryIds: new Map(categories.map((c) => [c.slug, c.id])),
      cities: new Map(cities.map((c) => [c.slug, c])),
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        slug: v.slug,
        suburb: v.suburb,
        citySlug: v.city_slug,
        websiteUrl: v.website_url,
        instagramHandle: v.instagram_handle,
        publishedEmail: v.published_email,
        listingSource: v.listing_source,
        claimedAt: v.claimed_at,
        removedAt: v.removed_at,
      })),
      series: series.map((s) => ({
        id: s.id,
        venueId: s.venue_id,
        name: s.name,
        rule: s.rule,
        anchorDate: s.anchor_date,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        timezone: s.timezone,
        categoryId: s.category_id,
        ageRestrictionMin: s.age_restriction_min,
        summary: s.summary,
        instagramPostUrl: s.instagram_post_url,
        donationOptional: s.donation_optional,
        listingSource: s.listing_source,
        status: s.status,
        lastCheckedOn: s.last_checked_on,
      })),
    },
  }
}

function judgeAndPlan(rules, text, read) {
  const judged = rules.judgeFile(text, {
    now: new Date(),
    categorySlugs: new Set(read.state.categoryIds.keys()),
    guideCities: new Map([...read.state.cities.values()].map((c) => [c.slug, c.timezone])),
  })
  if (judged.headerProblem) throw new Refusal(`the file's header: ${judged.headerProblem}`)
  const importable = judged.rows.filter((r) => r.verdict === 'import').map((r) => ({ line: r.line, row: r.row }))
  return { judged, plan: rules.planImport(importable, read.state) }
}

function report(judged, plan) {
  const planned = new Map(plan.rows.map((r) => [r.line, r]))
  for (const r of judged.rows) {
    const label = `line ${String(r.line).padStart(3)}`
    if (r.verdict === 'refused') console.log(`${label}  REFUSED  ${r.name}: ${r.reasons.join('; ')}`)
    else {
      const p = planned.get(r.line)
      if (p.verdict === 'refused') console.log(`${label}  REFUSED  ${r.name}: ${p.reasons.join('; ')}`)
      else if (p.verdict === 'unchanged') console.log(`${label}  SAME     ${r.name}: as stored, nothing to write`)
      else {
        const what =
          p.series.kind === 'create'
            ? `new night (${r.row.rule} from ${r.row.date}, ${r.row.endsAt ? `${r.row.startsAt} to ${r.row.endsAt}` : `from ${r.row.startsAt}, no finish given`}${r.row.donationOptional ? ', donation optional' : ''}) at ${r.row.host}`
            : p.series.kind === 'update'
              ? `changed: ${p.changed.join(', ')}`
              : p.changed.length > 0
                ? `confirmed, host facts changed: ${p.changed.join(', ')}`
                : 'confirmed as stored'
        console.log(`${label}  ${p.series.kind === 'create' ? 'NEW    ' : 'CHECK  '}  ${r.name}: ${what}; source ${p.check.source_date}`)
      }
    }
  }
  const creates = plan.venues.filter((v) => v.kind === 'create')
  for (const v of creates) console.log(`HOST NEW     ${v.values.name}, ${v.values.address}, ${v.values.suburb} -> /venues handle ${v.values.slug}`)
  for (const v of plan.venues.filter((x) => x.kind === 'update')) {
    console.log(`HOST UPDATE  ${v.id}: ${Object.keys(v.changes).join(', ')}`)
  }
  const series = plan.rows.filter((r) => r.verdict === 'write')
  console.log(
    `FILE ${judged.rows.length} rows: ${judged.counts.import} pass the rules, ${judged.counts.refused} refused; ` +
      `of those that pass, ${plan.counts.write} write, ${plan.counts.unchanged} unchanged, ${plan.counts.refused} refused against the database`,
  )
  console.log(
    `WRITES ${creates.length} new hosts, ${plan.venues.length - creates.length} host updates, ` +
      `${series.filter((r) => r.series.kind === 'create').length} new nights, ` +
      `${series.filter((r) => r.series.kind === 'update').length} changed nights, ${series.length} listing checks`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Refusal(
      'SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts\\ops\\with-supabase-token.ps1, as the usage line says',
    )
  }
  const query = makeClient(args.target, token)
  console.log(`target ${args.target} (${TARGETS[args.target]}), ${args.categories ? 'categories' : args.apply ? 'APPLY' : 'dry run'}`)

  if (args.categories) {
    const rows = await query('select slug, name from public.event_categories where is_active order by slug', true)
    for (const r of rows) console.log(`${r.slug}  (${r.name})`)
    console.log(`${rows.length} live category slugs`)
    return 0
  }

  const rules = await loadRules()
  const raw = readFileSync(args.file)
  const text = raw.toString('utf8')
  const importFile = `${basename(args.file)} sha256:${createHash('sha256').update(raw).digest('hex').slice(0, 12)}`
  const read = await readState(query)
  if (!read.organisationId) {
    throw new Refusal(
      `there is no listings organisation (slug ${LISTINGS_ORG_SLUG}) on ${args.target}; who owns it is an open question in WINDOW4-STATUS.txt`,
    )
  }
  const { judged, plan } = judgeAndPlan(rules, text, read)
  console.log(`FILE ${importFile}`)
  report(judged, plan)
  console.log('OCCURRENCES: the dated walk-in events for each night are made by the listings run (/api/cron/listing-occurrences, ten past every hour; a first fill takes several runs), not by this script')

  const writes = plan.rows.filter((r) => r.verdict === 'write')
  if (writes.length === 0 && plan.venues.length === 0) {
    console.log('NOTHING TO WRITE')
    return 0
  }
  if (!args.apply) {
    console.log('DRY RUN: nothing written')
    return 0
  }

  const typed = askLine(`Type APPLY to write ${writes.length} listing checks from ${basename(args.file)} to ${args.target} (${TARGETS[args.target]}): `)
  if (typed !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }
  let sql
  try {
    const tag = `$w2_${randomBytes(6).toString('hex')}$`
    sql = rules.buildImportWrite(plan, read.organisationId, importFile, tag)
  } catch (error) {
    if (error instanceof rules.WriteRefusal) throw new Refusal(error.message)
    throw error
  }
  await query(sql, false)

  // The proof: read the target again and plan the same file. Everything written
  // must now plan as unchanged, and the checks must be in the database under
  // this file's name.
  const after = await readState(query)
  const again = judgeAndPlan(rules, text, after).plan
  const stillWriting = again.rows.filter((r) => r.verdict === 'write').map((r) => r.line)
  const [{ n: recorded }] = await query(
    `select count(*)::int as n from public.listing_checks where import_file = ${rules.sqlLiteral(importFile)}`,
    true,
  )
  const ok = stillWriting.length === 0 && again.venues.length === 0 && recorded >= writes.length
  console.log(
    ok
      ? `APPLIED: ${writes.length} listing checks written and read back (${recorded} under this file's name); planning the file again writes nothing`
      : `FAILED: after the write, lines ${stillWriting.join(', ') || '(none)'} still plan a write, ${again.venues.length} host steps remain, ${recorded} checks recorded of ${writes.length}`,
  )
  if (ok && args.target === 'production') {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    appendFileSync(
      LOG,
      `${stamp}  founder typed APPLY: APPLIED: WI2 listings import ${importFile}: ${writes.length} listing checks, ${plan.venues.filter((v) => v.kind === 'create').length} new hosts\n`,
    )
    console.log(`LOGGED in ${LOG}`)
  }
  return ok ? 0 : 1
}

// process.exitCode rather than process.exit after network work: exiting while a
// fetch socket is still closing aborts Node on Windows (nodejs/node#56645).
main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    if (error instanceof Refusal) {
      console.error(`REFUSED: ${error.message}`)
      process.exitCode = 2
    } else {
      console.error(`FAILED: ${error.message}`)
      process.exitCode = 1
    }
  },
)
