import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'
import { HELLO_MAILBOX, mailboxFor } from '@/lib/outreach/addresses'
import { LAWAL_SIGNATURE } from '@/lib/outreach/rules'
import { SOURCE_ASK_EMAIL, draftSourceAsk, sourceAskVoiceMessage, type SourceAskData } from '@/lib/outreach/source-asks'
import { SOURCE_ASK_SUBTYPE, readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'

// THE SOURCE ASKS (WINDOW 5C, 23 November 2026; the founder, 12:14: "Apply the already-approved communication workflow
// to routine source requests."; 14:55: "Just get my engine going, please"). Five letters asking an event listing website
// for permission to show its event facts, each written through the one template, word for word the drafts of the PM's
// 07:30, each passing the communication gateway's own checks as a PERM-SOURCE first letter from hello@, none naming a
// night, no two to one organisation domain; not loaded: What's On Melbourne, a website form, and the City of Greater
// Bendigo, whose address shares bendigo.vic.gov.au with the one Bendigo letter.

const data = JSON.parse(readFileSync('scripts/ops/data/source-asks-23nov.json', 'utf8')) as SourceAskData
const POLICY = readVoicePolicy()
const DRAFTED_UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach'
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=0b6f2c1e-6a3d-4e8b-9f1a-2c3d4e5f6a7b'
const drafts = data.asks.map((a) => ({ ask: a, draft: draftSourceAsk(a, UNSUB) }))

// The first of the set as WINDOW 5C drafted it (C:/dev/EVIDENCE/EL-23NOV/source-asks/source-ask-1-city-of-ballarat.json),
// so the word for word rule is held on a host without the evidence folder too.
const FIRST_AS_DRAFTED =
  "Hi City of Ballarat team,\n\nEventLinqs is an Australian event discovery platform. We list upcoming Ballarat events so more people can find them, and we would like to include the events on Ballarat In The Know.\n\nFor each event we would show its title, date, venue and organiser, with a link back to its own page on Ballarat In The Know.\n\nAs we could not find terms covering the reuse of these listings, we wanted to ask first. Could you let us know whether the City is happy for us to show the Ballarat In The Know listings this way?\n\nThanks for your time.\n\nKind regards,\nLawal Adams\nFounder, EventLinqs\neventlinqs.com.au\nABN 30 837 447 587\nGeelong, VIC, Australia\n\nIf you'd rather I didn't write again, just reply and say so, or unsubscribe here: https://www.eventlinqs.com.au/unsubscribe/outreach"

const NIGHT = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tonight|tomorrow)\b|\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b|\b20\d\d-\d\d-\d\d\b/i

