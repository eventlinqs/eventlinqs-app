// The auth sentinel's transport probe sends a real email that Resend counts
// against the account quota. Sent on every ten minute run it used 144 of the
// free plan's 100 a day and stopped every ticket email each night. These tests
// hold it to one send per UTC day, plus the forced drill.

import { describe, expect, test } from 'vitest'
import {
  shouldSendTransportProbe,
  TRANSPORT_PROBE_UTC_HOUR,
  TRANSPORT_PROBE_WINDOW_MINUTES,
} from '@/lib/cron/transport-probe-schedule'

// Every scheduled sentinel run in one UTC day (the cron runs every ten minutes).
function runsInOneDay(): Date[] {
  const runs: Date[] = []
  for (let minute = 0; minute < 24 * 60; minute += 10) {
    runs.push(new Date(Date.UTC(2026, 9, 2, 0, minute, 0)))
  }
  return runs
}

describe('transport probe schedule', () => {
  test('sends exactly once across the 144 scheduled runs of a UTC day', () => {
    const runs = runsInOneDay()
    expect(runs).toHaveLength(144)
    const sends = runs.filter((now) => shouldSendTransportProbe(now, false))
    expect(sends).toHaveLength(1)
    expect(sends[0].getUTCHours()).toBe(TRANSPORT_PROBE_UTC_HOUR)
    expect(sends[0].getUTCMinutes()).toBe(0)
  })

  test('a run that fires late inside the window still sends', () => {
    const late = new Date(Date.UTC(2026, 9, 2, TRANSPORT_PROBE_UTC_HOUR, TRANSPORT_PROBE_WINDOW_MINUTES - 1, 59))
    expect(shouldSendTransportProbe(late, false)).toBe(true)
  })

  test('the next run in the hour does not send a second probe', () => {
    const next = new Date(Date.UTC(2026, 9, 2, TRANSPORT_PROBE_UTC_HOUR, TRANSPORT_PROBE_WINDOW_MINUTES, 0))
    expect(shouldSendTransportProbe(next, false)).toBe(false)
  })

  test('a forced drill sends at any time', () => {
    expect(shouldSendTransportProbe(new Date(Date.UTC(2026, 9, 2, 3, 40, 0)), true)).toBe(true)
  })

  test('a whole UTC day stays far inside the 100 a day free quota', () => {
    const probeSends = runsInOneDay().filter((now) => shouldSendTransportProbe(now, false)).length
    expect(probeSends).toBeLessThanOrEqual(1)
  })
})
