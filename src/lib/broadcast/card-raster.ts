import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import satori, { type SatoriOptions } from 'satori'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { captureException } from '@/lib/observability/sentry'

/**
 * RASTERISE A CARD, WITHOUT DEPENDING ON A NATIVE SVG DECODER.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Founder ruling, 29 August 2026.
 *
 * Every social card download answered HTTP 500 with a zero-byte body: three
 * formats across six channels, eighteen artefacts an organiser is offered on the
 * Launch Kit and cannot download.
 *
 * The cause, measured from inside the running server rather than guessed:
 * `next/og`'s ImageResponse rasterises by handing the SVG satori produced to
 * SHARP, and inside the Next server runtime that sharp cannot decode SVG at all
 * while reporting that it can:
 *
 *     sharpVersion (libvips): 8.18.3
 *     svgInput:               {"file":true,"buffer":true,...}   <- claims support
 *     svgRoundTrip:           FAILED: Input buffer contains unsupported image format
 *
 * The round trip is an EIGHT BY EIGHT RED RECTANGLE. The identical sharp in a
 * plain Node process converts it without complaint. libvips decodes SVG through
 * librsvg, a dynamically loaded module, and inside this runtime it is not there.
 *
 * It could not be fixed in @vercel/og: its getSharp() is unconditional and the
 * branch is `if (sharp)`, so resvg is reached only when the import THROWS, and
 * sharp is a real dependency of the upload pipeline.
 *
 * ---------------------------------------------------------------------------
 * SO THE RASTERISER IS OURS NOW, AND IT IS WEBASSEMBLY.
 *
 * resvg-wasm has no native module, no DLL search path and no librsvg to go
 * missing, so it behaves identically in every runtime: local, vitest, `next
 * start`, and a Vercel lambda. That property is the entire point of the change.
 * A rasteriser that works in one runtime and not another is a rasteriser that
 * differs between local, preview and production, and that difference is exactly
 * what cost eighteen artefacts.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A PORT, NOT A REWRITE, and the versions are pinned to prove it.
 *
 * satori and @resvg/resvg-wasm are installed at the EXACT versions @vercel/og
 * 0.11.1 depends on (satori 0.25.0, @resvg/resvg-wasm 2.4.0), and the calls
 * below reproduce its render() step for step, including the resvg
 * `fitTo: { mode: 'width' }` and the loadAdditionalAsset contract. The output is
 * meant to be pixel-identical, and that claim is tested rather than asserted:
 * scripts/verify/card-raster-parity.mjs renders every format through BOTH paths
 * and compares them pixel by pixel.
 *
 * WHAT loadAdditionalAsset DOES, and why dropping it would have been a real
 * regression on this platform rather than a detail. satori calls it for any text
 * the supplied fonts cannot draw. Two cases reach it:
 *
 *   EMOJI, fetched from the same twemoji CDN at the same pinned version.
 *
 *   NON-LATIN SCRIPTS. The card fonts are Archivo and Hanken Grotesk, which
 *   cover Latin. An event titled in Chinese, Arabic, Hindi, Tamil or Bengali
 *   hits this path, and without it those titles render as blank boxes. On a
 *   platform whose taxonomy is built around South Asian, Asian, Pasifika and
 *   Mediterranean communities (Law 3: 32 percent of Australians are
 *   overseas-born, India the largest group), that is not an edge case.
 */

/**
 * WHERE THE WEBASSEMBLY BINARY IS, FOUND WITHOUT ASKING THE BUNDLER.
 *
 * The binary is DATA to this module: it is read with readFile and handed to
 * initWasm as bytes. It must never enter the module graph, and equally it must
 * never be located THROUGH the module graph.
 *
 * Two ways of asking have now failed here, both on 2 September 2026, and both
 * are recorded so neither is tried a third time:
 *
 *   require_.resolve('@resvg/resvg-wasm/index_bg.wasm')
 *       Turbopack read the literal '.wasm' specifier statically, treated the
 *       binary as a module, and put it through its wasm-bindgen loader, which
 *       emits glue importing a namespace called `wbg` that nothing supplies.
 *       `next build` died: "Module not found: Can't resolve 'wbg'".
 *
 *   require_.resolve('@resvg/resvg-wasm')
 *       That BUILDS, and then fails at run time, which is worse. Inside a
 *       bundled chunk require.resolve does not return a filesystem path, it
 *       returns Turbopack's internal module id, so the call produced the number
 *       209426 and every one of the eighteen cards answered HTTP 500 with
 *       "The "path" argument must be of type string. Received type number".
 *
 * So the lookup uses fs and path only, on strings computed at run time. There is
 * nothing here for a bundler to rewrite. The walk upwards covers a hoisted
 * node_modules, a monorepo root, and the Vercel lambda layout, and the file is
 * additionally pinned into the traced output in next.config.ts so it is present
 * to be found.
 */
const WASM_RELATIVE = join('node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')

function locateResvgWasm(): string {
  const tried: string[] = []
  let dir = process.cwd()
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = join(dir, WASM_RELATIVE)
    tried.push(candidate)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Naming every path tried, because "cannot find the wasm" with no list is the
  // same unhelpful shape as the zero-byte 500 this whole module replaced.
  throw new Error(
    `resvg WebAssembly binary not found. Looked for ${WASM_RELATIVE} in:\n  ${tried.join('\n  ')}`,
  )
}

/**
 * initWasm may be called ONCE per process and throws on a second call, so the
 * promise is memoised rather than the result. Concurrent card requests all await
 * the same initialisation instead of racing into a second one.
 */
