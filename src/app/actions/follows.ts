'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSubgenreSlug } from '@/lib/genres/data'

export type FollowableType = 'artist' | 'subgenre'

export type FollowResult = { following?: boolean; error?: string }

function isFollowableType(value: string): value is FollowableType {
  return value === 'artist' || value === 'subgenre'
}

/**
 * Verifies the target of a follow exists, so we never persist a follow that is
 * an orphan from the moment it is created. Sub-genres are validated against the
 * canonical taxonomy; artists against the artists table.
 */
async function targetExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: FollowableType,
  id: string,
): Promise<boolean> {
  if (type === 'subgenre') return isSubgenreSlug(id)
  const { data } = await supabase.from('artists').select('id').eq('id', id).maybeSingle()
  return Boolean(data)
}

/**
 * Toggle whether the current user follows an artist or a sub-genre. Returns the
 * new following state, or an error message. RLS confines every write to the
 * caller's own rows; this action adds friendly validation on top.
 */
export async function toggleFollow(type: string, id: string): Promise<FollowResult> {
  if (!isFollowableType(type)) {
    return { error: 'You can only follow artists and sub-genres.' }
  }
  const followableId = id.trim()
  if (!followableId) {
    return { error: 'Nothing to follow.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You need to be signed in to follow.' }
  }

  if (!(await targetExists(supabase, type, followableId))) {
    return { error: 'That is no longer available to follow.' }
  }

  const { data: existing } = await supabase
    .from('follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('followable_type', type)
    .eq('followable_id', followableId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('follows').delete().eq('id', existing.id)
    if (error) return { error: 'Could not unfollow.' }
    revalidatePath('/account/following')
    return { following: false }
  }

  const { error } = await supabase.from('follows').insert({
    user_id: user.id,
    followable_type: type,
    followable_id: followableId,
  })
  if (error) return { error: 'Could not follow.' }
  revalidatePath('/account/following')
  return { following: true }
}
