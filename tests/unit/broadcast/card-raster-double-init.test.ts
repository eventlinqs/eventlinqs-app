/**
 * A second initWasm call must NOT break the card rasteriser.
 *
 * WHAT THIS PROTECTS, and it is not hypothetical. On 2026-09-02 every one of the
 * eighteen social cards answered HTTP 500 on a server that had been rendering
 * them correctly minutes earlier, with `Error: Already initialized. The
 * initWasm() function can be used only once.` in the log. A fresh process served
 * all eighteen again, so the bytes were fine and the PROCESS was poisoned.
 *
 * The mechanism is that "already initialised" was treated as a failure. Once the
 * memoised promise rejects, the guard nulls itself so the next request retries,
 * that retry calls initWasm a second time, resvg refuses, and the process can
 * never serve another card. One transient hiccup is therefore permanent, and it
 * takes down the entire Launch Kit for the life of the lambda.
 *
 * `@resvg/resvg-wasm` keeps ONE global WASM instance while this module can be
 * instantiated more than once (the card routes reach it directly, the
 * image_pipeline health check reaches it through a dynamic import), so a second
 * init is a NORMAL event and means the binary is loaded, not broken.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const initWasm = vi.fn()
const renderMock = vi.fn(() => ({
  asPng: () => new Uint8Array([1, 2, 3]),
  free: () => {},
}))

vi.mock('@resvg/resvg-wasm', () => ({
  initWasm: (...args: unknown[]) => initWasm(...args),
  Resvg: class {
    render() {
      return renderMock()
    }
    free() {}
  },
}))

vi.mock('satori', () => ({
  default: async () => '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, existsSync: () => true }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, readFile: async () => Buffer.from([0x00, 0x61, 0x73, 0x6d]) }
})

const ELEMENT = { type: 'div', props: { children: '' } } as unknown as Parameters<
  typeof import('@/lib/broadcast/card-raster').renderCardPng
>[0]

describe('card rasteriser, second initWasm call', () => {
  beforeEach(() => {
    vi.resetModules()
    initWasm.mockReset()
    renderMock.mockClear()
  })

  it('treats "Already initialized" as success, so the card still renders', async () => {
    initWasm.mockRejectedValueOnce(
      new Error('Already initialized. The `initWasm()` function can be used only once.'),
    )
    const { renderCardPng } = await import('@/lib/broadcast/card-raster')

    const png = await renderCardPng(ELEMENT, { width: 8, height: 8, fonts: [] })

    expect(png).toBeInstanceOf(Uint8Array)
    expect(png.byteLength).toBeGreaterThan(0)
  })

  it('does not poison the process: a later render still succeeds', async () => {
    initWasm.mockRejectedValueOnce(
      new Error('Already initialized. The `initWasm()` function can be used only once.'),
    )
    const { renderCardPng } = await import('@/lib/broadcast/card-raster')

    await renderCardPng(ELEMENT, { width: 8, height: 8, fonts: [] })
    const second = await renderCardPng(ELEMENT, { width: 8, height: 8, fonts: [] })

    expect(second.byteLength).toBeGreaterThan(0)
    // Memoised: the successful path is not re-entered on every render.
    expect(initWasm).toHaveBeenCalledTimes(1)
  })

  it('still surfaces a REAL initialisation failure rather than hiding it', async () => {
    initWasm.mockRejectedValue(new Error('resvg WebAssembly binary not found'))
    const { renderCardPng } = await import('@/lib/broadcast/card-raster')

    await expect(
      renderCardPng(ELEMENT, { width: 8, height: 8, fonts: [] }),
    ).rejects.toThrow(/not found/i)
  })
})
