import { describe, expect, it } from 'vitest'
import { afterEventReport } from '@/lib/walk-in/after-event-report'

/* The locked plan of 27 October 2026, item 20: the after-festival report fills from counted numbers. */

const numbers = { views: 2300, reminders: 41, calendarAdds: 64, shares: 19, follows: 7, actionsPerView: 131 / 2300 }
const reach = {
  totals: { views: 480, clicks: 520 },
  byChannel: [
    { channel: 'whatsapp', views: 310, clicks: 330 },
    { channel: 'instagram', views: 170, clicks: 190 },
    { channel: 'email', views: 0, clicks: 0 },
  ],
}

describe('afterEventReport', () => {
  it('says each counted number in the words an organiser reads', () => {
    const r = afterEventReport(numbers, reach)
    expect(r.headline).toEqual([
      { label: 'Visits to the page', value: '2,300' },
      { label: 'Asked to be reminded', value: '41' },
      { label: 'Added it to a calendar', value: '64' },
      { label: 'Shared it', value: '19' },
      { label: 'Followed the organiser', value: '7' },
      { label: 'Arrived through a shared link', value: '480' },
    ])
    expect(r.rate).toBe('1 in 18 visitors did one of these')
    expect(r.nothingCounted).toBe(false)
  })

  it('lists the channels people arrived by, most first, and leaves off a channel nobody used', () => {
    expect(afterEventReport(numbers, reach).channels).toEqual([
      { label: 'WhatsApp', value: '310' },
      { label: 'Instagram', value: '170' },
    ])
  })

  it('says nothing was counted rather than printing a page of zeros', () => {
    const r = afterEventReport({ views: 0, reminders: 0, calendarAdds: 0, shares: 0, follows: 0, actionsPerView: null }, { totals: { views: 0, clicks: 0 }, byChannel: [] })
    expect(r.nothingCounted).toBe(true)
    expect(r.rate).toBeNull()
  })
})
