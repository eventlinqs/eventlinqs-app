/**
 * R3 ON TEST: A QA PRESS ON A COUNTED HOP IS RECORDED AS A TEST AND COUNTED NOWHERE (the master mandate of 29 October
 * 2026; the project manager's 21:42 R3; 20261029220001). Through the real handlers and writers, against TEST, never
 * production:
 *
 *   scripts\ops\with-supabase-token.ps1 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify/qa-marker-drive.mts
 *
 * Plants ONE qa_markers row for a fresh random secret (through the Management API as postgres: the service role may
 * only read markers), then presses /out and /s through their route handlers and /e through its click recorder, each
 * from a crawler agent carrying the secret, and reads each row back with is_test true; presses again with a wrong
 * secret and with no secret from a crawler, and finds nothing written; reads the event's press-out week before and
 * after, and finds it unchanged. Removes every row it made and the marker, and reads that back. The secret is never
 * printed. Each check prints PASS or FAIL; the last line is the verdict.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as MarkerModule from '@/lib/broadcast/qa-marker'
import type * as OutRoute from '@/app/out/[slug]/route'
import type * as SRoute from '@/app/s/[code]/route'
import type * as ShortModule from '@/lib/broadcast/resolve-short-link'
import type * as ReachModule from '@/lib/broadcast/outbound-reach'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

assertNotProduction()
const TEST_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!url.includes(TEST_REF) || url.includes('gndnldyfudbytbboxesk')) {
  console.error('qa-marker-drive runs on TEST only')
  process.exit(2)
}
if (!token) {
  console.error('run through scripts\\ops\\with-supabase-token.ps1: the marker is written as postgres')
  process.exit(2)
}

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const marker = unwrap((await import('@/lib/broadcast/qa-marker')) as typeof MarkerModule & { default?: typeof MarkerModule })
const outRoute = unwrap((await import('@/app/out/[slug]/route')) as typeof OutRoute & { default?: typeof OutRoute })
const sRoute = unwrap((await import('@/app/s/[code]/route')) as typeof SRoute & { default?: typeof SRoute })
const short = unwrap((await import('@/lib/broadcast/resolve-short-link')) as typeof ShortModule & { default?: typeof ShortModule })
const reach = unwrap((await import('@/lib/broadcast/outbound-reach')) as typeof ReachModule & { default?: typeof ReachModule })

const db = createClient(url, key, { auth: { persistSession: false } })
let failures = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
}

async function sql(query: string): Promise<unknown[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`management query ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body) as unknown[]
}

const CRAWLER = 'EventLinqs-QA crawler (window 5, R3 drive on TEST)'
const secret = randomBytes(32).toString('hex')
const sha = marker.qaMarkerHash(secret)
const started = new Date().toISOString()
console.log(`STARTED ${started}`)

try {
  // The switch the hops count under, read only.
  const flag = (await sql(`select enabled from public.feature_flags where flag = 'broadcast_share'`)) as { enabled: boolean }[]
  check('broadcast_share is on, so the hops count at all', flag[0]?.enabled === true, flag)

  await sql(
    `insert into public.qa_markers (sha256, label, expires_at, created_by) values ('${sha}', 'R3 drive on TEST', now() + interval '1 hour', 'window 5 drive')`,
  )
  check('the marker answers test for its secret', (await marker.qaPressOf(secret)) === 'test')
  check('the marker answers refused for another secret', (await marker.qaPressOf(randomBytes(32).toString('hex'))) === 'refused')

  // A night that presses out: published, public, ahead, with an outside ticket page.
  const { data: nights } = await db
    .from('events')
    .select('id, slug, external_ticket_url')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .not('external_ticket_url', 'is', null)
    .gt('end_date', started)
    .order('start_date', { ascending: true })
    .limit(5)
  const night = nights?.[0]
  check('a TEST night with an outside ticket page', Boolean(night?.slug), night?.slug ?? 'none')

  const testRows = async (since: string) => {
    const { count } = await db.from('share_link_events').select('id', { count: 'exact', head: true }).eq('is_test', true).gte('occurred_at', since)
    return count ?? 0
  }
  const allRows = async (since: string) => {
    const { count } = await db.from('share_link_events').select('id', { count: 'exact', head: true }).gte('occurred_at', since)
    return count ?? 0
  }

  if (night) {
    const before = await reach.fetchOutboundWeek(night.id, new Date())
    const press = (secretOrNull: string | null) => {
      const headers: Record<string, string> = { 'user-agent': CRAWLER }
      if (secretOrNull !== null) headers[marker.QA_HEADER] = secretOrNull
      return outRoute.GET(new NextRequest(`https://www.eventlinqs.test/out/${night.slug}`, { headers }), { params: Promise.resolve({ slug: night.slug }) })
    }
    const res = await press(secret)
    check('/out with the secret answers 302 out of the site', res.status === 302 && !(res.headers.get('location') ?? '').includes('eventlinqs.test'), { status: res.status })
    check('/out with the secret wrote one test row', (await testRows(started)) === 1, { rows: await testRows(started) })

    const wrong = await press(randomBytes(32).toString('hex'))
    check('/out with a wrong secret still goes out', wrong.status === 302)
    const plain = await press(null)
    check('/out from a crawler with no secret still goes out', plain.status === 302)
    check('neither wrote anything', (await allRows(started)) === 1, { rows: await allRows(started) })

    const after = await reach.fetchOutboundWeek(night.id, new Date())
    check('the press-out figure did not move', JSON.stringify(after) === JSON.stringify(before), { before, after })
  }

  // /s: a share link of that night.
  const { data: links } = await db.from('share_links').select('id, code, event_id').eq('event_id', night?.id ?? '').is('retired_at', null).limit(1)
  const link = links?.[0]
  check('a share link of that night', Boolean(link?.code), link?.code ?? 'none')
  if (link) {
    const was = await testRows(started)
    const res = await sRoute.GET(
      new NextRequest(`https://www.eventlinqs.test/s/${link.code}`, { headers: { 'user-agent': CRAWLER, [marker.QA_HEADER]: secret } }),
      { params: Promise.resolve({ code: link.code }) },
    )
    check('/s with the secret redirects', res.status === 302, { status: res.status })
    check('/s with the secret wrote one test click', (await testRows(started)) === was + 1)

    // /e: the page records through recordShortLinkClick.
    const resolved = await short.resolveShortCode(link.code)
    check('/e resolves the same link', Boolean(resolved))
    if (resolved) {
      const mid = await testRows(started)
      // A second test click inside the hour is the same visitor's repeat: a fresh agent makes a fresh visitor.
      await short.recordShortLinkClick(resolved, { userAgent: `${CRAWLER} e`, ip: '203.0.113.9', qa: secret })
      check('/e with the secret wrote one test click', (await testRows(started)) === mid + 1)
      await short.recordShortLinkClick(resolved, { userAgent: CRAWLER, ip: '203.0.113.10', qa: null })
      check('/e from a crawler with no secret wrote nothing', (await testRows(started)) === mid + 1 && (await allRows(started)) === (await testRows(started)))
    }
  }

  // Every row this drive made is a test row; none was counted as a person.
  check('every row written since the start is a test row', (await allRows(started)) === (await testRows(started)), {
    all: await allRows(started),
    test: await testRows(started),
  })
} catch (err) {
  check('the drive ran to its end', false, err instanceof Error ? err.message : String(err))
} finally {
  try {
    await sql(`delete from public.share_link_events where is_test and occurred_at >= '${started}'`)
    await sql(`delete from public.qa_markers where sha256 = '${sha}'`)
    const left = (await sql(
      `select (select count(*) from public.share_link_events where is_test and occurred_at >= '${started}') as rows, (select count(*) from public.qa_markers where sha256 = '${sha}') as markers`,
    )) as { rows: number; markers: number }[]
    check('nothing the drive made is left', Number(left[0]?.rows) === 0 && Number(left[0]?.markers) === 0, left[0])
  } catch (err) {
    check('nothing the drive made is left', false, err instanceof Error ? err.message : String(err))
  }
}

console.log(failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)
