/**
 * EVERY PUBLISHED LISTING EVENT HAS A RECORDED SOURCE AND A REUSE BASIS (release
 * checklist A4 and D8, 28 October 2026). READ ONLY.
 *
 * The proof the checklist names: "zero published events without source and
 * reuse basis". An EventLinqs listing event (events.listing_series_id set) is
 * covered when its series has at least one listing check, and every check
 * carries an https source_url, a source_date and a reuse_basis
 * (supabase/migrations/20261028133001_listing_checks_reuse_basis.sql). Events an
 * organiser lists themselves carry no series and are not imports, so they are
 * not counted here.
 *
 * It asks through the Supabase Management API's query endpoint with read_only
 * true, so it cannot write. Run through the token helper:
 *   scripts\ops\with-supabase-token.ps1 node scripts/verify/listings-have-source-and-basis.mjs --project <ref>
 * Exit 0 only when the uncovered count is zero AND there is something to count.
 */
const TAG = '[listings-have-source-and-basis]'
const argv = process.argv.slice(2)
const project = argv[argv.indexOf('--project') + 1]
const token = process.env.SUPABASE_ACCESS_TOKEN

const QUERY = `
with listed as (
  select e.id, e.listing_series_id
  from public.events e
  where e.listing_series_id is not null and e.status = 'published'
)
select
  (select count(*) from listed)::int as published_listing_events,
  (select count(*) from listed l where not exists (
     select 1 from public.listing_checks c where c.series_id = l.listing_series_id))::int as without_a_check,
  (select count(*) from listed l where exists (
     select 1 from public.listing_checks c where c.series_id = l.listing_series_id
       and (c.reuse_basis is null or c.source_url is null or c.source_date is null)))::int as with_a_check_missing_basis_or_source,
  (select json_agg(t) from (select reuse_basis, count(*)::int as checks from public.listing_checks group by 1 order by 1) t) as checks_by_basis`

async function main() {
  if (!project || !/^[a-z]{20}$/.test(project)) {
    console.error(`${TAG} REFUSED: --project <20-letter ref> is required`)
    process.exitCode = 2
    return
  }
  if (!token) {
    console.error(`${TAG} REFUSED: no SUPABASE_ACCESS_TOKEN; run through scripts\\ops\\with-supabase-token.ps1`)
    process.exitCode = 2
    return
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ read_only: true, query: QUERY }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${TAG} FAIL: the query was refused (${res.status}): ${text.slice(0, 300)}`)
    process.exitCode = 1
    return
  }
  const [row] = JSON.parse(text)
  console.log(`${TAG} project ${project}, read only`)
  console.log(`${TAG}   published listing events        ${row.published_listing_events}`)
  console.log(`${TAG}   without any listing check       ${row.without_a_check}`)
  console.log(`${TAG}   with a check missing basis/source ${row.with_a_check_missing_basis_or_source}`)
  console.log(`${TAG}   checks by reuse basis           ${JSON.stringify(row.checks_by_basis)}`)
  const uncovered = row.without_a_check + row.with_a_check_missing_basis_or_source
  if (row.published_listing_events === 0) {
    console.error(`${TAG} FAIL: no published listing events, so nothing was shown`)
    process.exitCode = 1
  } else if (uncovered > 0) {
    console.error(`${TAG} FAIL: ${uncovered} published listing event(s) without a recorded source and reuse basis`)
    process.exitCode = 1
  } else {
    console.log(`${TAG} PASS - ${row.published_listing_events} of ${row.published_listing_events} published listing events have a recorded source and a reuse basis`)
  }
}

await main()