describe('the source asks of 23 November 2026', () => {
  it('are five sources by email, each once; the website form and the second Bendigo address are not loaded and say why', () => {
    expect(data.asks).toHaveLength(5)
    expect(new Set(data.asks.map((a) => a.organiser)).size).toBe(5)
    expect(new Set(data.asks.map((a) => a.contact.address)).size).toBe(5)
    for (const a of data.asks) expect(a.contact.channel, a.id).toBe('email')
    expect(data.notLoaded.map((n) => [n.address, n.channel])).toEqual([
      ['requests@bendigo.vic.gov.au', 'email'],
      ['https://whatson.melbourne.vic.gov.au/contact-us', 'website_form'],
    ])
    expect(data.notLoaded[0].why).toMatch(/one first letter per organisation/)
    expect(data.notLoaded[1].why).toMatch(/founder sends it himself/)
  })

  it('write to one address per organisation domain, so the sender refuses none (one-first-letter.ts); Bendigo is tourism@', () => {
    const domains = data.asks.map((a) => a.contact.address.split('@')[1])
    expect(new Set(domains).size).toBe(domains.length)
    expect(data.asks.filter((a) => a.contact.address.endsWith('@bendigo.vic.gov.au')).map((a) => a.contact.address)).toEqual(['tourism@bendigo.vic.gov.au'])
  })

  it('are written through the one template, so the first is the drafted letter word for word', () => {
    const first = data.asks.find((a) => a.id === 'source-ask-1-city-of-ballarat')
    expect(first).toBeDefined()
    if (!first) return
    const d = draftSourceAsk(first, DRAFTED_UNSUB)
    expect(d.body).toBe(FIRST_AS_DRAFTED)
    expect(d.subject).toBe('Ballarat In The Know events on EventLinqs')
    expect(SOURCE_ASK_EMAIL.subject).toBe('[listings] events on EventLinqs')
  })

  it("equal each drafted file word for word, subject, greeting and body, where the drafts are on this machine", () => {
    for (const a of data.asks) {
      const file = `C:/dev/EVIDENCE/EL-23NOV/source-asks/${a.id}.json`
      if (!existsSync(file)) return
      const drafted = JSON.parse(readFileSync(file, 'utf8')) as { to: string[]; subject: string; greeting_name: string; body: string; consent: { published_on_url: string } }
      const d = draftSourceAsk(a, DRAFTED_UNSUB)
      expect(d.body, a.id).toBe(drafted.body)
      expect(d.subject, a.id).toBe(drafted.subject)
      expect(d.greetingName, a.id).toBe(drafted.greeting_name)
      expect([d.address], a.id).toEqual(drafted.to)
      expect(a.contact.publishedOn, a.id).toBe(drafted.consent.published_on_url)
    }
  })

  it('each passes every rule of the messages file, so nothing holds it', () => {
    for (const { ask, draft } of drafts) {
      expect(draft.ruleFailures, ask.id).toEqual([])
      expect(draft.body, ask.id).toContain(LAWAL_SIGNATURE)
      expect(draft.body.endsWith(`unsubscribe here: ${UNSUB}`), ask.id).toBe(true)
    }
  })

  it("each passes the gateway's checks as a PERM-SOURCE first letter from hello@, on its published page, checked", () => {
    for (const { ask, draft } of drafts) {
      const msg = sourceAskVoiceMessage(ask, draft)
      expect(msg).toMatchObject({ category: 'first_contact', subtype: SOURCE_ASK_SUBTYPE, from: HELLO_MAILBOX, to: [ask.contact.address] })
      expect(msg.consent).toEqual({ basis: 'conspicuous_publication', publishedOnUrl: ask.contact.publishedOn, noMarketingStatementChecked: true })
      expect(msg.consent?.publishedOnUrl, ask.id).toMatch(/^https:\/\//)
      expect(voiceProblems(msg, POLICY), ask.id).toEqual([])
    }
  })

  it('the subject rule refuses a wrong subject, an offer subject included, and the same letter under another subtype', () => {
    for (const { ask, draft } of drafts) {
      const msg = sourceAskVoiceMessage(ask, draft)
      for (const subject of [`Promoting ${ask.listings} on EventLinqs`, `${ask.listings} on EventLinqs`, 'Could I ask your advice?']) {
        expect(voiceProblems({ ...msg, subject }, POLICY).some((x) => x.includes('a source ask (PERM-SOURCE) takes one of its approved subjects')), `${ask.id}: ${subject}`).toBe(true)
      }
      const asImage = voiceProblems({ ...msg, subtype: 'PERM-IMAGE' }, POLICY)
      expect(asImage.some((x) => x.includes('offer led subject')), ask.id).toBe(true)
      expect(asImage.some((x) => x.includes('timing')), ask.id).toBe(true)
    }
  })

  it('no draft names a night: no weekday, no date, no event date, and the timing rule has nothing to judge', () => {
    for (const { ask, draft } of drafts) {
      const msg = sourceAskVoiceMessage(ask, draft)
      expect(msg.eventDate, ask.id).toBeUndefined()
      expect(msg.landsOn, ask.id).toBeUndefined()
      expect(`${draft.subject}\n${draft.body}`.match(NIGHT), ask.id).toBeNull()
      expect(voiceProblems(msg, POLICY).some((x) => x.includes('timing')), ask.id).toBe(false)
    }
  })

  it('is PERM-SOURCE by its template, so it goes from hello@, the permissions mailbox (law 33 (a))', () => {
    expect(TEMPLATE_CLASS[SOURCE_ASK_EMAIL.key]).toEqual({ category: 'PERM', subtype: SOURCE_ASK_SUBTYPE })
    expect(mailboxFor({ category: TEMPLATE_CLASS[SOURCE_ASK_EMAIL.key].category, purpose: 'cadence' })).toEqual({ mailbox: HELLO_MAILBOX })
    expect(SOURCE_ASK_EMAIL).toMatchObject({ channel: 'email', purpose: 'cadence', step: 1 })
  })

  it('records where every address was read, on the day, the role it is published for and why the ask fits it', () => {
    expect(data.seenOn).toBe('2026-11-23')
    for (const a of data.asks) {
      expect(a.contact.publishedOn, a.id).toMatch(/^https:\/\//)
      expect(a.website, a.id).toMatch(/^https:\/\/[^\s/]+\.[^\s/]+/)
      expect(a.contact.role.trim().length, a.id).toBeGreaterThanOrEqual(2)
      expect(a.contact.role.length, a.id).toBeLessThanOrEqual(80)
      expect(a.contact.relevance.trim().length, a.id).toBeGreaterThanOrEqual(10)
      expect(a.contact.relevance.length, a.id).toBeLessThanOrEqual(500)
      expect(a.contact.noMarketingStatementChecked, a.id).toBe(true)
      expect(a.contact.checkNote, a.id).toMatch(/read on 23 November 2026/)
      expect(a.contact.evidence, a.id).toBe(`C:/dev/EVIDENCE/EL-23NOV/source-asks/${a.id}.json`)
    }
  })
})

describe('the loader (scripts/ops/outreach-source-asks.ts)', () => {
  const src = readFileSync('scripts/ops/outreach-source-asks.ts', 'utf8')
  it('runs on TEST only, and writes the production files without connecting', () => {
    expect(src).toContain("const TEST_REF = 'vkapkibzokmfaxqogypq'")
    expect(src.match(/api\.supabase\.com\/v1\/projects\/\$\{([A-Z_]+)\}/g)).toEqual(['api.supabase.com/v1/projects/${TEST_REF}'])
    expect(src).toContain("writeFile('load-DRY.sql', `${withReadBack}rollback;\\n`)")
    expect(src).toContain("writeFile('load-APPLY.sql', `${withReadBack}commit;\\n`)")
  })
  it('refuses before writing: a draft failing a rule or a gateway check, two letters to one domain, and a database without the class', () => {
    expect(src).toContain('voiceProblems(sourceAskVoiceMessage(')
    expect(src).toContain('if (refused) process.exit(1)')
    expect(src).toContain('one first letter per organisation`)')
    expect(src).toContain("is distinct from 'PERM-SOURCE' then")
  })
  it("approves the play on the founder's words and drafts no letter to an organisation already written to", () => {
    expect(src).toContain("update public.outreach_plays set state = 'approved', approved_by = ${q(by)}, approved_at = now()")
    expect(src).toContain('Just get my engine going, please: my outreach, my photo permissions, everything my system')
    expect(src).toContain('and not exists (select 1 from src_ask_written w where w.id = d.id);')
  })
  // The rolled back TEST run of 23 November 2026 matched by website put the City of Ballarat's letter on Ballarat Aquatic
  // and Lifestyle Centre (ballarat.vic.gov.au) and the Bendigo Visitor Centre's on Bendigo Art Gallery (bendigoregion.com.au).
  it('matches an owner by its name only, never by a website many organisers share, and drafts nothing to another organiser', () => {
    expect(src).toContain("join public.organisers o on o.name_key = ${nameKey('d.organiser')}\n order by d.id, o.created_at;")
    expect(src).not.toContain("o.name_key = ${nameKey('d.organiser')} or o.website_key")
    expect(src).toContain('so its greeting would not name its own team')
  })
})
