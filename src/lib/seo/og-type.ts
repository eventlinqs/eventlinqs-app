/**
 * THE og:type AN EVENT PAGE DECLARES, IN ONE PLACE, BECAUSE IT IS ONE WORD.
 *
 * ============================================================================
 * THE INSTRUCTION, AND WHY IT WAS HELD BEFORE IT WAS OBEYED
 * ============================================================================
 *
 * Close-out SEO5 step 7: "set og:type to event on the event page rather than
 * website."
 *
 * That instruction was HELD for the owner for one working session, on a
 * reading that turned out to be half the evidence. The reading was: the Open
 * Graph protocol's published global object types are `music.song`,
 * `music.album`, `music.playlist`, `music.radio_station`, `video.movie`,
 * `video.episode`, `video.tv_show`, `video.other`, `article`, `book`,
 * `payment.link`, `profile` and `website`, and `event` is not among them
 * (https://ogp.me/, fetched 14 September 2026). True, and it is not the whole
 * page.
 *
 * ============================================================================
 * WHAT THE SECOND READ FOUND, AND WHY IT REVERSES THE HOLD
 * ============================================================================
 *
 * 1. THE PROTOCOL EXPLICITLY PERMITS TYPES OUTSIDE THAT LIST. The same page
 *    says, verbatim: "All other objects in the type system are CURIEs of the
 *    form ... <meta property="og:type" content="my_namespace:my_type" />", and
 *    "The og:type values for a namespace are always prefixed with the namespace
 *    and then a period. This is to reduce confusion with user-defined
 *    namespaced types which always have colons in them."
 *    (https://ogp.me/, fetched 14 September 2026.) The global list is a
 *    registry of agreed types, NOT a closed vocabulary, so publishing a type
 *    outside it is a documented use of the protocol rather than a violation of
 *    it.
 *
 * 2. META DOES NOT PUBLISH A COMPETING LIST; IT POINTS AT THAT ONE. Its own
 *    webmaster guide says of `og:type`, "The type of media of your content.
 *    This tag impacts how your content shows up in Feed", and for the values it
 *    says "Find the full list of object types in Object Types Reference",
 *    linking to `ogp.me/#types`. It also states "If you don't specify a type,
 *    the default is website", which is the behaviour this page is trying to
 *    stop being lumped in with.
 *    (https://developers.facebook.com/docs/sharing/webmasters, fetched
 *    14 September 2026.)
 *
 * 3. THE MARKET LEADER ON THIS EXACT PAGE TYPE ALREADY DOES IT, and that is the
 *    evidence the first read was missing. Eventbrite's live event page emits
 *
 *        <meta property="og:type" content="events.event" .../>
 *
 *    measured on https://www.eventbrite.com.au/e/sandbox-music-festival-melbourne-tickets-1991427952614
 *    on 14 September 2026 by reading the served HTML. Its DISCOVERY page emits
 *    `website` on the same day, so the distinction is deliberate on their side
 *    rather than an accident of one template. Ticketmaster AU and DICE both
 *    emit `website` on their home pages, which is correct for a home page and
 *    says nothing about their event pages.
 *
 * So the owner's instruction is not only his to give, it is backed by the
 * practice of the platform this product is built to surpass. It is obeyed.
 *
 * ============================================================================
 * WHY `event` AND NOT `events.event`
 * ============================================================================
 *
 * The owner wrote `event`. Eventbrite ships `events.event`. Neither is in the
 * global registry, so neither is more "valid" than the other; the difference is
 * whose word it is. The instruction is explicit and literal, so the literal
 * value is used, and the Eventbrite measurement is recorded in REVIEW-QUEUE-C.md
 * as the one alternative he may prefer. Changing it is one word HERE and
 * nowhere else, which is the entire reason this constant exists rather than the
 * string being typed into `generateMetadata`.
 *
 * ============================================================================
 * WHY THE TAG IS NOT EMITTED THROUGH `generateMetadata`, AND HOW THAT WAS FOUND
 * ============================================================================
 *
 * The obvious implementation is `openGraph: { type: 'event' as never }`. It
 * compiles once the cast silences the union, every unit test passes, typecheck
 * passes, and THE EVENT PAGE IS COMPLETELY BROKEN. Next does not merely type
 * the value, it switches on it at render time and the default arm THROWS:
 *
 *     Error: Invalid OpenGraph type: event
 *     Switched to client rendering because the server rendering errored
 *
 * (`node_modules/next/dist/lib/metadata/metadata.js`, the `switch (ogType)`
 * whose `default` throws.) The page rendered "We hit a snag loading this page"
 * at every viewport. NOTHING IN THE REPOSITORY CAUGHT IT: the guards were
 * green, the suite was green, the type checker was green, and the only thing
 * that found it was driving the running page with a browser. That is the whole
 * argument for verify-first written out in one afternoon.
 *
 * The same file shows the way through: the tag is emitted only `if ('type' in
 * og)`, so an `openGraph` block with NO `type` key produces no `og:type` at all
 * and leaves the field clear for the page to emit its own.
 *
 * `metadata.other` was considered and rejected: it renders `<meta name="...">`,
 * and the Open Graph protocol and Meta's crawler both read `property`. A tag
 * under the wrong attribute is not a tag.
 *
 * So `eventOpenGraph` OMITS the key, and `<OpenGraphTypeMeta />`
 * (`src/components/seo/og-type-meta.tsx`) renders the real tag from the page
 * tree, where React hoists it into the head.
 *
 * WHAT THIS DOES NOT BUY. `og:type` is not what Google reads to decide a page
 * is an event: that is the Schema.org `Event` block this page already emits,
 * corrected under close-out SEO1 v2. This constant is about the SHARE CARD and
 * about parity with the leader, and the structured data is untouched by it.
 */
import type { Metadata } from 'next'

/**
 * The one value. Change this word and every event page changes with it.
 *
 * Typed as `string` deliberately: typing it as Next's union would defeat the
 * point, since the whole reason the constant exists is that the value sits
 * outside that union.
 */
export const EVENT_PAGE_OG_TYPE: string = 'event'

/** What a page with no event-specific type declares. Next's default too. */
export const DEFAULT_OG_TYPE = 'website'

type OpenGraph = NonNullable<Metadata['openGraph']>

/**
 * An event page's Open Graph block, DELIBERATELY WITHOUT A `type` KEY.
 *
 * The absence is the feature. Next emits `og:type` only `if ('type' in og)`, so
 * omitting it leaves exactly one thing free to declare the type: the page's own
 * `<OpenGraphTypeMeta />`. Setting it here instead throws at render time and
 * takes the whole page down, which is recorded in full at the top of this file.
 *
 * It stays a function rather than becoming nothing, because the ABSENCE is what
 * has to be preserved and a function is something a guard and a test can point
 * at. `tests/unit/seo/og-type.test.ts` asserts the key is missing and that the
 * event page composes through here.
 */
export function eventOpenGraph(block: Omit<OpenGraph, 'type'>): OpenGraph {
  return { ...block } as OpenGraph
}
