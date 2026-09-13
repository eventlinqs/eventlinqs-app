import { STRUCTURED_DATA_ENABLED } from '@/lib/seo/structured-data'

/**
 * THE ONE PLACE A JSON-LD BLOCK IS EMITTED, platform wide.
 *
 * WHAT IT REPLACES. Seventeen copies of the same three lines, across six
 * components and ten page files:
 *
 *     <script
 *       type="application/ld+json"
 *       suppressHydrationWarning
 *       dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
 *     />
 *
 * Seventeen copies is not a style complaint. It is why SEO1's reversal
 * condition ("one flag stops every block on every page type at once") could not
 * have been honoured, why `sameAs: []` shipped on every page for months without
 * anything being able to notice, and why a guard could only ever check the
 * handful of files somebody remembered to list.
 *
 * WHAT IT DOES BEYOND CENTRALISING:
 *
 *   1. Honours STRUCTURED_DATA_ENABLED, so the reversal is one line.
 *   2. Emits NOTHING for a null or undefined payload. A serialiser that decides
 *      an entity should not be described (a draft event, an empty list) returns
 *      null and the caller needs no branch of its own. Before this, deciding
 *      "no markup" meant remembering to wrap the call site in a condition, and
 *      a forgotten condition is a silent, invalid block.
 *   3. Escapes `</script>` inside the payload. JSON.stringify does not, and a
 *      string value carrying that sequence, which an organiser can type into an
 *      event description, closes the script element early and spills the rest of
 *      the payload into the page as text. The sequence cannot appear in valid
 *      JSON-LD data any other way, so replacing it with the unicode-escaped form
 *      leaves the parsed value byte-identical while making it inert.
 *
 * suppressHydrationWarning stays: the payload is server-built and the client
 * never re-derives it, so React comparing the two is noise.
 */
export function JsonLd({ payload }: { payload: unknown }) {
  if (!STRUCTURED_DATA_ENABLED) return null
  if (payload === null || payload === undefined) return null

  const json = JSON.stringify(payload).replace(/<\/(script)/gi, '<\\/$1')

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
