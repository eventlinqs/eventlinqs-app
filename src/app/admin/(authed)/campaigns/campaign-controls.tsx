'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveSegmentAction, runCampaignAction, type CampaignActionResult } from './actions'

interface CampaignControlsProps {
  campaigns: { id: string; reference: string; name: string; eventTitle: string }[]
  channels: { code: string; displayName: string }[]
  selectedCampaignId: string
  selectedChannelCode: string
  approved: boolean
  canRender: boolean
}

/**
 * Pick the campaign and the channel, approve the segment, run the pacing.
 *
 * THE CAMPAIGN AND CHANNEL THE PAGE IS ABOUT ARE WHAT THE BUTTONS ACT ON. They
 * travel as hidden fields from the address, and the two pickers are navigators.
 * The matches screen learned this the hard way: a picker that lists a subset
 * while the address can name anything will silently submit nothing and answer
 * "pick one first" about the very thing the page is describing.
 *
 * EVERY OUTCOME IS ON SCREEN: pending while it runs, the counts when it lands,
 * and the refusal in words when the segment is not approved, the mode is hold,
 * or nothing can render.
 */
export function CampaignControls({
  campaigns,
  channels,
  selectedCampaignId,
  selectedChannelCode,
  approved,
  canRender,
}: CampaignControlsProps) {
  const router = useRouter()
  const [campaignId, setCampaignId] = useState(selectedCampaignId)
  const [channelCode, setChannelCode] = useState(selectedChannelCode)
  const [approveState, approveAction, approving] = useActionState<CampaignActionResult | null, FormData>(
    approveSegmentAction,
    null,
  )
  const [runState, runAction, running] = useActionState<CampaignActionResult | null, FormData>(
    runCampaignAction,
    null,
  )

  const go = (nextCampaign: string, nextChannel: string) => {
    const params = new URLSearchParams()
    if (nextCampaign) params.set('campaign', nextCampaign)
    if (nextChannel) params.set('channel', nextChannel)
    router.push(params.toString() ? `/admin/campaigns?${params.toString()}` : '/admin/campaigns')
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="campaign_nav" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
            Campaign
          </label>
          <select
            id="campaign_nav"
            value={campaignId}
            onChange={e => {
              setCampaignId(e.target.value)
              go(e.target.value, channelCode)
            }}
            className="mt-2 h-11 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
          >
            <option value="">Choose a campaign</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.eventTitle})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="channel_nav" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
            Channel
          </label>
          <select
            id="channel_nav"
            value={channelCode}
            onChange={e => {
              setChannelCode(e.target.value)
              go(campaignId, e.target.value)
            }}
            className="mt-2 h-11 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
          >
            {channels.map(c => (
              <option key={c.code} value={c.code}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <form action={approveAction}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <input type="hidden" name="channel_code" value={channelCode} />
          <button
            type="submit"
            disabled={approving || !campaignId || !canRender || approved}
            className="min-h-[44px] rounded-lg bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[#0A1628] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approving ? 'Approving' : approved ? 'Segment approved' : 'Approve this segment'}
          </button>
        </form>
        <form action={runAction}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <input type="hidden" name="channel_code" value={channelCode} />
          <button
            type="submit"
            disabled={running || !campaignId}
            className="min-h-[44px] rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running' : 'Run the pacing once'}
          </button>
        </form>
      </div>

      {approveState && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            approveState.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'
          }`}
        >
          {approveState.message}
        </p>
      )}
      {runState && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            runState.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'
          }`}
        >
          {runState.message}
        </p>
      )}
    </div>
  )
}
