import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPROVED_FILE_PREFIX, inLockedLook, isApprovedFileUrl, type Slide } from '@/lib/social/campaign'
import { formatOfSlides } from '@/lib/social/meta-publisher'
import { pieceQuality } from '@/lib/social/piece-quality'

/*
 * LAWAL'S APPROVED FILES, POSTED AS THEY ARE (Lawal, 18 November 2026, 11:55: "You can post this. You have my approval
 * now. Post them", of SOCIAL-READY-15NOV's LANY, GroovyTown and AMCF posts; the PM's 12:10 adds the organisers set). The
 * app's publishers posted only slides they drew themselves, so no route could post an approved file unchanged. A 'file'
 * slide is that route: its own address on www, never drawn again, its night read again at publishing.
 */
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')
const file = (url: string, format: 'feed' | 'story' = 'feed'): Slide => ({ t: 'file', composition: 'close', url, format, eventId: null, startDate: null })

describe('an approved file slide', () => {
  it('is only an approved file on our own site, a plain name and .jpg', () => {
    expect(isApprovedFileUrl(`${APPROVED_FILE_PREFIX}11-lany-feed.jpg`)).toBe(true)
    for (const bad of ['http://www.eventlinqs.com.au/social/approved/11-lany-feed.jpg', 'https://example.com/social/approved/11-lany-feed.jpg',
      `${APPROVED_FILE_PREFIX}../secret.jpg`, `${APPROVED_FILE_PREFIX}11-lany-feed.png`, `${APPROVED_FILE_PREFIX}sub/11.jpg`, `${APPROVED_FILE_PREFIX}`]) {
      expect(isApprovedFileUrl(bad), bad).toBe(false)
    }
  })

  it('is in the locked look, and posts as a story only when it is one', () => {
    expect(inLockedLook([file(`${APPROVED_FILE_PREFIX}16-lany-story.jpg`, 'story')])).toBe(true)
    expect(formatOfSlides([file(`${APPROVED_FILE_PREFIX}16-lany-story.jpg`, 'story')])).toBe('story')
    expect(formatOfSlides([file(`${APPROVED_FILE_PREFIX}11-lany-feed.jpg`)])).toBe('feed')
  })

  it('the ten approved files and their four Instagram feed fits are in the site, each at an approved address', () => {
    const dir = join(root, 'public/social/approved')
    const names = readdirSync(dir).filter((n) => n.endsWith('.jpg')).sort()
    // The four -ig45 files are the approved 3:4 feed files scaled whole onto 4:5 for Instagram's feed (the PM's 13:42 of
    // 18 November 2026; C:\dev\EVIDENCE\EL-18NOV\fit45), nothing cropped or changed.
    expect(names).toEqual([
      '11-lany-feed.jpg', '13-organisers-feed.jpg', '14-organisers-story.jpg', '15-organisers-square.jpg', '16-lany-story.jpg',
      '17-groovytown-feed.jpg', '18-groovytown-story.jpg', '20-amcf-feed.jpg', '21-amcf-square.jpg', '22-amcf-story.jpg',
      'amcf-feed-ig45.jpg', 'groovytown-feed-ig45.jpg', 'lany-feed-ig45.jpg', 'organisers-feed-ig45.jpg',
    ])
    for (const n of names) {
      expect(isApprovedFileUrl(`${APPROVED_FILE_PREFIX}${n}`), n).toBe(true)
      expect(existsSync(join(dir, n))).toBe(true)
    }
  })

  it('both publishers post its address unchanged, never drawing it', () => {
    const wiring = read('src/lib/social/meta-wiring.ts')
    const at = wiring.indexOf("if (s.t === 'file') {")
    expect(at).toBeGreaterThan(0)
    expect(wiring.indexOf('renderCampaignSlide(', at)).toBeGreaterThan(wiring.indexOf('continue', at))
    expect(wiring).toContain('if (!isApprovedFileUrl(s.url)) throw')
  })

  it('the publish gate reads its night again, and the admin shows the file itself', () => {
    const store = read('src/lib/social/store.ts')
    const gate = store.slice(store.indexOf("if (found?.t === 'file') {"), store.indexOf("if (found?.t === 'poster') {"))
    for (const words of ['it is no longer published and public', 'it has ended', 'not what its approved file shows', 'its ticket page answers']) {
      expect(gate, words).toContain(words)
    }
    expect(read('src/app/admin/(authed)/social/piece/[pieceId]/[n]/route.ts')).toContain("if (fileSlide.t === 'file') return NextResponse.redirect(fileSlide.url, 307)")
  })

  it('never posts once its night has started (law 22, class 2), by the same rule as every other piece', () => {
    const night = { eventId: 'lany', title: 'LANY', summary: null, venueName: 'John Cain Arena', host: null, categorySlug: 'music', sourceTitle: 'LANY',
      startDate: '2026-11-18T09:00:00Z', timezone: 'Australia/Melbourne', endDate: '2026-11-18T13:00:00Z' }
    const slides = [{ ...file(`${APPROVED_FILE_PREFIX}11-lany-feed.jpg`), eventId: 'lany', startDate: night.startDate }] as Slide[]
    const at = (iso: string) => pieceQuality({ slides, caption: 'LANY at John Cain Arena tonight.', madeAt: '2026-11-18T01:00:00Z', nights: new Map([['lany', night as never]]), now: new Date(iso) })
    expect(at('2026-11-18T08:59:00Z').filter((x) => x.startsWith('[night]'))).toEqual([])
    expect(at('2026-11-18T09:00:00Z').some((x) => x.startsWith('[night] LANY: it has started'))).toBe(true)
  })
})
