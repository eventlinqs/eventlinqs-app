/**
 * THE DETECTOR BEHIND scripts/guards/drive-quantity-control-selector.mjs.
 *
 * Close-out FO1, 18 September 2026. That guard promises that no button in the
 * tree other than the ticket selector's own quantity control answers to the
 * selector every money drive presses. The promise is only worth what the READER
 * is worth: a reader that misses a button reports zero collisions and the guard
 * goes green on exactly the defect it was written to catch.
 *
 * So the cases below are not decoration. The first three are the real shapes in
 * this codebase that broke the first draft, and the fourth is the one that cost
 * a drive: `<button onClick={() => setOpen(o => !o)}>Add to calendar</button>`,
 * whose open tag contains two `>` characters before it ends.
 */
import { describe, it, expect } from 'vitest'
import {
  endOfOpenTag,
  stripExpressions,
  accessibleName,
  buttonsIn,
} from '../../../scripts/guards/lib/jsx-buttons.mjs'

const BT = String.fromCharCode(96)

describe('endOfOpenTag', () => {
  it('finds the > that closes a plain open tag', () => {
    const src = '<button type="button">Go</button>'
    expect(endOfOpenTag(src, '<button'.length)).toBe(src.indexOf('>'))
  })

  it('does not stop at the > inside an arrow function, which is the bug that hid "Add to calendar"', () => {
    const src = '<button onClick={() => setOpen(o => !o)} type="button">Add to calendar</button>'
    const end = endOfOpenTag(src, '<button'.length)
    expect(src.slice(0, end + 1)).toBe('<button onClick={() => setOpen(o => !o)} type="button">')
  })

  it('does not stop at a > inside a string attribute', () => {
    const src = '<button aria-label="a > b" type="button">x</button>'
    const end = endOfOpenTag(src, '<button'.length)
    expect(src.slice(0, end + 1)).toBe('<button aria-label="a > b" type="button">')
  })

  it('does not stop at a > inside a template literal attribute', () => {
    const src = '<button aria-label={' + BT + 'a > ${x}' + BT + '} type="button">x</button>'
    const end = endOfOpenTag(src, '<button'.length)
    expect(src.slice(end + 1)).toBe('x</button>')
  })

  it('returns -1 when the tag never closes', () => {
    expect(endOfOpenTag('<button onClick={() => {', '<button'.length)).toBe(-1)
  })
})

describe('stripExpressions', () => {
  it('removes a balanced expression and keeps the literal text around it', () => {
    expect(stripExpressions('Pay {formatPrice(total)} now').replace(/\s+/g, ' ').trim()).toBe('Pay now')
  })

  it('removes nested braces as one expression', () => {
    expect(stripExpressions('a {x({ y: 1 })} b').replace(/\s+/g, ' ').trim()).toBe('a b')
  })

  it('does not end an expression on a brace inside a string', () => {
    expect(stripExpressions("keep {t('}')} this").replace(/\s+/g, ' ').trim()).toBe('keep this')
  })

  it('removes a JSX comment, which is an expression too', () => {
    expect(stripExpressions('Buy {/* a note */} now').replace(/\s+/g, ' ').trim()).toBe('Buy now')
  })
})

describe('accessibleName', () => {
  it('prefers a template-literal aria-label over the text', () => {
    const name = accessibleName('<button aria-label={' + BT + 'Increase ${tier.name} quantity' + BT + '}>', '+')
    expect(name).toBe('Increase ${tier.name} quantity')
  })

  it('prefers a plain string aria-label over the text', () => {
    expect(accessibleName('<button aria-label="Close dialog">', 'x')).toBe('Close dialog')
  })

  it('falls back to the text when there is no aria-label', () => {
    expect(accessibleName('<button type="button">', ' Add to calendar ')).toBe('Add to calendar')
  })

  it('drops icon elements from the text', () => {
    expect(accessibleName('<button>', '<CalendarPlus className="h-4" aria-hidden /> Add to calendar')).toBe(
      'Add to calendar',
    )
  })

  it('returns null, never a guess, when the label is computed at runtime', () => {
    expect(accessibleName('<button aria-label={labelFor(tier)}>', '+')).toBeNull()
    expect(accessibleName('<button type="button">', "{isPending ? 'Reserving' : 'Checkout'}")).toBeNull()
  })
})

describe('buttonsIn', () => {
  it('reads every named button in a file and reports its line', () => {
    const src = [
      'export function Panel() {',
      '  return (',
      '    <div>',
      '      <button onClick={() => setOpen(o => !o)}>Add to calendar</button>',
      '      <button aria-label={' + BT + 'Increase ${tier.name} quantity' + BT + '}>+</button>',
      '    </div>',
      '  )',
      '}',
    ].join('\n')
    const buttons = buttonsIn(src)
    expect(buttons.map(b => b.name)).toEqual(['Add to calendar', 'Increase ${tier.name} quantity'])
    expect(buttons.map(b => b.line)).toEqual([4, 5])
  })

  it('exposes the open tag, so a caller can find a control by its handler rather than its name', () => {
    const src = '<button onClick={() => setTierQty(tier.id, +1, tier)} aria-label="Increase GA quantity">+</button>'
    const [button] = buttonsIn(src)
    expect(button.openTag).toContain('setTierQty(tier.id, +1, tier)')
  })

  it('omits a button whose name cannot be read statically rather than inventing one', () => {
    const src = "<button type=\"button\">{isPending ? 'Reserving' : 'Checkout'}</button>"
    expect(buttonsIn(src)).toEqual([])
  })

  it('handles a self-closing button without running off the end of the file', () => {
    const src = '<button aria-label="Dismiss" />\n<button>Keep</button>'
    expect(buttonsIn(src).map(b => b.name)).toEqual(['Dismiss', 'Keep'])
  })

  it('does not let a nested button end the outer one early', () => {
    const src = '<div><button aria-label="outer"><span><button aria-label="inner">i</button></span></button></div>'
    expect(buttonsIn(src).map(b => b.name)).toEqual(['outer', 'inner'])
  })
})
