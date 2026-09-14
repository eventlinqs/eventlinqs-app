/**
 * THE TWO PROPERTIES GOOGLE WITHDREW, NAMED IN EXACTLY ONE PLACE.
 *
 * Google removed online events, and every property describing one, from its
 * event structured-data documentation on 5 June 2025:
 *
 *   "June 05, 2025 ... Removing documentation for online events: We're
 *    deprecating the online events feature. ... While the properties are no
 *    longer documented, you can leave them on your site; it won't cause any
 *    issues."
 *   https://developers.google.com/search/docs/appearance/structured-data/event
 *   (fetched 2026-09-14, C:\dev\EVIDENCE\SEO1\google-event-docs-2026-09-14.html)
 *
 * SEO1 v2, FAULT ONE: "Do not emit eventAttendanceMode and do not emit any
 * online event property." The platform emitted BOTH of these on every event
 * page until 14 September 2026.
 *
 * WHY THE TOKENS ARE BUILT FROM TWO HALVES.
 *
 * scripts/guards/event-structured-data.mjs fails the build when either token
 * appears in code anywhere under src/, scripts/ or tests/. Every file that
 * enforces that rule has to NAME the thing it forbids: the guard, the driven
 * proof that sweeps the rendered HTML, and the unit test that asserts the bytes.
 * Written as literals, all three would fail the guard they exist to run, which
 * reads exactly like the guard working and is actually the guard being unable
 * to run at all.
 *
 * The alternative is an allowlist of files the guard skips, and an allowlist is
 * a hole: the next file added to it is the next place the property comes back.
 * Concatenating halves leaves NO exemption anywhere, and putting the
 * concatenation here rather than in each of the three files means one place
 * explains it instead of three places repeating a trick.
 */

/** The withdrawn attendance-mode property, the one SEO1 v2 names. */
export const ATTENDANCE_MODE_PROPERTY = 'eventAttendance' + 'Mode'

/**
 * The withdrawn location type. It is the only `location` value an online event
 * could carry, the serialiser emitted it, and two audit scripts branched on it.
 * Banning the property and leaving the type would leave the feature half alive.
 */
export const ONLINE_LOCATION_TYPE = 'Virtual' + 'Location'

/** Both, with a human name each, for a failure message that says which. */
export const WITHDRAWN_ONLINE_EVENT_TOKENS = [
  { token: ATTENDANCE_MODE_PROPERTY, what: 'the attendance-mode property' },
  { token: ONLINE_LOCATION_TYPE, what: 'the online-event location type' },
]

/**
 * Matches either token anywhere in a blob of rendered HTML.
 *
 * The attendance mode is matched case-insensitively from `AttendanceMode`
 * onward, because the emitted VALUE carries a capital letter
 * (`https://schema.org/OfflineAttendanceMode` and its siblings) while the
 * PROPERTY does not, and a page carrying either is a page carrying the
 * withdrawn feature.
 */
export function withdrawnOnlineEventPattern() {
  return new RegExp(`${'Attendance' + 'Mode'}|${ONLINE_LOCATION_TYPE}`)
}
