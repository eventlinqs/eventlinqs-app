import type { ImportPlan } from './import-plan'

/**
 * THE IMPORT'S WRITE AS ONE STATEMENT (WI2 Part 1).
 *
 * The import runs through the Supabase Management API's query endpoint, which
 * takes SQL text. The whole plan becomes one DO block, so it lands whole or not
 * at all, and every update re-checks in the database that its row is still
 * EventLinqs' own, unclaimed and not removed, raising (and so writing nothing)
 * if anything moved after the plan was read.
 *
 * Values from the file reach the SQL only through `sqlLiteral`. Standard
 * conforming strings are on (Postgres' default since 9.1), so inside a quoted
 * literal a doubled quote is the only escape and a backslash is an ordinary
 * character. The block's dollar-quote tag is random per run, and a value that
 * happened to contain it is refused rather than written.
 */

export class WriteRefusal extends Error {}

/**
 * The reuse basis of every check this writer makes (release checklist A4 and D8,
 * 28 October 2026; supabase/migrations/20261028133001_listing_checks_reuse_basis.sql).
 * The row file is manual research: the night's facts read from the host's own
 * public page and written in EventLinqs' own words. It has no image column, so
 * nothing of theirs is copied. A collection run or an organiser submission writes
 * its own basis, never this one.
 */
export const MANUAL_RESEARCH_BASIS = 'manual_research_facts_only'

export function sqlLiteral(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new WriteRefusal(`not a finite number: ${v}`)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v.includes('\u0000')) throw new WriteRefusal('a value holds a NUL character')
  return `'${v.replace(/'/g, "''")}'`
}

/** A planner reference ("venue:1", "series:2") as a plpgsql variable name. */
const variable = (ref: string) => `v_${ref.replace(':', '_')}`
const isRef = (idOrRef: string) => idOrRef.includes(':')

/** A series value as SQL; the links are one JSON text (bookingLinksJson) and are cast to the column's jsonb. */
function seriesValue(column: string, value: string | number | boolean | null): string {
  return column === 'booking_links' ? `${sqlLiteral(value)}::jsonb` : sqlLiteral(value)
}

export function buildImportWrite(
  plan: ImportPlan,
  organisationId: string,
  importFile: string,
  tag: string,
): string {
  if (!/^\$[a-z0-9_]+\$$/.test(tag)) throw new WriteRefusal(`not a dollar-quote tag: ${tag}`)
  const lit = sqlLiteral
  const org = `${lit(organisationId)}::uuid`
  const declare: string[] = ['v_n int;']
  const body: string[] = []

  for (const v of plan.venues) {
    if (v.kind === 'create') {
      declare.push(`${variable(v.ref)} uuid;`)
      const entries = Object.entries(v.values) as Array<[string, string | boolean | null]>
      body.push(
        `insert into public.venues (organisation_id, ${entries.map(([c]) => c).join(', ')})` +
          ` values (${org}, ${entries.map(([, value]) => lit(value)).join(', ')})` +
          ` returning id into ${variable(v.ref)};`,
      )
    } else {
      const sets = Object.entries(v.changes).map(([c, value]) => `${c} = ${lit(value as string | null)}`)
      body.push(
        `update public.venues set ${sets.join(', ')}, updated_at = now()` +
          ` where id = ${lit(v.id)}::uuid and listing_source = 'eventlinqs' and claimed_at is null and removed_at is null;`,
        `get diagnostics v_n = row_count;`,
        `if v_n <> 1 then raise exception 'host % changed after the plan was read', ${lit(v.id)}; end if;`,
      )
    }
  }

  for (const r of plan.rows) {
    if (r.verdict !== 'write') continue
    let series: string
    if (r.series.kind === 'create') {
      series = variable(r.series.ref)
      declare.push(`${series} uuid;`)
      const { venue, ...values } = r.series.values
      const venueExpr = isRef(venue) ? variable(venue) : `${lit(venue)}::uuid`
      const entries = Object.entries(values) as Array<[string, string | number | null]>
      body.push(
        `insert into public.event_series (venue_id, organisation_id, ${entries.map(([c]) => c).join(', ')})` +
          ` values (${venueExpr}, ${org}, ${entries.map(([c, value]) => seriesValue(c, value)).join(', ')})` +
          ` returning id into ${series};`,
      )
    } else {
      series = `${lit(r.series.id)}::uuid`
      if (r.series.kind === 'update') {
        const sets = Object.entries(r.series.changes).map(
          ([c, value]) => `${c} = ${seriesValue(c, value as string | number | null)}`,
        )
        body.push(
          `update public.event_series set ${sets.join(', ')}, updated_at = now()` +
            ` where id = ${series} and listing_source = 'eventlinqs' and status <> 'removed';`,
          `get diagnostics v_n = row_count;`,
          `if v_n <> 1 then raise exception 'night % changed after the plan was read', ${lit(r.series.id)}; end if;`,
        )
      }
    }
    body.push(
      `insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome, reuse_basis)` +
        ` values (${series}, ${lit(r.check.source_url)}, ${lit(r.check.source_date)}, ${lit(importFile)}, ${lit(r.check.outcome)}, ${lit(MANUAL_RESEARCH_BASIS)});`,
    )
  }

  const sql = `do ${tag}\ndeclare\n  ${declare.join('\n  ')}\nbegin\n  ${body.join('\n  ')}\nend\n${tag};`
  if (sql.split(tag).length !== 3) throw new WriteRefusal("a value in the file holds the write block's own quote tag")
  return sql
}
