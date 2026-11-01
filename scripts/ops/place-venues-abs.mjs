// PLACE EVERY VENUE BY THE ABS's OWN BOUNDARIES (city first, directive 3; C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md).
//
// For each venue with coordinates whose placement is missing or was taken from another point, ask the ABS's public map
// service (ASGS Edition 3, 2021; Creative Commons Attribution 4.0, 'Based on ABS data') which Urban Centre, council
// (LGA), gazetted suburb (SAL), Greater Capital City area and Tourism Region the point lies in, and write those with the
// time and the point they were read from. public.venue_city_relation then reads them; nothing else does.
//
// Run (the token wrapper reads the CLI's stored Supabase token and never prints it):
//   scripts\ops\with-supabase-token.ps1 node scripts/ops/place-venues-abs.mjs --target test
//     a dry run: prints every venue's placement and every suburb that disagrees with the venue's own; writes nothing.
//   ... --target test --apply           writes; asks the operator to type APPLY first.
// There is no default target. A production apply is logged in C:\dev\PRODUCTION-WRITES.txt (operating rule 4) and is
// WINDOW 4's path. A venue whose stored suburb disagrees with the ABS suburb is printed for review, never overwritten:
// only the abs_* columns are written.

import { appendFileSync, readSync } from 'node:fs'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const MIGRATION = '20261101160001'
const ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021'
const LAYERS = {
  UCL: ['ucl_code_2021', 'ucl_name_2021'],
  LGA: ['lga_code_2021', 'lga_name_2021'],
  SAL: ['sal_code_2021', 'sal_name_2021'],
  GCCSA: ['gccsa_code_2021', 'gccsa_name_2021'],
  TR: ['tr_code_2021', 'tr_name_2021'],
}

class Refusal extends Error {}

function parseArgs(argv) {
  const out = { target: null, apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--target') {
      out.target = argv[i + 1] ?? null
      i += 1
    } else throw new Refusal(`unknown argument ${JSON.stringify(a)}`)
  }
  if (!out.target || !(out.target in TARGETS)) {
    throw new Refusal(`--target must be test or production (got ${JSON.stringify(out.target)}); there is no default`)
  }
  return out
}

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

/** One ABS layer's answer for a point: [code, name], or [null, null] when the point lies in none of its areas. */
export async function absArea(layer, longitude, latitude) {
  const [codeField, nameField] = LAYERS[layer]
  const url = `${ABS}/${layer}/FeatureServer/0/query?geometry=${longitude},${latitude}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=${codeField},${nameField}&returnGeometry=false&f=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`the ABS ${layer} layer answered HTTP ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(`the ABS ${layer} layer refused: ${JSON.stringify(body.error).slice(0, 300)}`)
  const a = body.features?.[0]?.attributes
  return a ? [a[codeField] ?? null, a[nameField] ?? null] : [null, null]
}

const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Refusal('no SUPABASE_ACCESS_TOKEN: run through scripts\\ops\\with-supabase-token.ps1')
  const query = makeClient(args.target, token)

  const [{ n: migrated }] = await query(
    `select count(*)::int n from supabase_migrations.schema_migrations where version = '${MIGRATION}'`, true)
  if (migrated !== 1) throw new Refusal(`${MIGRATION} (city_geography) is not applied on ${args.target}`)

  const venues = await query(
    `select id, name, suburb, latitude, longitude from public.venues
      where latitude is not null and longitude is not null
        and (abs_placed_at is null or latitude is distinct from abs_placed_latitude or longitude is distinct from abs_placed_longitude)
      order by name, id`, true)
  console.log(`[place-venues-abs] ${args.target}: ${venues.length} venue(s) to place`)

  const placed = []
  for (const v of venues) {
    const p = { id: v.id }
    for (const layer of Object.keys(LAYERS)) [p[`${layer}_code`], p[`${layer}_name`]] = await absArea(layer, v.longitude, v.latitude)
    p.latitude = v.latitude
    p.longitude = v.longitude
    placed.push(p)
    const disagrees = v.suburb && p.SAL_name && v.suburb.trim().toLowerCase() !== p.SAL_name.toLowerCase()
    console.log(`  ${v.name}: ${p.UCL_name ?? 'no Urban Centre'}, ${p.LGA_name ?? 'no council'}, suburb ${p.SAL_name ?? 'none'}, region ${p.TR_name ?? 'none'}` +
      (disagrees ? `  [REVIEW: stored suburb '${v.suburb}' is not the ABS suburb]` : ''))
  }

  if (!args.apply) {
    console.log('[place-venues-abs] DRY RUN: nothing written. Add --apply to write the abs_* columns.')
    return
  }
  if (placed.length === 0) {
    console.log('[place-venues-abs] nothing to write')
    return
  }
  if (askLine(`Type APPLY to write ${placed.length} placement(s) on ${args.target}: `) !== 'APPLY') throw new Refusal('not applied')

  const values = placed.map((p) => `(${lit(p.id)}::uuid, ${lit(p.UCL_code)}, ${lit(p.UCL_name)}, ${lit(p.LGA_code)}, ${lit(p.LGA_name)}, ` +
    `${lit(p.SAL_code)}, ${lit(p.SAL_name)}, ${lit(p.GCCSA_code)}, ${lit(p.TR_code)}, ${lit(p.TR_name)}, ${p.latitude}, ${p.longitude})`).join(',\n')
  await query(
    `update public.venues v set abs_ucl_code = x.uc, abs_ucl_name = x.un, abs_lga_code = x.lc, abs_lga_name = x.ln,
       abs_sal_code = x.sc, abs_sal_name = x.sn, abs_gccsa_code = x.gc, abs_tr_code = x.tc, abs_tr_name = x.tn,
       abs_placed_at = now(), abs_placed_latitude = x.lat, abs_placed_longitude = x.lng
     from (values ${values}) as x(id, uc, un, lc, ln, sc, sn, gc, tc, tn, lat, lng)
     where v.id = x.id and v.latitude = x.lat and v.longitude = x.lng`, false)
  const [{ n: done }] = await query(
    `select count(*)::int n from public.venues where id in (${placed.map((p) => `${lit(p.id)}::uuid`).join(', ')})
       and abs_placed_at is not null and latitude = abs_placed_latitude and longitude = abs_placed_longitude`, true)
  console.log(`[place-venues-abs] read back: ${done} of ${placed.length} placed`)
  if (args.target === 'production') {
    appendFileSync(LOG, `${new Date().toISOString()} | place-venues-abs | ${done} venue placement(s) written (abs_* columns only) | ${MIGRATION}\n`)
  }
}

main().catch((e) => {
  console.error(`[place-venues-abs] ${e instanceof Refusal ? 'REFUSED' : 'FAILED'}: ${e.message}`)
  process.exit(e instanceof Refusal ? 2 : 1)
})
