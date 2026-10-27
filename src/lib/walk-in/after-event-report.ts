import { CHANNEL_LABELS } from '@/lib/broadcast/channel-labels'

/**
 * THE AFTER-EVENT REPORT (the locked plan of 27 October 2026, item 20, AMCF:
 * "Aggregate visitor and referral report to Fred ... A one-page report after the
 * festival"; done when "the report fills from counted numbers").
 *
 * Every figure is one the platform already counts and an organiser already reads
 * on the event's own dashboard: page views, Remind me sign-ups, calendar adds,
 * shares and follows (src/lib/walk-in/organiser-numbers.ts), and the people who
 * arrived through tracked links, by channel (src/lib/broadcast/reach.ts). None is
 * estimated and none is typed. A channel nobody arrived by is left off, and a
 * report with nothing counted says so in one line rather than printing zeros.
 *
 * A leaf: no database.
 */

export type ReportNumbers = {
  views: number
  reminders: number
  calendarAdds: number
  shares: number
  follows: number
  actionsPerView: number | null
}

export type ReportReach = {
  totals: { views: number; clicks: number }
  byChannel: { channel: string; views: number; clicks: number }[]
}

export type ReportLine = { label: string; value: string }

const count = (n: number) => n.toLocaleString('en-AU')

export function afterEventReport(numbers: ReportNumbers, reach: ReportReach): {
  headline: ReportLine[]
  channels: ReportLine[]
  rate: string | null
  nothingCounted: boolean
} {
  const headline: ReportLine[] = [
    { label: 'Visits to the page', value: count(numbers.views) },
    { label: 'Asked to be reminded', value: count(numbers.reminders) },
    { label: 'Added it to a calendar', value: count(numbers.calendarAdds) },
    { label: 'Shared it', value: count(numbers.shares) },
    { label: 'Followed the organiser', value: count(numbers.follows) },
    { label: 'Arrived through a shared link', value: count(reach.totals.views) },
  ]
  const channels = [...reach.byChannel]
    .filter((c) => c.views > 0)
    .sort((a, b) => b.views - a.views)
    .map((c) => ({ label: CHANNEL_LABELS[c.channel] ?? c.channel, value: count(c.views) }))
  const rate = numbers.actionsPerView !== null && numbers.actionsPerView > 0 ? `1 in ${Math.max(1, Math.round(1 / numbers.actionsPerView))} visitors did one of these` : null
  const nothingCounted = numbers.views === 0 && reach.totals.views === 0 && numbers.reminders + numbers.calendarAdds + numbers.shares + numbers.follows === 0
  return { headline, channels, rate, nothingCounted }
}
