import sharp from 'sharp'

/**
 * A STUDIO SLIDE AS THE PUBLISHING PATH TAKES IT (car R1, the PM's 19:15 of 27 November 2026): the studio renders PNG,
 * and Instagram's publishing API takes a feed image only as JPEG
 * (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media), as the creative
 * intake's own destination check says. Each slide is re-encoded once, at its own size, flattened on white (a slide is
 * opaque; a stray transparent pixel never turns black), at quality 92 with full colour resolution so small type stays
 * crisp. Rendering, never generating (Law 6): the same pixels in another container.
 */
export async function pngToJpeg(png: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(Buffer.from(png)).flatten({ background: '#ffffff' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()
  return new Uint8Array(out)
}
