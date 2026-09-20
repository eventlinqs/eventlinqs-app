import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from '../../../scripts/guards/lib/supabase-select-chains.mjs'

/**
 * THE SCANNER THAT HAD TO SEE WHERE ONE READ ENDS AND THE NEXT BEGINS.
 *
 * The first sweep written to find the 1,000-row ceiling defect used a
 * fixed-size text window after each `.from(`, and it reported the two
 * unbounded reads in src/lib/audience/read.ts as BOUNDED, because a
 * `.maybeSingle()` belonging to a THIRD read further down sat inside the
 * window. One of those two was truncating a live screen at the time.
 *
 * So the first test here is that exact arrangement. A window-based scanner
 * passes it and reports nothing; a chain walker fails it.
 */

let dir: string
function fixture(name: string, source: string) {
  dir ??= mkdtempSync(join(tmpdir(), 'lane-b-chains-'))
  const path = join(dir, name)
  writeFileSync(path, source, 'utf8')
  return path
}

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('selectChainsIn', () => {
  it('does not let one read’s bound cover the read above it', () => {
    const path = fixture(
      'adjacent.ts',
      [
        'const [a, b, c] = await Promise.all([',
        "  admin.from('audience_members').select('city_slugs, price_band'),",
        "  admin.from('consent_events').select('subject_email').order('occurred_at', { ascending: true }),",
        "  admin.from('consent_policy').select('max_age_months').eq('id', true).maybeSingle(),",
        '])',
      ].join('\n'),
    )
    const chains = selectChainsIn(path)
    expect(chains.map(c => c.table)).toEqual(['audience_members', 'consent_events', 'consent_policy'])
    expect(chains.map(c => boundednessOf(c))).toEqual([null, null, 'single-row'])
  })

  it('reads the methods that belong to the chain and stops at the comma', () => {
    const path = fixture(
      'methods.ts',
      "const x = await admin.from('orders').select('id').eq('event_id', id).order('id').range(0, 999)\n",
    )
    const [chain] = selectChainsIn(path)
    expect(chain.methods).toEqual(['select', 'eq', 'order', 'range'])
    expect(boundednessOf(chain)).toBe('range')
  })

  it('is not fooled by a parenthesis inside a string argument', () => {
    const path = fixture(
      'strings.ts',
      "const x = await admin.from('orders').select('id').eq('note', 'a ) that is not a paren').limit(10)\n",
    )
    const [chain] = selectChainsIn(path)
    expect(chain.methods).toEqual(['select', 'eq', 'limit'])
    expect(boundednessOf(chain)).toBe('limit')
  })

  it('does not read a .from( written inside a comment as a real read', () => {
    const path = fixture(
      'commented.ts',
      [
        "// admin.from('consent_events').select('id') would be unbounded",
        "const x = await admin.from('orders').select('id').limit(5)",
      ].join('\n'),
    )
    expect(selectChainsIn(path).map(c => c.table)).toEqual(['orders'])
  })

  it('finds a chain built across several lines inside a callback', () => {
    const path = fixture(
      'callback.ts',
      [
        "const rows = await readEveryRow('consent_events', (from, to) =>",
        '  admin',
        "    .from('consent_events')",
        "    .select('subject_email')",
        "    .order('id', { ascending: true })",
        '    .range(from, to),',
        ')',
      ].join('\n'),
    )
    const [chain] = selectChainsIn(path)
    expect(chain.table).toBe('consent_events')
    expect(chain.methods).toEqual(['select', 'order', 'range'])
    expect(boundednessOf(chain)).toBe('range')
  })

  it('treats a head-only count as bounded and a bare exact count as not', () => {
    const path = fixture(
      'counts.ts',
      [
        "const a = await admin.from('orders').select('id', { count: 'exact', head: true })",
        "const b = await admin.from('orders').select('id', { count: 'exact' })",
      ].join('\n'),
    )
    const heads = headOnlySelectLines(path)
    const chains = selectChainsIn(path)
    expect(boundednessOf(chains[0], { headSelects: heads })).toBe('head-only')
    expect(boundednessOf(chains[1], { headSelects: heads })).toBeNull()
  })

  /*
   * A BUILDER HANDED TO A COMPOSER THAT RETURNS IT IS STILL ONE READ.
   * `applyPublicEventVisibility(supabase.from(..).select(..)).limit(1)` reported
   * UNBOUNDED while `.limit(1)` sat four lines below, plainly visible. A guard
   * that fires on correct code is a guard somebody switches off.
   */
  it('follows a chain that continues after a wrapping call closes', () => {
    const path = fixture(
      'wrapped.ts',
      [
        'const a = await applyPublicEventVisibility(',
        "  supabase.from('events').select('id, title'),",
        ')',
        "  .order('published_at', { ascending: false })",
        '  .limit(1)',
        '  .maybeSingle()',
      ].join('\n'),
    )
    const [chain] = selectChainsIn(path)
    expect(chain.table).toBe('events')
    expect(chain.methods).toEqual(['select', 'order', 'limit', 'maybeSingle'])
    expect(boundednessOf(chain)).toBe('single-row')
  })

  /*
   * The bridge steps over closing parens ONLY when a method call follows. A
   * read whose result is passed on to something else is still unbounded, and
   * widening the parser must not quietly widen what counts as a bound.
   */
  it('does not invent a bound when the wrapped read is merely passed on', () => {
    const path = fixture(
      'passed-on.ts',
      ["const rows = collect(supabase.from('orders').select('id'))", 'const n = rows.length'].join('\n'),
    )
    const [chain] = selectChainsIn(path)
    expect(chain.methods).toEqual(['select'])
    expect(boundednessOf(chain)).toBeNull()
  })

  it('reports the line the read starts on', () => {
    const path = fixture(
      'lines.ts',
      ['const a = 1', 'const b = 2', "const c = await admin.from('orders').select('id').limit(1)"].join('\n'),
    )
    expect(selectChainsIn(path)[0].line).toBe(3)
  })
})
