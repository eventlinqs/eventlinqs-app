import { EVENT_PAGE_OG_TYPE } from '@/lib/seo/og-type'

/**
 * `<meta property="og:type">`, EMITTED FROM THE PAGE TREE BECAUSE NEXT REFUSES
 * TO EMIT IT.
 *
 * Close-out SEO5 step 7. The full reasoning, the three citations and the crash
 * that forced this shape are in `src/lib/seo/og-type.ts`. The short version:
 * Next validates `openGraph.type` against the Open Graph global registry at
 * RENDER time and throws on anything else, taking the page with it, while the
 * protocol itself explicitly permits types outside that registry and Eventbrite
 * ships one on its own event pages.
 *
 * React hoists a `<meta>` rendered anywhere in the tree into the document head,
 * so this lands beside the tags `generateMetadata` produced. It is a server
 * component with no state and no props by design: the value comes from the one
 * constant, so there is no call site that can pass a different one.
 *
 * `metadata.other` is NOT an alternative and was tried on paper first: it
 * renders `<meta name="og:type">`, and the protocol and Meta's crawler both
 * read `property`. A tag under the wrong attribute is not a tag.
 */
export function EventOpenGraphTypeMeta() {
  return <meta property="og:type" content={EVENT_PAGE_OG_TYPE} />
}
