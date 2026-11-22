import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
// These tests prove the earlier families' own rules, kept behind EARLIER_FAMILIES_ON (law 13); law 37's hold over the same
// pieces is proved in law37.test.ts and by the guard law37-only, so here alone its refusal is set aside.
vi.mock('@/lib/social/law37', async (orig) => ({ ...(await orig<typeof import('@/lib/social/law37')>()), law37Refusal: () => null }))
import { APPROVED_FILE_PREFIX, isApprovedFileUrl } from '@/lib/social/campaign'
import { imageFacts } from '@/lib/social/destination-specs'
import { namesAStandIn, standInOf } from '@/lib/social/stand-ins'

/*
 * THE WHOLE PUBLISH PATH ON EVERY APPROVED PIECE, AS PRODUCTION HOLDS IT (the PM's 15:33 of 18 November 2026, items (a)
 * and (b)). On 18 November at 15:13 the publish run threw on the first of Lawal's twelve approved posts; a test that ran
 * one piece's fit and never the gate let it through. This runs publishDuePieces itself, the gate (pieceDependencies:
 * the nights, the publish gate, the visual check, the creative checks, the page), the destination check and then a
 * publisher that records what it is given, over the twelve stored pieces read from production at 15:42
 * (tests/fixtures/social/approved-pieces-18nov.json: only the columns store.ts reads).
 *
 * The network: an approved file is served from its own bytes in public/social/approved; our own page answers listing
 * each night's page; an outside ticket page answers. The booking links are the fixture's own rows.
 *
 * THE GO'S CHECK, item (b): a go that writes an approval runs this same file first on the pieces it is about to approve,
 * read from production that minute (SOCIAL_GO_FIXTURE=<its fixture>, SOCIAL_GO_LIVE=1: every page, ticket page and file
 * is then fetched for real), and the go refuses unless every piece reaches the publisher (C:\dev\EVIDENCE\EL-18NOV\go\
 * check-go.sh writes the record apply.sh reads).
 */
type Row = Record<string, unknown>
type Fixture = Record<string, Row[]> & { read_at: string }

const root = process.cwd()
const FIXTURE = process.env.SOCIAL_GO_FIXTURE ?? join(root, 'tests', 'fixtures', 'social', 'approved-pieces-18nov.json')
const LIVE = process.env.SOCIAL_GO_LIVE === '1'
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
const hoisted = vi.hoisted(() => ({ links: [] as Record<string, unknown>[] }))
hoisted.links.push(...(fixture.booking_links ?? []))

vi.mock('@/lib/events/booking-links-read', async () => {
  const { toBookingLink } = await import('@/lib/events/booking-links')
  return {
    readBookingLinks: async (eventId: string) =>
      hoisted.links
        .filter((r) => r.event_id === eventId)
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((r) => toBookingLink(r as never)),
  }
})

