import type { DayHours } from '@/lib/walk-in/guide'

type Source = 'organiser' | 'eventlinqs'

/**
 * The hours of each day, as locked design A sets them in the panel and in the
 * phone's hours card: "Fri 20  10am to 10pm". An opening that is not confirmed
 * shows the listing's own words in the gold highlight the board draws for it.
 */
export function HoursList({
  hours,
  source = 'organiser',
}: {
  hours: Array<{ date: string; label: string } & DayHours>
  source?: Source
}) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[15px] text-ink-900 lg:gap-x-4 lg:gap-y-2">
      {hours.map((h) => (
        <div key={h.date} className="contents">
          <dt className="font-bold">{h.label}</dt>
          <dd className="m-0">
            <HoursText hours={h} source={source} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * "6:30pm to 10pm", or "From 6:30pm" when the source gives no finish (WI2, the
 * 21 October 22:25 answer 1): an end is never made up.
 */
export function HoursText({ hours, source = 'organiser' }: { hours: DayHours; source?: Source }) {
  const opening = hours.opens ? (
    hours.opens
  ) : (
    <span data-text-source={source} className="rounded bg-[var(--color-gold-100)] px-1.5 py-px">
      {hours.unconfirmed}
    </span>
  )
  if (hours.closes === null) return <>From {opening}</>
  return (
    <>
      {opening} to {hours.closes}
    </>
  )
}