let wasmReady: Promise<void> | null = null
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      try {
        await initWasm(await readFile(locateResvgWasm()))
      } catch (error) {
        // "Already initialized" means the binary IS loaded and usable, so it is
        // a success for our purposes, not a failure. Treating it as an error is
        // what turned a single transient init failure into a permanently broken
        // process: the catch below nulls the memo, the retry calls initWasm a
        // second time, resvg refuses, and from then on EVERY social card answers
        // 500 for the life of that server. Observed on 2026-09-02, all eighteen
        // cards 500ing on a server that had been serving them minutes earlier.
        //
        // The second way in is module duplication. `card-raster` is reached both
        // by the card routes and by a dynamic import in the image_pipeline health
        // check, and a bundler is free to give those two copies of this module,
        // each with its own `wasmReady`, while `@resvg/resvg-wasm` keeps ONE
        // global instance. The first copy initialises, the second is refused.
        const message = error instanceof Error ? error.message : String(error)
        if (/already initiali[sz]ed/i.test(message)) return
        throw error
      }
    })().catch(error => {
      // A genuinely failed init must not be cached as resolved, or every later
      // render fails with a confusing message instead of the real cause.
      wasmReady = null
      throw error
    })
  }
  return wasmReady
}

/* ------------------------------------------------------------------ *
 * The additional-asset loader, ported from @vercel/og 0.11.1.
 * ------------------------------------------------------------------ */

/** Google's Noto families, by the language code satori reports. */
const LANGUAGE_FONT_MAP: Record<string, string | string[]> = {
  'ja-JP': 'Noto+Sans+JP',
  'ko-KR': 'Noto+Sans+KR',
  'zh-CN': 'Noto+Sans+SC',
  'zh-TW': 'Noto+Sans+TC',
  'zh-HK': 'Noto+Sans+HK',
  'th-TH': 'Noto+Sans+Thai',
  'bn-IN': 'Noto+Sans+Bengali',
  'ar-AR': 'Noto+Sans+Arabic',
  'ta-IN': 'Noto+Sans+Tamil',
  'ml-IN': 'Noto+Sans+Malayalam',
  'he-IL': 'Noto+Sans+Hebrew',
  'te-IN': 'Noto+Sans+Telugu',
  devanagari: 'Noto+Sans+Devanagari',
  kannada: 'Noto+Sans+Kannada',
  symbol: ['Noto+Sans+Symbols', 'Noto+Sans+Symbols+2'],
  math: 'Noto+Sans+Math',
  unknown: 'Noto+Sans',
}

/** The codepoint sequence twemoji names its files by. */
function iconCode(text: string): string {
  const points: string[] = []
  let pending = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    if (pending) {
      points.push((65536 + ((pending - 55296) << 10) + (c - 56320)).toString(16))
      pending = 0
    } else if (c >= 55296 && c <= 56319) {
      pending = c
    } else {
      points.push(c.toString(16))
    }
  }
  return points.join('-')
}

const TWEMOJI = (code: string) =>
  `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${code.toLowerCase()}.svg`

/**
 * Download just the glyphs this text needs, as a TTF.
 *
 * The user agent is deliberately an old Safari: Google serves WOFF2 to modern
 * browsers and TTF to that one, and satori can only read TTF. It is copied from
 * @vercel/og for exactly that reason.
 */
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  if (!family || !text) return null
  const api = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`
  const css = await (
    await fetch(api, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
    })
  ).text()
  const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
  if (!resource) return null
  const res = await fetch(resource[1])
  if (!res.ok) return null
  return res.arrayBuffer()
}

/**
 * Everything here is BEST EFFORT and never throws.
 *
 * A card is an organiser's artefact, and a CDN having a bad minute must degrade
 * one glyph rather than fail the whole download. @vercel/og lets these reject,
 * which surfaces as the same opaque failure this module exists to remove.
 */
const loadAdditionalAsset: NonNullable<SatoriOptions['loadAdditionalAsset']> = async (
  code: string,
  text: string,
) => {
  try {
    if (code === 'emoji') {
      const svg = await (await fetch(TWEMOJI(iconCode(text)))).text()
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    }

    const families = code
      .split('|')
      .flatMap(part => LANGUAGE_FONT_MAP[part] ?? [])
      .filter(Boolean) as string[]
    if (families.length === 0) return []

    const loaded = await Promise.all(families.map(family => loadGoogleFont(family, text)))
    return loaded
      .map((data, index) =>
        data ? { name: `satori_${code}_${index}`, data, weight: 400 as const, style: 'normal' as const } : null,
      )
      .filter((f): f is NonNullable<typeof f> => f !== null)
  } catch (error) {
    captureException(error, { where: 'lib/broadcast/card-raster:loadAdditionalAsset' })
    return []
  }
}

/* ------------------------------------------------------------------ *
 * The render itself.
 * ------------------------------------------------------------------ */

export interface RasterFont {
  name: string
  data: Buffer | ArrayBuffer
  weight: number
  style: string
}

/**
 * Element to PNG, through satori and resvg. The caller converts to JPEG.
 *
 * Kept as its own function so the parity check can call exactly what the product
 * calls, rather than a copy of it that could drift.
 */
export async function renderCardPng(
  element: React.ReactNode,
  opts: { width: number; height: number; fonts: RasterFont[] },
): Promise<Uint8Array> {
  await ensureWasm()

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: opts.width,
    height: opts.height,
    debug: false,
    fonts: opts.fonts as unknown as SatoriOptions['fonts'],
    loadAdditionalAsset,
  })

  // fitTo width, exactly as @vercel/og does: the SVG is authored at the target
  // size, so this is identity, and matching it keeps any rounding identical too.
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: opts.width } })
  const rendered = resvg.render()
  const png = rendered.asPng()
  rendered.free()
  resvg.free()
  return png
}