/** A database over the fixture's rows, answering the chains store.ts makes; any other table or call fails the test. */
function fixtureDb(tables: Record<string, Row[]>, refuse: (table: string, change: Row) => string | null = () => null) {
  const writes: { table: string; payload: Row; where: [string, unknown][] }[] = []
  const query = (table: string) => {
    const tests: ((r: Row) => boolean)[] = []
    const where: [string, unknown][] = []
    let sort: { key: string; up: boolean } | null = null
    let cap = Number.POSITIVE_INFINITY
    let one = false
    let change: Row | null = null
    const run = () => {
      const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
      if (change) {
        const why = refuse(table, change)
        if (why) return { data: null, error: { message: why } }
        writes.push({ table, payload: change, where })
        for (const r of rows) Object.assign(r, change)
        return { data: null, error: null }
      }
      const at = (r: Row, k: string) => String(r[k] ?? '')
      const sorted = sort ? [...rows].sort((a, b) => (sort!.up ? 1 : -1) * at(a, sort!.key).localeCompare(at(b, sort!.key), 'en', { numeric: true })) : rows
      const kept = sorted.slice(0, cap)
      return one ? { data: kept[0] ?? null, error: null } : { data: kept, error: null }
    }
    const time = (v: unknown) => Date.parse(String(v))
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (where.push([k, v]), tests.push((r) => String(r[k]) === String(v)), q),
      neq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) !== String(v)), q),
      // PostgREST's not(k, 'is', null): the row holds a value (the earlier submission read, AV (a)).
      not: (k: string, op: string, v: unknown) => (tests.push((r) => (op === 'is' && v === null ? r[k] !== null && r[k] !== undefined : true)), q),
      in: (k: string, vs: unknown[]) => (tests.push((r) => vs.map(String).includes(String(r[k]))), q),
      lte: (k: string, v: unknown) => (tests.push((r) => time(r[k]) <= time(v)), q),
      lt: (k: string, v: unknown) => (tests.push((r) => time(r[k]) < time(v)), q),
      // The public rule's listing window groups (applyPublicEventVisibility): every fixture night is listed, so all pass.
      or: () => q,
      order: (k: string, o?: { ascending?: boolean }) => ((sort = { key: k, up: o?.ascending !== false }), q),
      limit: (n: number) => ((cap = n), q),
      maybeSingle: () => ((one = true), q),
      update: (payload: Row) => ((change = payload), q),
      then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, no),
    }
    return q
  }
  const db = {
    from: (table: string) => {
      if (!(table in tables)) throw new Error(`the publish path read a table the fixture does not hold: ${table}`)
      return query(table)
    },
    rpc: async (name: string) => {
      if (name === 'venue_distribution_off') return { data: tables.venue_distribution_off ?? [], error: null }
      if (name === 'social_usable_images') return { data: [], error: null }
      throw new Error(`the publish path called a function the fixture does not hold: ${name}`)
    },
  }
  return { db, writes }
}

const onDisk = (url: string) => new Uint8Array(readFileSync(join(root, 'public', 'social', 'approved', url.slice(APPROVED_FILE_PREFIX.length))))
const nightPages = (fixture.events ?? []).map((e) => `<a href="/events/${String(e.slug)}">${String(e.title)}</a>`).join('')
// Each seller's ticket page answers as it was measured from this machine with the gate's own agent (the fixture's
// ticket_page_answers, read 18 November 2026 at 17:07: AXS 403 behind its robot wall, GroovyTown 200), never assumed.
const measured = (fixture as unknown as { ticket_page_answers?: Record<string, number> }).ticket_page_answers ?? {}
function servedWith(answers: Record<string, number>) {
  return async (url: string): Promise<Response> => {
    if (url.startsWith(APPROVED_FILE_PREFIX)) return new Response(onDisk(url))
    if (new URL(url).hostname === 'www.eventlinqs.com.au') return new Response(`<html><body>${nightPages}</body></html>`, { status: 200 })
    const status = answers[url]
    if (status === undefined) throw new Error(`no measured answer for ${url}: read it from this machine and record it in the fixture`)
    return new Response(status < 400 ? '<html><body>tickets</body></html>' : '<html><head><title>AXS Access Info</title></head></html>', { status })
  }
}
const served = servedWith(measured)

/** publishDuePieces itself over the fixture's rows, with a recording publisher; each row starts 'scheduled'. */
async function runPath(fetcher: ((url: string) => Promise<Response>) | undefined) {
  const { publishDuePieces } = await import('@/lib/social/store')
  const tables: Record<string, Row[]> = {
    feature_flags: fixture.feature_flags ?? [],
    social_piece_schedules: (fixture.social_piece_schedules ?? []).map((s) => ({ ...s, state: 'scheduled' })),
    social_pieces: fixture.social_pieces ?? [],
    social_piece_revisions: fixture.social_piece_revisions ?? [],
    social_piece_approvals: fixture.social_piece_approvals ?? [],
    events: fixture.events ?? [],
    venue_distribution_off: (fixture.venue_distribution_off ?? []) as Row[],
  }
  const { db } = fixtureDb(tables)
  const schedules = tables.social_piece_schedules
  const lastDue = Math.max(...schedules.map((s) => Date.parse(String(s.go_at))))
  const now = LIVE ? new Date() : new Date(lastDue + 60_000)
  const given: { readonly pieceId: string; readonly platform: string }[] = []
  const publisher = vi.fn(async (p: { readonly pieceId: string; readonly platform: string; readonly slides: readonly unknown[]; readonly caption: string }) => {
    given.push(p)
    return { ref: `https://www.instagram.com/p/fixture-${p.pieceId.slice(0, 8)}-${p.platform}` }
  })
  const out = await publishDuePieces(db as never, now, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher })
  return { out, given, schedules }
}
/**
 * The schedules whose newest revision carries a stock stand-in photograph or a caption naming one (the PM's 15:55 of 19
 * November 2026, item 6: none goes out), read from the rows themselves, never listed by hand.
 */
