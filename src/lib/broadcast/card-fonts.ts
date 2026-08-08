import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The brand type stack, loaded once per lambda for the raster artefacts.
 *
 * satori (behind next/og's ImageResponse) draws text with whatever font data
 * it is handed and falls back to a system face when handed none. The existing
 * 1200x630 link card and the A4 poster both render in a system default, which
 * is the single loudest "made by a template" signal on an artefact a promoter
 * puts in front of their audience. These four files are the real stack from
 * globals.css: Archivo for display, Hanken Grotesk for body.
 *
 * The buffers are cached at module scope, so a warm lambda pays the read once
 * and every later card render is pure composition.
 */

export type LoadedFont = {
  name: string
  data: ArrayBuffer
  weight: 500 | 600 | 700 | 800
  style: 'normal'
}

const FONT_DIR = join(process.cwd(), 'src', 'assets', 'fonts')

const FONT_FILES: { file: string; name: string; weight: LoadedFont['weight'] }[] = [
  { file: 'Archivo-Bold.ttf', name: 'Archivo', weight: 700 },
  { file: 'Archivo-ExtraBold.ttf', name: 'Archivo', weight: 800 },
  { file: 'HankenGrotesk-Medium.ttf', name: 'Hanken Grotesk', weight: 500 },
  { file: 'HankenGrotesk-SemiBold.ttf', name: 'Hanken Grotesk', weight: 600 },
]

let cached: Promise<LoadedFont[]> | null = null

async function read(): Promise<LoadedFont[]> {
  const loaded = await Promise.all(
    FONT_FILES.map(async ({ file, name, weight }) => {
      const buf = await readFile(join(FONT_DIR, file))
      // A fresh ArrayBuffer, not the pooled Node one: Buffer instances share a
      // slab, so handing satori buf.buffer hands it the whole pool.
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return { name, data, weight, style: 'normal' as const }
    }),
  )
  return loaded
}

/** Every brand font satori needs, read once and reused. */
export function loadCardFonts(): Promise<LoadedFont[]> {
  cached ??= read().catch(error => {
    // A failed read must not poison the cache for the life of the lambda.
    cached = null
    throw error
  })
  return cached
}

/** Font family names as satori expects them in a fontFamily declaration. */
export const DISPLAY_FAMILY = 'Archivo'
export const BODY_FAMILY = 'Hanken Grotesk'
