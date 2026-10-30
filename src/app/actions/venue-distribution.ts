'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributionDeps, setVenueDistribution, type DistributionAnswer } from '@/lib/venues/venue-distribution'

/**
 * A claimed venue's answer on /dashboard/organisation/media: where EventLinqs may carry its nights beyond its own pages
 * (src/lib/venues/venue-distribution.ts, D3 (6)). Signed in always; the database checks the person is one of the
 * venue's own people, so nothing here trusts an id from the form. Both boxes are read every time, so an unticked box
 * is a no, never left as it was. Not rate limited: it stores no file and sends nothing, as a photograph's withdrawal.
 */

export type VenueDistributionState = DistributionAnswer | null

const Id = z.string().uuid()

export async function setVenueDistributionAction(_: VenueDistributionState, formData: FormData): Promise<VenueDistributionState> {
  const venueId = Id.safeParse(formData.get('venueId'))
  if (!venueId.success) return { state: 'refused', reason: 'Choose your venue.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { state: 'refused', reason: 'Sign in to choose where your nights are shared.' }
  const answer = await setVenueDistribution(
    user.id,
    venueId.data,
    { ourPosts: formData.get('ourPosts') === 'on', weeklyRoundup: formData.get('weeklyRoundup') === 'on' },
    distributionDeps(createAdminClient()),
  )
  if (answer.state === 'done') revalidatePath('/dashboard/organisation/media')
  return answer
}