/** The schedules of a piece any of whose versions names the OTHER platform as its link's source (campaign.ts
 * creativeRefusals, the PM's 14:00 of 20 November 2026): the gate holds both of that piece's schedules. */
function crossedFor(schedules: Row[]): Set<string> {
  const revs = fixture.social_piece_revisions ?? []
  return new Set(
    schedules
      .filter((s) => {
        const rev = revs.filter((r) => r.piece_id === s.piece_id).sort((a, b) => Number(b.version) - Number(a.version))[0]
        const v = (rev.versions ?? {}) as Record<string, { caption?: string; cta?: string }>
        const said = (k: string) => `${v[k]?.caption ?? ''}\n${v[k]?.cta ?? ''}`
        return /utm_source=facebook\b/i.test(said('instagram')) || /utm_source=instagram\b/i.test(said('facebook'))
      })
      .map((s) => String(s.id)),
  )
}

function stockFor(schedules: Row[]): Set<string> {
  const revs = fixture.social_piece_revisions ?? []
  return new Set(
    schedules
      .filter((s) => {
        const rev = revs.filter((r) => r.piece_id === s.piece_id).sort((a, b) => Number(b.version) - Number(a.version))[0]
        const slides = (rev.slides ?? []) as { photo?: string | null }[]
        const captions = Object.values((rev.versions ?? {}) as Record<string, { caption?: string }>).map((v) => v.caption ?? '')
        return slides.some((sl) => Boolean(standInOf(sl.photo ?? null))) || captions.some(namesAStandIn)
      })
      .map((s) => String(s.id)),
  )
}

/** The Facebook schedules whose newest revision's file is taller than 4:5, read from the files (Lawal's 20:08 ruling holds them). */
function tooTallFor(schedules: Row[]): Set<string> {
  const revs = fixture.social_piece_revisions ?? []
  return new Set(
    schedules
      .filter((s) => s.platform === 'facebook')
      .filter((s) => {
        const rev = revs.filter((r) => r.piece_id === s.piece_id).sort((a, b) => Number(b.version) - Number(a.version))[0]
        const f = imageFacts(onDisk(String((rev.slides as { url: string }[])[0].url)))
        return f !== null && f.width / f.height < 4 / 5
      })
      .map((s) => String(s.id)),
  )
}
const LANY = (fixture.events ?? []).find((e) => String(e.title) === 'LANY')
const AXS = String(LANY?.external_ticket_url)
const lanyPieces = new Set((fixture.social_piece_revisions ?? []).filter((r) => (r.event_ids as string[]).includes(String(LANY?.id))).map((r) => String(r.piece_id)))

