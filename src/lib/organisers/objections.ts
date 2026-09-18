/**
 * THE FIVE THINGS A STRANGER SAYS BACK, answered on the page they were sent to.
 *
 * Close-out OL1 step 4. From 12 September 2026 every outreach message points a
 * stranger at /organisers, and the objections the founder answers in a DM were
 * answered nowhere on it. These are the recruitment playbook's own answers
 * (docs/marketing/eventlinqs-organiser-recruitment-playbook.md, "Objection
 * responses"), with two corrections and two additions, each recorded here
 * rather than made silently.
 *
 * CORRECTION 1: the playbook's answer to "nobody is on your platform" says the
 * launch model concentrates buyers "in your city first". That was true of the
 * two-city launch and stopped being true on 23 August 2026, when the founder
 * opened the platform nationwide from day one. Publishing it would be a claim
 * the product no longer makes.
 *
 * CORRECTION 2: the playbook answers "my people are elsewhere" by naming the
 * platform they are on. Public copy never names another platform (positioning
 * lock, 7 September 2026), and the answer does not need it: the co-listing
 * offer works whoever they are with.
 *
 * ADDITIONS: "I have no time" and "what if you shut down" are in close-out OL1
 * and not in the pack, so they are answered from what the product actually
 * does. The data-ownership answer is checked before it is published: the
 * attendee export is real and reachable at
 * /dashboard/events/[id]/attendees/export in CSV and Excel. Never claim it
 * without it.
 *
 * NO NUMBER IS TYPED HERE. The fee, the founding terms and the payout window
 * are published elsewhere on the same page from configuration; these answers
 * point at the mechanism rather than restating a figure that would then have
 * two sources.
 */
export interface OrganiserObjection {
  q: string
  a: string
}

export const ORGANISER_OBJECTIONS: OrganiserObjection[] = [
  {
    q: 'Will I actually get paid?',
    a: 'Payments run on Stripe. The money moves through a Stripe account in your own name, connected to your own bank account, and EventLinqs never holds it anywhere you cannot see it. Your payout lands within five business days of your event ending, and the dashboard shows you the amount and the date before the event has even happened. If you want to walk through it before you commit, the founder will do that on a call.',
  },
  {
    q: 'Nobody knows you yet. Why would I list here?',
    a: 'That is exactly why the first organisers get the terms they get. And you are not asked to move your audience: you keep selling through your own channels, your own list and your own socials, and the ticket link simply costs you less. What you get on top is the discovery feed and the push alerts, which put your event in front of people who are already looking for something to go to that weekend.',
  },
  {
    q: 'I have no time to set up another platform.',
    a: 'Describe your event in a sentence and the draft builds itself: the title, the summary, the times, the tiers. You correct what is wrong and publish. And for the first organisers it is not even that: the founder sets your first event up with you on a 20 minute call, from whatever you already have, and hands you back a live page to approve.',
  },
  {
    q: 'My people buy tickets somewhere else.',
    a: 'You do not have to move them. List in both places, keep most of your allocation where it already is, and put a slice of tickets here as a live test. Then compare the fees, the buying experience and who actually turned up, and decide with real numbers rather than a pitch.',
  },
  {
    q: 'What if you shut down?',
    a: 'Then you still have your audience, because it was never ours to keep. Your attendee list is yours and you can export it as a spreadsheet at any time, from the event dashboard, without asking anyone. Your money is in your own Stripe account rather than in a balance we control. Nothing about listing here makes you dependent on us still being here next year, and that is deliberate.',
  },
]
