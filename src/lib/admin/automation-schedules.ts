/**
 * THE SCHEDULES THE AUTOMATION DASHBOARD SHOWS, held to vercel.json and the GitHub workflows by
 * tests/unit/admin/automation-schedules.test.ts: a schedule changed in one place and not the other fails the build.
 * Vercel's Cron Jobs run in UTC ("Cron jobs are always run in UTC", https://vercel.com/docs/cron-jobs, read
 * 15 November 2026); GitHub's scheduled workflows run in UTC too, so every cron here is read as UTC.
 */
export type Schedule = { where: 'vercel' | 'github'; path: string; cron: string }

export const SCHEDULES = {
  socialPublish: { where: 'vercel', path: '/api/cron/social-publish', cron: '40 * * * *' },
  socialImageSweep: { where: 'vercel', path: '/api/cron/social-image-sweep', cron: '25 * * * *' },
  outreachRun: { where: 'vercel', path: '/api/cron/outreach-run', cron: '*/15 * * * *' },
  listingOccurrences: { where: 'vercel', path: '/api/cron/listing-occurrences', cron: '10 * * * *' },
  collectionRun: { where: 'vercel', path: '/api/cron/collection-run', cron: '25 */6 * * *' },
  // The engine page's rows (the operating model's A4): the hunt and the booking link check, held to vercel.json the same way.
  bigEventHunt: { where: 'vercel', path: '/api/cron/big-event-hunt', cron: '0 4,18 * * *' },
  bookingLinkCheck: { where: 'vercel', path: '/api/cron/booking-link-check', cron: '0 18 * * *' },
  growthScorecard: { where: 'vercel', path: '/api/cron/growth-scorecard', cron: '15 0 * * *' },
  stateReport: { where: 'github', path: '.github/workflows/state-report.yml', cron: '50 20 * * *' },
  engineVerifier: { where: 'github', path: '.github/workflows/engine-verifier.yml', cron: '30 18 * * *' },
  engineVerifierMorning: { where: 'github', path: '.github/workflows/engine-verifier.yml', cron: '30 4 * * *' },
} as const satisfies Record<string, Schedule>
