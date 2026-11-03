import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '@/lib/share/copy-text'

/*
 * EVERY COPY BUTTON COPIES (the CONTROLLER's 14:10 of 3 November 2026): the clipboard first, then the browser's own copy
 * command when the clipboard is refused; it rejects only when both refuse, so the caller keeps its own failure path.
 */
describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the clipboard when the browser allows it', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await copyText('https://www.eventlinqs.com.au/events/amcf-2026')
    expect(writeText).toHaveBeenCalledWith('https://www.eventlinqs.com.au/events/amcf-2026')
  })

  it("falls back to the browser's copy command when the clipboard is refused, so the tap still copies", async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('NotAllowedError') }) } })
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    await expect(copyText('a link')).resolves.toBeUndefined()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('rejects only when both refuse, so the caller can say so', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('NotAllowedError') }) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
    await expect(copyText('a link')).rejects.toThrow()
  })
})