describe('the whole publish path on every approved piece', () => {
  it(`reaches the publisher with every piece exactly as approved, holding none${LIVE ? ' (live network)' : ''}`, async () => {
    const { publishDuePieces } = await import('@/lib/social/store')
    const tables: Record<string, Row[]> = {
      feature_flags: fixture.feature_flags ?? [],
      social_piece_schedules: (fixture.social_piece_schedules ?? []).map((s) => ({ ...s, state: 'scheduled' })),
      social_pieces: fixture.social_pieces ?? [],
      social_piece_revisions: fixture.social_piece_revisions ?? [],
      social_piece_approvals: fixture.social_piece_approvals ?? [],
      events: fixture.events ?? [],
      venue_distribution_off: (fixture.venue_distribution_off ?? []) as Row[],
    }
    const { db, writes } = fixtureDb(tables)
    const schedules = tables.social_piece_schedules
    expect(schedules.length).toBeGreaterThan(0)
    // The moment every piece is due and no night has started, read from the rows themselves.
    const lastDue = Math.max(...schedules.map((s) => Date.parse(String(s.go_at))))
    const now = LIVE ? new Date() : new Date(lastDue + 60_000)
    const given: { readonly pieceId: string; readonly platform: string; readonly slides: readonly unknown[]; readonly caption: string }[] = []
    const publisher = vi.fn(async (p: { readonly pieceId: string; readonly platform: string; readonly slides: readonly unknown[]; readonly caption: string }) => {
      given.push(p)
      return { ref: `https://www.instagram.com/p/fixture-${p.pieceId.slice(0, 8)}-${p.platform}` }
    })
    const out = await publishDuePieces(db as never, now, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: LIVE ? undefined : served })

    // Under Lawal's 20:08 ruling a Facebook feed post on a file taller than 4:5 is held with the reason; every other piece
    // reaches the publisher. Which pieces those are is read from the files themselves, never listed by hand.
    const tooTall = tooTallFor(schedules)
    if (!LIVE) expect(tooTall.size).toBe(2)
    // The PM's 15:55 of 19 November 2026, item 6: a piece carrying a stock photograph or naming one is held too.
    const stock = stockFor(schedules)
    const crossed = crossedFor(schedules)
    const heldIds = new Set([...tooTall, ...stock, ...crossed])
    expect(out.held.length).toBe(heldIds.size)
    for (const h of out.held) expect(h).toMatch(/does not fit facebook: it is 1440x1920, ratio 0\.750, outside facebook feed's 0\.800 to 1\.910|stock photograph|utm_source=(instagram|facebook)/)
    // Each stock schedule is held for its stock photograph, which the gate names before a file's fit (one is also too tall).
    if (!LIVE) expect(out.held.filter((h) => /stock photograph/.test(h)).length).toBe(stock.size)
    const reaching = schedules.filter((s) => !heldIds.has(String(s.id)))
    expect(given.length).toBe(reaching.length)
    expect(new Set(given.map((g) => `${g.pieceId} ${g.platform}`)).size).toBe(reaching.length)
    for (const s of reaching) {
      const rev = tables.social_piece_revisions.filter((r) => r.piece_id === s.piece_id).sort((a, b) => Number(b.version) - Number(a.version))[0]
      const sent = given.find((g) => g.pieceId === s.piece_id && g.platform === s.platform)
      expect(sent, `${String(s.piece_id)} on ${String(s.platform)}`).toBeDefined()
      // Lawal's words and files exactly as approved: the platform's own caption, the stored slides, each an approved file.
      expect(sent!.caption).toBe((rev.versions as Record<string, { caption: string }>)[String(s.platform)].caption)
      expect(sent!.slides).toEqual(rev.slides)
      for (const slide of sent!.slides as { t: string; url: string }[]) {
        expect(slide.t).toBe('file')
        expect(isApprovedFileUrl(slide.url)).toBe(true)
      }
    }
    // Each schedule is recorded published, once.
    const published = writes.filter((w) => w.table === 'social_piece_schedules' && w.payload.state === 'published')
    expect(published.length).toBe(reaching.length)
  }, 120_000)

  it.skipIf(LIVE)("a seller's robot wall (403) stands on the night's booking link; a link that reads dead still holds the night", async () => {
    expect(measured[AXS]).toBe(403)
    const link = hoisted.links.find((l) => l.url === AXS)
    expect(link?.availability).toBe('on_sale')
    const before = link!.availability
    // The night still sells through a second, live link, so it reads as selling elsewhere and its ticket page is read;
    // only the link for the page that answers 403 reads dead.
    const second = { ...link!, id: 'second-live-link', url: 'https://example.com/lany-second-seller', position: Number(link!.position) + 1, availability: 'on_sale' }
    link!.availability = 'dead'
    hoisted.links.push(second)
    try {
      const { out, given } = await runPath(servedWith({ ...measured, [second.url]: 200 }))
      expect(given.some((g) => lanyPieces.has(g.pieceId))).toBe(false)
      expect(out.held.filter((h) => h.includes('its ticket page refuses our reader (403) and its booking link reads dead')).length).toBe(3)
      const all = fixture.social_piece_schedules ?? []
      const heldIds = new Set([...all.filter((x) => lanyPieces.has(String(x.piece_id))).map((x) => String(x.id)), ...tooTallFor(all), ...stockFor(all), ...crossedFor(all)])
      expect(given.length).toBe(all.length - heldIds.size)
    } finally {
      link!.availability = before
      hoisted.links.splice(hoisted.links.indexOf(second), 1)
    }
  }, 120_000)

  it.skipIf(LIVE)('a post Blotato accepts keeps its submission when the database refuses its reference (18 November, five lost)', async () => {
    const { publishDuePieces } = await import('@/lib/social/store')
    const tables: Record<string, Row[]> = {
      feature_flags: fixture.feature_flags ?? [],
      social_piece_schedules: (fixture.social_piece_schedules ?? []).map((s) => ({ ...s, state: 'scheduled' })),
      social_pieces: fixture.social_pieces ?? [],
      social_piece_revisions: fixture.social_piece_revisions ?? [],
      social_piece_approvals: fixture.social_piece_approvals ?? [],
      events: fixture.events ?? [],
      venue_distribution_off: (fixture.venue_distribution_off ?? []) as Row[],
    }
    // The check in force on 18 November: published_ref takes only a public post URL, so a 'blotato:' reference is refused.
    const refuse = (table: string, change: Row) =>
      table === 'social_piece_schedules' && typeof change.published_ref === 'string' && change.published_ref.startsWith('blotato:')
        ? 'new row for relation "social_piece_schedules" violates check constraint "social_piece_schedules_published_ref_check"'
        : null
    const { db, writes } = fixtureDb(tables, refuse)
    const schedules = tables.social_piece_schedules
    const now = new Date(Math.max(...schedules.map((s) => Date.parse(String(s.go_at)))) + 60_000)
    const publisher = vi.fn(async (p: { readonly pieceId: string; readonly platform: string }) => {
      const submission = `sub-${p.pieceId.slice(0, 8)}-${p.platform}`
      return { ref: `blotato:${submission}`, submission }
    })
    const out = await publishDuePieces(db as never, now, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: served })
    const notSent = new Set([...tooTallFor(schedules), ...stockFor(schedules), ...crossedFor(schedules)])
    expect(publisher).toHaveBeenCalledTimes(schedules.length - notSent.size)
    // Every row held, and each one the publisher sent keeps the reference that names the post, so it can be read back.
    expect(out.held.length).toBe(schedules.length)
    for (const s of schedules.filter((x) => !notSent.has(String(x.id)))) {
      const id = String(s.id)
      const submission = `sub-${String(s.piece_id).slice(0, 8)}-${String(s.platform)}`
      const mine = writes.filter((w) => w.where.some(([k, v]) => k === 'id' && v === id))
      const first = mine.findIndex((w) => w.payload.submission_ref === `blotato:${submission}`)
      const held = mine.findIndex((w) => w.payload.state === 'held')
      expect(first, `${id}: its submission is written to its own column`).toBeGreaterThanOrEqual(0)
      expect(held, `${id}: then it is held`).toBeGreaterThan(first)
      expect(String(mine[held].payload.held_reason)).toMatch(new RegExp(`^Sent as blotato:${submission}; the database refused that reference`))
    }
  }, 120_000)

  it.skipIf(LIVE)('a ticket page that answers 404 still holds its night, whatever its link says', async () => {
    const { out, given } = await runPath(servedWith({ ...measured, [AXS]: 404 }))
    expect(given.some((g) => lanyPieces.has(g.pieceId))).toBe(false)
    expect(out.held.filter((h) => h.includes('LANY: its ticket page answers 404.')).length).toBe(3)
  }, 120_000)
})

