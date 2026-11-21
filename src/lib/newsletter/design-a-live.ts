/**
 * WHETHER SUBSCRIBERS RECEIVE DESIGN A (law 46, Lawal's design A of 21 November 2026; the newsletter brief's stage 2: "a
 * send to subscribers keeps the built digest until the footer's pages answer on production").
 *
 * false, and why, said here so it is not mistaken for forgetting (NL-2, 21 November 2026, 15:20):
 * 1. Design A's links (/newsletter/city, /newsletter/refer, the web copy) exist only from train AT; they must read 200 on
 *    production before any subscriber is sent one (law 5).
 * 2. Design A does not pass the platform's letter rule that every email from this route meets
 *    (src/lib/email/letter.ts letterProblems, held by tests/unit/email/every-letter-greets.test.ts): its first line is
 *    'View in browser' and the masthead, not 'Hi there,', and it ends on the footer, not 'Kind regards,' then
 *    'The EventLinqs team' (read by rendering it, 15:20). The built digest passes. Whether the newsletter, an editorial,
 *    takes the letter's greeting or is ruled apart from it is a ruling on Lawal's locked design, never this file's.
 * ANSWERED (the PM's 15:35 of 21 November 2026, ruling 1): the newsletter is a broadcast, not a letter, exempt from the
 * letter's greeting and sign off and held instead by the named broadcast rule (src/lib/email/broadcast.ts, its test
 * tests/unit/newsletter/broadcast-rule.test.ts), which every design A edition passes before it is sent; the links are
 * train AT's pages, read 200 on production before the first Wednesday edition. So true.
 * The subscriber send draws design A for each reader with their own
 * unsubscribe and Manage links (src/app/api/cron/weekly-digest/route.ts, subscriberLetter).
 */
export const NEWSLETTER_DESIGN_A_LIVE = true
