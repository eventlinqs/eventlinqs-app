/**
 * THE IMAGE LOCK'S TWO READS (Lawal, 21 November 2026, 20:50 to 21:40, through the PM's 21:42; migration
 * 20261121180501_stand_in_photos.sql). Every surface learns an event's picture from its stored record, never by choosing:
 *   coversClearedFor  the asked nights whose CURRENT cover has its rights on record (organiser_authorised or
 *                     separately_licensed): only these show their own photograph;
 *   standInsFor       each asked night's OWN licensed stand in (assigned once by assign_stand_in, never shared: the
 *                     photo's hash is unique in photo_assignments), with its alt words, labelled 'Illustrative photo'.
 * A night with neither, and no dealt venue photo, shows the brand panel (law 46 (f)). There is no category default.
 * Both reads are anon (security definer functions), so a prerendered page needs no service role. A failed read throws;
 * the caller says it in the log and shows less, never a guess.
 */

export type StandIn = { readonly imageUrl: string; readonly alt: string }

export type ImageLockRpc = (
  name: 'event_stand_ins_for' | 'event_covers_cleared_for',
  args: { p_events: string[] },
) => PromiseLike<{ data: unknown; error: { message: string } | null }>

const BATCH = 200

export async function standInsFor(eventIds: readonly string[], rpc: ImageLockRpc): Promise<Map<string, StandIn>> {
  const out = new Map<string, StandIn>()
  const ids = [...new Set(eventIds)]
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await rpc('event_stand_ins_for', { p_events: ids.slice(i, i + BATCH) })
    if (error) throw new Error(`the stand ins could not be read: ${error.message}`)
    for (const r of (data ?? []) as { event_id: string; image_url: string; alt: string }[]) {
      if (r.event_id && r.image_url) out.set(r.event_id, { imageUrl: r.image_url, alt: r.alt })
    }
  }
  return out
}

export async function coversClearedFor(eventIds: readonly string[], rpc: ImageLockRpc): Promise<Set<string>> {
  const out = new Set<string>()
  const ids = [...new Set(eventIds)]
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await rpc('event_covers_cleared_for', { p_events: ids.slice(i, i + BATCH) })
    if (error) throw new Error(`the cleared covers could not be read: ${error.message}`)
    for (const r of (data ?? []) as { event_id: string }[]) if (r.event_id) out.add(r.event_id)
  }
  return out
}
