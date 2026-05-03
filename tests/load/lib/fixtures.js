// Test data shared across VUs via SharedArray. SharedArray allocates
// once on the runner and exposes a read-only view to every VU - the
// alternative (per-VU array copies) burns memory at high VU counts.
//
// Event slugs are sampled at run time. The list below is a launch-day
// snapshot of slugs known to render on /events/[slug] without auth.
// Update via tests/load/scripts/refresh-event-slugs.mjs (Node, not k6)
// against the preview env before each Phase 2 run.

import { SharedArray } from 'k6/data'

// Lazy: instantiated once per script load. Reads from
// tests/load/fixtures/event-slugs.json which is generated, never edited.
export const eventSlugs = new SharedArray('eventSlugs', function () {
  // k6 cannot directly read JSON in the runner without `open()`. Goja's
  // open() reads a file relative to the script. Falls back to a small
  // hand-curated set if the file is missing so the script still runs
  // against a fresh preview without manual fixture refresh.
  try {
    const raw = open('../fixtures/event-slugs.json')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch (_e) {
    // file missing or unparseable; use fallback
  }
  return [
    'amapiano-grand-summer-night',
    'bollywood-festival-melbourne',
    'caribbean-soul-sundays',
    'comedy-night-at-the-old-fitz',
    'filipino-food-and-music-fest',
    'kpop-takeover-sydney',
    'latin-fiesta-friday',
    'reggae-on-the-river',
    'spanish-tapas-and-flamenco',
    'west-african-cultural-week',
  ]
})

// Cities used in /events?city= queries. v1 launch markets only (AU).
export const cities = new SharedArray('cities', function () {
  return [
    'sydney',
    'melbourne',
    'brisbane',
    'perth',
    'adelaide',
    'canberra',
    'gold-coast',
    'newcastle',
    'wollongong',
    'geelong',
  ]
})

// Pre-seeded test users. Each entry is { email, sessionCookie }. Loaded
// from tests/load/fixtures/test-users.json. The session cookie is
// captured manually via a one-shot login script and pasted into the
// fixture file - load tests do not exercise the OTP flow because Resend
// would burn quota and the SMTP path is exercised in Phase 1 B.
export const testUsers = new SharedArray('testUsers', function () {
  try {
    const raw = open('../fixtures/test-users.json')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch (_e) {
    return []
  }
  return []
})

// Pre-seeded organiser sessions for Profile 3.
export const testOrganisers = new SharedArray('testOrganisers', function () {
  try {
    const raw = open('../fixtures/test-organisers.json')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch (_e) {
    return []
  }
  return []
})
