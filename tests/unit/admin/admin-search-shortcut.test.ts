import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { asksForSearch } from '@/components/admin/admin-search-shortcut'
import { ADMIN_SEARCH_INPUT_ID } from '@/components/admin/admin-search-id'

/*
 * CTRL K FROM EVERY ADMIN PAGE (the CRM standard of 19 November 2026, section 2 item 6; the PM's 22:14 item 2). The
 * shortcut sits in the shared top bar, so every admin page carries it; the top bar's box carries the id it focuses;
 * the phone width, where that box is hidden, has a search link.
 */
const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
})

describe('the key that asks for search', () => {
  test.each([
    [key('k', { ctrlKey: true }), true],
    [key('K', { ctrlKey: true }), true],
    [key('k', { metaKey: true }), true],
    [key('k'), false],
    [key('k', { ctrlKey: true, shiftKey: true }), false],
    [key('k', { ctrlKey: true, altKey: true }), false],
    [key('j', { ctrlKey: true }), false],
  ])('%j asks: %s', (e, want) => {
    expect(asksForSearch(e)).toBe(want)
  })
})

describe('the top bar carries it on every admin page', () => {
  const topbar = readFileSync(join(process.cwd(), 'src/components/admin/admin-topbar.tsx'), 'utf8').replace(/\r\n/g, '\n')
  test('the shortcut is rendered and the box carries the id it focuses', () => {
    expect(topbar).toContain('<AdminSearchShortcut />')
    expect(topbar).toContain('id={ADMIN_SEARCH_INPUT_ID}')
    expect(ADMIN_SEARCH_INPUT_ID).toBe('admin-search')
  })
  test('the phone width, where the box is hidden, has one tap to search', () => {
    expect(topbar).toMatch(/href="\/admin\/search"[\s\S]{0,400}sm:hidden/)
  })
})
