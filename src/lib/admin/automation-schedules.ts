/**
 * THE SCHEDULES THE AUTOMATION DASHBOARD SHOWS, held to vercel.json and the GitHub workflows by
 * tests/unit/admin/automation-schedules.test.ts: a schedule changed in one place and not the other fails the build.
 * Vercel's Cron Jobs run in UTC ("Cron jobs are always run in UTC", https://vercel.com/docs/cron-jobs, read
 * 15 November 2026); GitHub's scheduled workflows run in UTC too, so every cron here is read as UTC.
 */
import { RIDES } from '@/lib/ops/timetable'

export type Schedule = { where: 'vercel' | 'github'; path: string; cron: string }

// The runs the daily timetable's phases ride take their schedule from its one table (src/lib/ops/timetable.ts; the
// daily timetable, locked 20 November 2026), never a second copy here.

export const SCHEDULES = {
  socialPublish: { where: 'vercel', path: RIDES.social.path, cron: RIDES.social.schedule },
  socialImageSweep: { where: 'vercel', path: '/api/cron/social-image-sweep', cron: '25 * * * *' },
  outreachRun: { where: 'vercel', path: RIDES.outreach.path, cron: RIDES.outreach.schedule },
  listingOccurrences: { where: 'vercel', path: RIDES.listings.path, cron: RIDES.listings.schedule },
  collectionRun: { where: 'vercel', path: RIDES.collection.path, cron: RIDES.collection.schedule },
  // The engine page's rows (the operating model's A4): the hunt and the booking link check, held to vercel.json the same way.
  bigEventHunt: { where: 'vercel', path: '/api/cron/big-event-hunt', cron: '0 4,18 * * *' },
  bookingLinkCheck: { where: 'vercel', path: RIDES.linkCheck.path, cron: RIDES.linkCheck.schedule },
  growthScorecard: { where: 'vercel', path: '/api/cron/growth-scorecard', cron: '15 0 * * *' },
  stateReport: { where: 'github', path: '.github/workflows/state-report.yml', cron: '50 20 * * *' },
  engineVerifier: { where: 'github', path: RIDES.engineVerifier.path, cron: RIDES.engineVerifier.schedule },
  engineVerifierMorning: { where: 'github', path: '.github/workflows/engine-verifier.yml', cron: '30 4 * * *' },
} as const satisfies Record<string, Schedule>
