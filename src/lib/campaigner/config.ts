import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'

/**
 * THE CAMPAIGNER CONFIGURATION, read rather than typed.
 *
 * The mode is the reversal condition made operable and it is checked in ONE
 * place, here, then carried as a value. A mode checked in five places is a mode
 * that is on in four of them.
 *
 * THE FALLBACK IS `hold`, AND THAT IS THE WHOLE POINT. Every other configuration
 * reader on this platform falls back to the posture the product is already
 * taking, because the failure of not recording something is worse than the cost
 * of recording it. This one is the opposite: the failure mode here is SENDING,
 * and a campaigner that cannot read its own configuration must not decide on its
 * own that it is allowed to message people. So an unreadable configuration
 * queues everything and dispatches nothing.
 */

export type CampaignerMode = 'test' | 'live' | 'hold'

export interface CampaignerConfig {
  mode: CampaignerMode
  testDomain: string
  defaultVolumeCap: number
  unsubscribePath: string
  /** True when the row could not be read and the safe posture was assumed. */
  degraded: boolean
}

/** What the migration seeds. Used only to assert the two agree, never as a source. */
export const SEEDED_CAMPAIGNER_CONFIG = {
  mode: 'test' as CampaignerMode,
  testDomain: 'eventlinqs.test',
  defaultVolumeCap: 500,
  unsubscribePath: '/marketing/preferences',
}

const SAFE_POSTURE: CampaignerConfig = {
  mode: 'hold',
  testDomain: SEEDED_CAMPAIGNER_CONFIG.testDomain,
  defaultVolumeCap: SEEDED_CAMPAIGNER_CONFIG.defaultVolumeCap,
  unsubscribePath: SEEDED_CAMPAIGNER_CONFIG.unsubscribePath,
  degraded: true,
}

export async function readCampaignerConfig(): Promise<CampaignerConfig> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketing_campaigner_config')
      .select('mode, test_domain, default_volume_cap, unsubscribe_path')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) {
      captureException(new Error(`marketing_campaigner_config unreadable: ${error?.message ?? 'no row'}`), {
        where: 'lib/campaigner/config',
      })
      return { ...SAFE_POSTURE }
    }
    return {
      mode: data.mode as CampaignerMode,
      testDomain: data.test_domain,
      defaultVolumeCap: Number(data.default_volume_cap),
      unsubscribePath: data.unsubscribe_path,
      degraded: false,
    }
  } catch (error) {
    captureException(error, { where: 'lib/campaigner/config' })
    return { ...SAFE_POSTURE }
  }
}
