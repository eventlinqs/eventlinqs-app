import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'

/**
 * REAL TEXT WIDTHS FOR THE CARD RENDERER.
 *
 * satori draws the string it is given and does not report back how wide the
 * result was, so anything that has to fit inside a fixed box has to be measured
 * before it is drawn. The ticket bar is that case: one line, a fixed gold bar,
 * and a QR code immediately beside it with nowhere to spill.
 *
 * This measures with the same Hanken Grotesk SemiBold file the card is drawn
 * with, so the number is the glyphs rather than an average. The previous
 * estimate, characters times 0.52, was wrong in both directions at once: it
 * over-stated the width of ordinary text by about 11 per cent, shrinking type
 * that had room, and it under-stated nothing badly enough to stop a long line
 * being drawn straight out of its bar.
 *
 * Cached at module scope. A warm lambda parses the font once.
 */

const FONT_DIR = join(process.cwd(), 'src', 'assets', 'fonts')
const BODY_PATH = join(FONT_DIR, 'HankenGrotesk-SemiBold.ttf')
/**
 * The DISPLAY face, and specifically the ExtraBold cut, because that is the
 * weight the card title is drawn at (`fontWeight: 800` in social-cards.tsx). A
 * measurement taken from the Bold cut would run narrow and the fitted headline
 * would be a size too large for its box.
 */
const DISPLAY_PATH = join(FONT_DIR, 'Archivo-ExtraBold.ttf')

type Measurer = (text: string, fontSize: number) => number

let cachedBody: Promise<Measurer> | null = null
let cachedDisplay: Promise<Measurer> | null = null

async function build(path: string): Promise<Measurer> {
  const bytes = await readFile(path)
  const font = fontkit.create(bytes) as unknown as {
    unitsPerEm: number
    layout: (text: string) => { advanceWidth: number }
  }
  return (text, fontSize) => (font.layout(text).advanceWidth / font.unitsPerEm) * fontSize
}

/**
 * A width measurer for the body face. Falls back to the old per-character
 * estimate if the font cannot be read, because an artefact drawn with a rough
 * measurement still beats no artefact at all, and the fit function fits
 * against whatever measurer it is handed.
 */
export async function bodyTextMeasurer(): Promise<Measurer> {
  cachedBody ??= build(BODY_PATH).catch(error => {
    cachedBody = null
    console.warn('[card-metrics] font read failed, falling back to estimate:', error)
    return (text: string, fontSize: number) => text.length * fontSize * 0.52
  })
  return cachedBody
}

/**
 * A width measurer for the display face, used to fit the headline of the
 * artwork-free composition to the frame.
 *
 * The typographic card computes its own line breaks and draws each line as its
 * own element, so satori is never asked to wrap. That means this measurement is
 * not an estimate the renderer might disagree with: it decides the breaks, and
 * the renderer draws exactly those. The fallback ratio is higher than the body
 * one because Archivo ExtraBold is a wider face than Hanken Grotesk SemiBold.
 */
export async function displayTextMeasurer(): Promise<Measurer> {
  cachedDisplay ??= build(DISPLAY_PATH).catch(error => {
    cachedDisplay = null
    console.warn('[card-metrics] display font read failed, falling back to estimate:', error)
    return (text: string, fontSize: number) => text.length * fontSize * 0.58
  })
  return cachedDisplay
}
