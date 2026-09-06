import 'server-only'
import type { ReactNode } from 'react'
import { renderCardPng } from '@/lib/broadcast/card-raster'
import { loadCardFonts, DISPLAY_FAMILY, BODY_FAMILY } from '@/lib/broadcast/card-fonts'
import { captureException } from '@/lib/observability/sentry'

/**
 * EVERY SHARE IMAGE THIS PLATFORM DRAWS AT REQUEST TIME COMES OUT OF HERE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Measured 6 September 2026 (close-out C3), not assumed.
 *
 * The per-event share card, the one artefact whose entire job is to be seen,
 * did not merely fail on a local production server. It DROPPED THE CONNECTION.
 *
 *     GET /events/<slug>/opengraph-image     code=000  bytes=0
 *     GET /api/og/event/<slug>               code=000  bytes=0
 *
 * and the server said, once per request:
 *
 *     Error: failed to pipe response
 *       [cause]: Error: Input buffer contains unsupported image format
 *
 * That cause is libvips, through sharp, refusing the SVG that satori produced.
 * It is the SAME fault that cost eighteen Launch Kit artefacts on 29 August and
 * is written out at length in card-raster.ts: `next/og` rasterises by handing
 * satori's SVG straight to sharp, its getSharp() is unconditional, and its resvg
 * fallback is reached only when the sharp IMPORT throws. sharp is a real
 * dependency of the upload pipeline, so inside this server it always imports,
 * and inside this server its libvips has no librsvg to decode SVG with. The
 * identical sharp in a plain Node process converts the same buffer without
 * complaint, which is precisely why nothing local ever caught it.
 *
 * The cards were fixed then by giving this repository its own rasteriser. The
 * metadata images were not, because nothing had driven one. C3 drove one.
 *
 * ---------------------------------------------------------------------------
 * SO THE RULE IS: ONE RASTERISER, EVERYWHERE, AND IT IS OURS.
 *
 * Every image route in src/app renders through renderCardPng (satori plus
 * resvg-wasm) exactly as the eighteen Launch Kit cards do. resvg-wasm has no
 * native module, no DLL search path and no librsvg to go missing, so it behaves
 * identically in local dev, in `next start`, in vitest, on a Vercel preview and
 * in production. A rasteriser that works in one runtime and not another is a
 * rasteriser that differs between local, preview and production, and that
 * difference is the whole defect. scripts/guards/og-single-rasteriser.mjs fails
 * the build if `next/og` comes back anywhere under src.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BYTES ARE BUFFERED RATHER THAN STREAMED, which is the second half of
 * the repair and matters more than it looks.
 *
 * ImageResponse streams. The status line and the headers are already on the
 * wire by the time the renderer throws, so the only thing left for the server to
 * do is hang up. The caller gets no status code, no body and no message, which
 * is why this failed as "socket hang up" rather than as an error anyone could
 * read. Buffering the PNG means every failure happens BEFORE a single byte of
 * response is committed, so a broken render is a real HTTP status with a real
 * body, and a fallback can still be drawn instead. A share card that cannot be
 * drawn must degrade to a designed card, never to a dead socket.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TYPE IS THE BRAND TYPE NOW.
 *
 * satori draws with whatever font data it is handed and falls back to a system
 * face when handed none, which is what every one of these images did. card-fonts
 * calls that "the single loudest 'made by a template' signal on an artefact a
 * promoter puts in front of their audience", and it was describing this exact
 * set of images. They are handed the real stack from globals.css now: Archivo
 * for display, Hanken Grotesk for body, the same buffers the Launch Kit cards
 * draw with.
 */

/*
 * The families satori will find in the buffers loadCardFonts returns, re-exported
 * from the module that reads the files rather than restated here. A family name
 * written twice is a family name that can disagree with the font actually
 * loaded, and satori answers that disagreement silently by drawing in whatever
 * it was handed first.
 */
export const OG_DISPLAY_FAMILY = DISPLAY_FAMILY
export const OG_BODY_FAMILY = BODY_FAMILY

export interface OgRenderOptions {
  width: number
  height: number
  /**
   * Where a failure came from, for the log and for Sentry. Named by the caller
   * because a stack through a shared renderer names this file, not the card.
   */
  where: string
  /** Extra response headers, for example the CDN cache policy on a share card. */
  headers?: Record<string, string>
  /**
   * The designed card to draw if the main element cannot be drawn. Optional
   * because an app icon has nothing meaningful to degrade to; a share card
   * always does, and passing it is what keeps a broken preview branded.
   */
  fallback?: ReactNode
}

function pngResponse(png: Uint8Array, headers: Record<string, string> | undefined): Response {
  // A fresh ArrayBuffer, never the pooled one behind a Node Buffer: handing the
  // response the pool would hand it every other buffer sharing that slab.
  const body = new Uint8Array(png)
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-length': String(body.byteLength),
      ...headers,
    },
  })
}

/**
 * Draw an element to a PNG response through the platform rasteriser.
 *
 * Never throws and never returns a partial body: the caller gets a 200 with a
 * complete PNG, or a 200 with the designed fallback card, or a 500 with a body
 * that says which artefact failed and why.
 */
export async function renderOgResponse(
  element: ReactNode,
  opts: OgRenderOptions,
): Promise<Response> {
  const fonts = await loadCardFonts().catch(error => {
    // A missing font file is a build/trace fault, not a per-request one, and it
    // must be loud. It is reported here and the render is attempted without it
    // only to the extent satori can, which is not at all, so it falls through to
    // the fallback path below with an accurate message.
    captureException(error, { where: `${opts.where}:fonts` })
    console.error('[og] font load failed', {
      where: opts.where,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (fonts) {
    try {
      const png = await renderCardPng(element, { width: opts.width, height: opts.height, fonts })
      return pngResponse(png, opts.headers)
    } catch (error) {
      captureException(error, { where: `${opts.where}:render` })
      console.error('[og] render failed', {
        where: opts.where,
        width: opts.width,
        height: opts.height,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    if (opts.fallback !== undefined) {
      try {
        const png = await renderCardPng(opts.fallback, {
          width: opts.width,
          height: opts.height,
          fonts,
        })
        return pngResponse(png, opts.headers)
      } catch (error) {
        captureException(error, { where: `${opts.where}:fallback` })
        console.error('[og] fallback render failed', {
          where: opts.where,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /*
   * The last resort, and it is deliberately a status code rather than a picture.
   * Nothing here can draw, so inventing a picture would mean shipping a second
   * rasteriser to cover for the first, which is how this platform ended up with
   * two of them. A 500 naming the artefact is diagnosable; a dropped socket,
   * which is what this route did before today, is not.
   */
  return new Response(
    JSON.stringify({ ok: false, error: 'og_render_failed', where: opts.where }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  )
}
