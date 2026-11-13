import { describe, expect, it } from 'vitest'
import { queueOf, SECTION_TITLES, SOURCE_KEYS, type Source } from '@/lib/admin/today-math'
import { readRepoFile } from '../../helpers/read-repo-file'

/*
 * APPROVE IN ONE PRESS, SINGLY OR IN A BATCH (order 4, Release 1 item 3: "The Command Centre is built for the phone
 * first (390): the five questions, one prioritised approval queue, approve in one press singly or in a batch (Lawal's
 * rule: approving with a simple click)"). The week's posts waiting for his yes are a queue section of their own, second
 * only to organiser events not live; each is approved here through the SAME checked approval as the studio, and a
 * press returns to the page it was made on. A judgement (a claim, a collected night) and an outreach play are never
 * approved in one press here.
 * The source tests normalise line endings: the gate's tree is CRLF.
 */

const read = (p: string) => readRepoFile(p).replace(/\r\n/g, '\n')
const PAGE = read('src/app/admin/(authed)/today/page.tsx')
const ACTIONS = read('src/app/admin/(authed)/social/actions.ts')
const TODAY = read('src/lib/admin/today.ts')

describe('the posts waiting for his yes in the queue', () => {
  it('are their own section, right after organiser events not live', () => {
    expect(SOURCE_KEYS.slice(0, 2)).toEqual(['submissions', 'pieces'])
    expect(SECTION_TITLES.pieces).toBe('Posts to approve')
  })

  it('carry the piece to approve, oldest first, beside the link to the studio', () => {
    const sources: Source[] = [
      {
        key: 'pieces',
        section: 'pieces',
        name: 'p',
        read: {
          state: 'read',
          items: [
            { id: 'piece:b', what: 'Weekend guide, Melbourne', why: 'w', since: '2026-11-12T02:00:00Z', href: '/admin/social#piece-b', approvePiece: 'b' },
            { id: 'piece:a', what: 'Week ahead, Melbourne', why: 'w', since: '2026-11-12T01:00:00Z', href: '/admin/social#piece-a', approvePiece: 'a' },
          ],
        },
      },
    ]
    const section = queueOf(sources).sections.find((s) => s.key === 'pieces')!
    expect(section.items.map((i) => i.approvePiece)).toEqual(['a', 'b'])
  })

  it('reads only drafted pieces of the week, and the pieces drawn again after a withdrawn image', () => {
    expect(TODAY).toMatch(/\.filter\(\(p\) => p\.state === 'drafted'\)/)
    expect(TODAY).toMatch(/approvePiece: p\.id,/)
    expect(TODAY).toMatch(/approvePiece: d\.piece_id,/)
  })

  it('never offers a play in one press, and says why beside it', () => {
    const plays = TODAY.slice(TODAY.indexOf('async function playsToApprove('), TODAY.indexOf('async function pausedPlays('))
    expect(plays).not.toMatch(/approvePiece/)
    expect(plays).toMatch(/not approved here in one press/)
  })
})

describe('the presses', () => {
  it('Approve on each piece and Approve all on the section go through the studio\'s own checked actions', () => {
    expect(PAGE).toMatch(/import \{ approvePieceAction, approveWeekAction \} from '\.\.\/social\/actions'/)
    expect(PAGE).toMatch(/<form action=\{approvePieceAction\}[\s\S]*?name="piece" value=\{item\.approvePiece\}[\s\S]*?name="from" value="today"/)
    expect(PAGE).toMatch(/section\.key === 'pieces' && section\.items\.length > 1[\s\S]*?<form action=\{approveWeekAction\}[\s\S]*?name="from" value="today"/)
  })

  it('each press is at least 44px', () => {
    expect(PAGE).toMatch(/const APPROVE =\n\s+'inline-flex min-h-\[44px\]/)
  })

  it('returns only to the Command Centre or the studio, never an address a form carries', () => {
    expect(ACTIONS).toMatch(/type ReturnTo = '\/admin\/today' \| '\/admin\/social'/)
    expect(ACTIONS).toMatch(/formData\?\.get\('from'\) === 'today' \? '\/admin\/today' : '\/admin\/social'/)
    const piece = ACTIONS.slice(ACTIONS.indexOf('export async function approvePieceAction('), ACTIONS.indexOf('export async function approveWeekAction('))
    expect(piece).toMatch(/approvePieceChecked\(/)
    expect(piece).toMatch(/const session = await staff\(to\)/)
    expect(piece).not.toMatch(/\bback\(/)
  })
})