/*
 * LAWAL'S HARDENING ORDER OF 22 NOVEMBER 2026, SECTION 5, ON THESE SAME APPROVED PIECES: test 8 (Instagram succeeds while
 * Facebook fails) and test 7 (the provider times out after it may have accepted). Each network is its own row; a failed
 * or uncertain one is held alone with its reason and the run goes on; a later run sends nothing a second time.
 */
describe.skipIf(LIVE)('section 5 of the hardening order: one network failing, a timeout, and no second send', () => {
  const setup = () => {
    const tables: Record<string, Row[]> = {
      feature_flags: fixture.feature_flags ?? [],
      social_piece_schedules: (fixture.social_piece_schedules ?? []).map((s) => ({ ...s, state: 'scheduled' })),
      social_pieces: fixture.social_pieces ?? [],
      social_piece_revisions: fixture.social_piece_revisions ?? [],
      social_piece_approvals: fixture.social_piece_approvals ?? [],
      events: fixture.events ?? [],
      venue_distribution_off: (fixture.venue_distribution_off ?? []) as Row[],
    }
    const { db } = fixtureDb(tables)
    const schedules = tables.social_piece_schedules
    const now = new Date(Math.max(...schedules.map((s) => Date.parse(String(s.go_at)))) + 60_000)
    const gateHeld = new Set([...tooTallFor(schedules), ...stockFor(schedules), ...crossedFor(schedules)])
    const reaching = schedules.filter((s) => !gateHeld.has(String(s.id)))
    return { db, now, reaching }
  }

  it('test 8, per row: one send fails while the others go: the failed row held alone with its reason, nothing sent twice (every Facebook row of this fixture is held by the gate before sending, so the failing sends are half of its Instagram rows)', async () => {
    const { publishDuePieces } = await import('@/lib/social/store')
    const t = setup()
    const failing = new Set(t.reaching.filter((_, i) => i % 2 === 1).map((s) => `${String(s.piece_id)} ${String(s.platform)}`))
    expect(failing.size).toBeGreaterThan(0)
    const calls: string[] = []
    const publisher = vi.fn(async (p: { readonly pieceId: string; readonly platform: string }) => {
      calls.push(`${p.pieceId} ${p.platform}`)
      if (failing.has(`${p.pieceId} ${p.platform}`)) throw new Error(`Blotato answered 502 for ${p.platform}`)
      return { ref: `https://www.instagram.com/p/fx-${p.pieceId.slice(0, 8)}` }
    })
    const first = await publishDuePieces(t.db as never, t.now, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: served })
    expect(first.published.length).toBe(t.reaching.length - failing.size)
    expect(first.held.filter((h) => h.includes('Blotato answered 502')).length).toBe(failing.size)
    calls.length = 0
    await publishDuePieces(t.db as never, new Date(t.now.getTime() + 3_600_000), { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: served })
    expect(calls).toEqual([])
  }, 120_000)

  it('test 7: the provider times out on every send: each held with the reason, and never sent again blind', async () => {
    const { publishDuePieces } = await import('@/lib/social/store')
    const t = setup()
    let sends = 0
    const publisher = vi.fn(async () => {
      sends++
      throw new Error('The operation was aborted due to timeout')
    })
    const first = await publishDuePieces(t.db as never, t.now, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: served })
    expect(sends).toBe(t.reaching.length)
    expect(first.published).toEqual([])
    expect(first.held.filter((h) => h.includes('aborted due to timeout')).length).toBe(t.reaching.length)
    sends = 0
    await publishDuePieces(t.db as never, new Date(t.now.getTime() + 3_600_000), { siteOrigin: 'https://www.eventlinqs.com.au', publisher, fetcher: served })
    expect(sends).toBe(0)
  }, 120_000)
})
