/**
 * AN iPHONE HEIC IS REFUSED HONESTLY, BEFORE ANY DECODE (WINDOW 5C, 21 November 2026; Lawal, 09:02: "They were unable to
 * upload a photo ... Every function works to completion").
 *
 * WHAT WAS TRUE. The event wizard's file chooser listed image/heic and image/heif, and the pipeline's own notes said HEIC
 * was "converted to JPEG on ingest". The installed sharp (0.35.5, libvips 8.18.7, libheif 1.23.5 built with aom only)
 * reads a real iPhone HEIC's header (format 'heif', compression 'hevc') and then cannot decode a pixel of it, quoted from
 * the probe on libheif's own example file: "Support for this compression format has not been built in: HEVC (a suitable
 * decoder plugin is libde265)" (C:\dev\EVIDENCE\EL-21NOV\qa-5c\heic-sample\probe-result.json). The encode sat outside
 * the pipeline's try, so an organiser who chose a HEIC met an unhandled error, never a sentence.
 *
 * WHAT THE LEADERS DO. Humanitix's event banner takes JPEG, PNG, SVG and static GIF; Eventbrite's takes JPEG, PNG and GIF;
 * neither takes HEIC. iOS converts a HEIC to JPEG on upload, and macOS Safari does so when the site's accept list leaves
 * HEIC out (WebKit bug 267277, bugs.webkit.org/show_bug.cgi?id=267277; behaviour reported, not documented by Apple, so the
 * refusal below stands behind it for any browser that sends a HEIC anyway).
 *
 * SO: no chooser lists HEIC (IMAGE_ACCEPT_ATTR), and every pipeline that decodes a person's photograph asks this first and
 * answers in words. AVIF (heif with AV1 inside) is decoded and kept, as before.
 */
export const HEIC_REFUSAL =
  "That photo is in Apple's HEIC format, which we can't open yet. Please save it as a JPEG and upload it again. On an iPhone, Settings, Camera, Formats, Most Compatible saves new photos as JPEG."

/** True for a HEIF container this platform cannot decode: anything but AV1 inside (AVIF). */
export function isUndecodableHeif(format: string | undefined, compression: string | undefined): boolean {
  return format === 'heif' && compression !== 'av1'
}
