/**
 * The thin renderer for the Event payload. Everything that decides WHAT is
 * emitted lives in src/lib/seo/event-schema.ts, which is pure and has no JSX so
 * a guard can execute it; this file only puts the result on the page.
 */
import type { Event } from '@/types/database'
import { JsonLd } from '@/components/seo/json-ld'
import { buildEventSchemaPayload, type EventSchemaProps } from '@/lib/seo/event-schema'

export { buildEventSchemaPayload }

export function EventSchemaJsonLd(
  props: EventSchemaProps & { event: Event & { category?: { slug: string | null; name: string } | null } },
) {
  return <JsonLd payload={buildEventSchemaPayload(props)} />
}
