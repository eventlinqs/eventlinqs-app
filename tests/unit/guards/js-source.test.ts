import { describe, expect, it } from 'vitest'
import {
  stripComments,
  catchBlocks,
  catchSpeaks,
  tryTouchesTheWorld,
} from '../../../scripts/lib/js-source.mjs'

/**
 * THE READER THAT THE SILENT-CATCH GUARD IS BUILT ON.
 *
 * Two guards and one registry test now read JavaScript with this module, and a
 * reader that is wrong produces a guard that is confidently wrong, which is
 * worse than no guard: it reports PASS and nobody looks again.
 *
 * Every case below is a real failure this module has already had, or the exact
 * shape of the incident it exists to catch.
 */

const NL = String.fromCharCode(10)

describe('stripComments', () => {
  it('removes a line comment but keeps the offsets of everything after it', () => {
    const src = ['const a = 1 // venues.slug', 'const b = 2'].join(NL)
    const out = stripComments(src)
    expect(out).not.toContain('venues.slug')
    expect(out.length).toBe(src.length)
    expect(out.split(NL)[1]).toBe('const b = 2')
  })

  it('removes a block comment across lines without moving the line numbers', () => {
    const src = ['/*', ' * gone', ' */', 'const c = 3'].join(NL)
    const out = stripComments(src)
    expect(out).not.toContain('gone')
    expect(out.split(NL).length).toBe(4)
    expect(out.split(NL)[3]).toBe('const c = 3')
  })

  it('leaves string literals alone, including one that looks like a comment', () => {
    const src = `const u = 'https://example.com//x'`
    expect(stripComments(src)).toBe(src)
  })

  /*
   * THE APOSTROPHE. On 25 August 2026 the word "guard's" was added to a comment
   * beside a registration in run-guards.mjs. tests/unit/guards/guard-registry.test.ts
   * reads that array with /'([^']+)'/g, so one unmatched apostrophe flipped the
   * quote parity for every entry after it and three of its five tests went red
   * naming fragments of English prose as registered guards. The runner was
   * correct the whole time.
   */
  it("an apostrophe inside a comment cannot flip the quote parity of the code after it", () => {
    const src = [
      "const LIST = [",
      "  // the guard's own header explains it",
      "  'scripts/guards/a.mjs',",
      "  'scripts/guards/b.mjs',",
      ']',
    ].join(NL)

    const naive = [...src.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(naive).not.toEqual(['scripts/guards/a.mjs', 'scripts/guards/b.mjs'])

    const careful = [...stripComments(src).matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(careful).toEqual(['scripts/guards/a.mjs', 'scripts/guards/b.mjs'])
  })
})

describe('catchBlocks', () => {
  it('matches braces rather than guessing, so an object literal does not end the body early', () => {
    const src = `try { a() } catch (e) { report({ where: 'x' }); other() }`
    const [block] = catchBlocks(src)
    expect(block.binding).toBe('e')
    expect(block.body).toContain('other()')
  })

  it('reads the binding of a typed catch', () => {
    const [block] = catchBlocks('try { a() } catch (err: unknown) { void err }')
    expect(block.binding).toBe('err')
  })

  it('reports null for a catch with no binding', () => {
    const [block] = catchBlocks('try { a() } catch { }')
    expect(block.binding).toBeNull()
  })

  it('reports the line the catch sits on', () => {
    const src = ['const a = 1', 'try {', '  b()', '} catch {', '}'].join(NL)
    expect(catchBlocks(src)[0].line).toBe(4)
  })
})

describe('catchSpeaks', () => {
  const speaks = (code: string) => catchSpeaks(catchBlocks(code)[0])

  it('a bare catch says nothing: the sitemap shape', () => {
    expect(speaks('try { await supabase.from("venues").select("slug") } catch { }')).toBeNull()
  })

  it('re-throwing speaks', () => {
    expect(speaks('try { a() } catch (e) { throw e }')).toBe('rethrows')
  })

  it('logging speaks even with no binding', () => {
    expect(speaks('try { a() } catch { console.error("gone") }')).toBe('logs')
  })

  it('the observability seam speaks', () => {
    expect(speaks('try { a() } catch (e) { captureException(e) }')).toBe('reports')
  })

  it('naming the binding counts as recording it', () => {
    expect(speaks('try { a() } catch (e) { return { ok: false, message: String(e) } }')).toBe(
      'records',
    )
  })

  it('a body that never names its binding is still silent', () => {
    expect(speaks('try { a() } catch (e) { return null }')).toBeNull()
  })
})

describe('tryTouchesTheWorld', () => {
  it('a Supabase query does', () => {
    expect(tryTouchesTheWorld('const { data } = await supabase.from("events").select()')).toBe(true)
  })

  it('a fetch does', () => {
    expect(tryTouchesTheWorld('const r = await fetch(url)')).toBe(true)
  })

  it('a filesystem read does', () => {
    expect(tryTouchesTheWorld('const s = readFileSync(p, "utf8")')).toBe(true)
  })

  /*
   * The false positive that put a Sentry import one line away from the browser
   * bundle. `Buffer.from(` is not a database query, and src/lib/launch/bill-ref.ts
   * is imported by THE BILL, a client component.
   */
  it('Buffer.from does NOT, and neither do the other built-in .from forms', () => {
    expect(tryTouchesTheWorld('const b = Buffer.from(raw, "base64url")')).toBe(false)
    expect(tryTouchesTheWorld('const a = Array.from(x)')).toBe(false)
    expect(tryTouchesTheWorld('const o = Object.from')).toBe(false)
  })

  it('a pure parse does not', () => {
    expect(tryTouchesTheWorld('const v = JSON.parse(s); const u = new URL(s)')).toBe(false)
  })
})
