/**
 * NOTHING IN THE LISTING PATH GOES TO LAWAL: THE PUBLISH NOTICE TOO (WINDOW 5A, 10 November 2026).
 *
 * Production's platform_notifications held six 'event_published' rows in the 24 hours to 10 November 10:55, every one
 * for the house organisation 'EventLinqs listings', and the platform-notify cron emailed each to the founder. The
 * trigger behind them, public.notify_event_published, judged only the change of status. Migration
 * 20261110010001_listing_path_sends_no_publish_notice.sql makes it return before recording anything for the house
 * organisation's nights (the engine's collected nights and every self-listed night are published there).
 *
 * This reads the NEWEST definition of that function in supabase/migrations, so a later migration that redefines it and
 * drops the house organisation's early return fails here, and checks that the slug it names is the one the listing
 * code publishes under.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function newestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => /create or replace function public\.notify_event_published\(/i.test(read(join(MIGRATIONS, f))))
  const file = files[files.length - 1]
  const text = read(join(MIGRATIONS, file))
  const start = text.search(/create or replace function public\.notify_event_published\(/i)
  const end = text.indexOf('$published$;', start)
  return { file, body: text.slice(start, end) }
}

function constantIn(path: string, name: string): string {
  const m = read(join(ROOT, path)).match(new RegExp(`export const ${name} = '([^']+)'`))
  if (!m) throw new Error(`${name} is not declared in ${path}`)
  return m[1]
}

describe('the publish notice skips the listing path', () => {
  const { file, body } = newestDefinition()
  const slug = constantIn('src/lib/listings/collect-store.ts', 'LISTINGS_ORG_SLUG')

  it('the newest definition is the one that skips the house organisation', () => {
    expect(file).toBe('20261110010001_listing_path_sends_no_publish_notice.sql')
  })

  it('reads the organisation slug and returns before recording a notice for the house organisation', () => {
    expect(body).toMatch(/select o\.name, o\.slug, o\.owner_id into v_org_name, v_org_slug, v_owner/)
    const skip = body.search(new RegExp(`if v_org_slug = '${slug}' then\\s+return new;\\s+end if;`))
    const record = body.indexOf('perform public.record_platform_notification(')
    expect(skip).toBeGreaterThan(-1)
    expect(record).toBeGreaterThan(skip)
  })

  it('names the slug the listing code publishes under, in both places that declare it', () => {
    expect(slug).toBe('eventlinqs-listings')
    expect(constantIn('src/lib/listings/shown-organiser.ts', 'LISTINGS_ORGANISATION_SLUG')).toBe(slug)
  })

  it("keeps an organiser's own publish recorded, with the degraded record if the details fail", () => {
    expect(body.match(/perform public\.record_platform_notification\(\s*'event_published'/g)?.length).toBe(2)
    expect(body).toMatch(/'Event published: ' \|\| coalesce\(new\.title, 'untitled event'\)/)
    expect(body).toMatch(/'Event published, details unavailable: ' \|\| sqlerrm/)
  })
})
