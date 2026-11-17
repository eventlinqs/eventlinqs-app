import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO ROUTE INTO THE PUBLISHER SKIPS THE GATE (P0 section 3, the PM's 22:02 of 17 November 2026, item 3 (b): "Every route
 * into Blotato goes through it. It is checked by a guard that fails if any publish path skips it"). Read from the source:
 * the publisher is made in one place, called by one run, and that run checks every piece through pieceDependencies, which
 * carries pieceQuality; scheduling and draft save carry the same rules.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const bodyOf = (src: string, start: string) => {
  const from = src.indexOf(start)
  if (from < 0) return ''
  const next = src.indexOf('\nexport ', from + start.length)
  return src.slice(from, next < 0 ? undefined : next)
}
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts|mjs)$/.test(name) ? [p] : []
  })

describe('the publish gate is on every route', () => {
  const store = read('src/lib/social/store.ts')

  it('approval and publishing check every piece through pieceDependencies, which runs pieceQuality', () => {
    expect(bodyOf(store, 'export async function pieceDependencies(')).toMatch(/pieceQuality\(/)
    expect(bodyOf(store, 'export async function approvePieceChecked(')).toMatch(/pieceDependencies\(/)
    const publish = bodyOf(store, 'export async function publishDuePieces(')
    expect(publish).toMatch(/pieceDependencies\(/)
    expect(publish.indexOf('pieceDependencies(')).toBeLessThan(publish.indexOf('publisher('))
  })

  it('scheduling and draft save carry the same rules', () => {
    expect(bodyOf(store, 'export async function scheduleApprovedPieces(')).toMatch(/pieceQuality\(/)
    expect(bodyOf(store, 'export async function editPiece(')).toMatch(/languageFaults\(/)
  })

  it('the publisher is made only in meta-wiring.ts and run only by publishDuePieces', () => {
    const src = files(join(process.cwd(), 'src')).map((f) => ({ f: relative(process.cwd(), f).replace(/\\/g, '/'), t: readFileSync(f, 'utf8') }))
    const makers = src.filter(({ f, t }) => /make(Blotato|Meta)Publisher\(/.test(t) && !/src\/lib\/social\/(blotato|meta)-publisher\.ts$/.test(f)).map(({ f }) => f)
    expect(makers).toEqual(['src/lib/social/meta-wiring.ts'])
    const runners = src.filter(({ t }) => /socialPublisherFromEnv\(/.test(t)).map(({ f }) => f).filter((f) => f !== 'src/lib/social/meta-wiring.ts')
    expect(runners).toEqual(['src/app/api/cron/social-publish/route.ts'])
    const route = read('src/app/api/cron/social-publish/route.ts')
    expect(route).toMatch(/publishDuePieces\(/)
  })
})
