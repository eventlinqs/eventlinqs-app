# WI1, the Law 7 reading. 21 October 2026.

Every design point in WI1 that rests on what another platform does, or on a
published specification, is listed here with the page it came from, the date it
was read, and the line that decided it. Quotes are verbatim from the page as read
on 21 October 2026.

## How the market lists a free event that needs no ticket

**Eventbrite help centre**, "How to set up an event that doesn't require PDF
tickets (registration only)",
https://www.eventbrite.com/help/en-us/articles/250995/how-to-set-up-an-event-that-doesn-t-require-tickets-registration-only/
(no updated date on the page).

> "By default, free events are registration only."
> "This can't be changed."
> "If you're hosting an event that doesn't require tickets, turn off PDF tickets."
> "Be sure to let your attendees know they don't need to show a digital or printed ticket to enter your event."

Decided: Eventbrite has no walk-in mode. A free event is always a registration,
and "no ticket needed" is something the organiser has to write around it.
EventLinqs makes no-ticket entry a real mode with nothing to register.

**An Eventbrite listing for a free, no-RSVP event**,
https://www.eventbrite.com/e/schaumburg-garba-festival-2026-8-nights-of-free-garba-no-rsvp-needed-tickets-1995397422405

> "No RSVP. No tickets. No registration required."

The same page still carries a "Get tickets" button. Decided: this is the exact
failure the WI1 guard (`walk-in-page-sells-nothing`) forbids, a page that says
no ticket while offering one.

**Humanitix help centre**, "Event guide: Application, invite-only or
pre-screened events",
https://help.humanitix.com/en/articles/11002055-event-guide-application-invite-only-or-pre-screened-events
(dated 31 March 2025 on the page).

> "Create a free "Registration of Interest" ticket"
> "To help prevent confusion, you can turn off digital tickets being sent for the "ROI" ticket type."
> "They will still receive an email confirmation."

Decided: the nearest Humanitix has to "tell me when" is a $0 ticket used as a
register of interest. Remind me does that job with no ticket, no registration and
no confirmation email.

**TryBooking learning centre**, "Free events",
https://learn.trybooking.com/en/articles/41872-free-events ("Updated this week").

> "A free event is one that has no ticket type setup in any pricing group."
> "It can be identified by having the dollar value replaced with the text 'Free' during booking."

Decided: the market puts a word where the price goes. A walk-in card says
"Free entry" in the price position and never shows a dollar sign.

**TryBooking learning centre**, "Setting up a registration event",
https://learn.trybooking.com/en/articles/41874-setting-up-a-registration-event
("Updated over 2 weeks ago").

> "If no ticket is required for the participant to present for entry, you may wish to disable the E-tickets being issued."

Decided: everywhere in the market, no-ticket entry is a setting bolted onto a
booking. Nobody has a walk-in page, so WI1 surpasses rather than mirrors.

## Structured data

**Google Search Central**, "Event structured data",
https://developers.google.com/search/docs/appearance/structured-data/event
("Last updated 2026-09-08 UTC").

> "If the event is available without payment, fees, or service charges, set the `price` to `0`."

Decided: a walk-in event emits one Offer at price 0 in AUD.

> "If your event or ticket info is for an event that runs over several days, specify both the start and end dates of the event."
> "If there are several different performances across different days, each with individual tickets, add a separate `Event` element for each performance."

Decided: a multi-day festival such as AMCF is ONE Event with a startDate and an
endDate. One Event per dated occurrence belongs to WI2's weekly nights.

> "Don't mark business hours as events."

Decided: carried into WI2. A walk-in event is a real event, never opening hours.

> "Events must be bookable to the general public."
> "Events that require a membership, or invitation prior to purchasing the ticket or attending the event"
> "are ineligible for the event experience."

Decided: a walk-in event is open to the general public with no membership and no
invitation, so it is not the case this guideline excludes.

**schema.org**, `isAccessibleForFree`, https://schema.org/isAccessibleForFree

> "A flag to signal that the item, event, or place is accessible for free."

Expected type Boolean; the domain includes Event.

Correction to WI1-ITEM.md: Google's event page does not mention
`isAccessibleForFree` anywhere. The property is a schema.org Event property, so
WI1 emits it and cites schema.org for it.

## Unsubscribe

**ACMA**, the Spam Act rules for senders,
https://www.acma.gov.au/avoid-sending-spam (page last updated 29 November
2024), read directly on 21 October 2026. The fetch tool timed out on it three
times that afternoon; a plain HTTP read the same evening returned the page
(HTTP 200), and these lines are quoted from it:

> "every commercial message must contain an 'unsubscribe' option that:
> presents unsubscribe instructions clearly; honours a request to unsubscribe
> within 5 working days; does not require the payment of a fee; is functional
> for at least 30 days after you sent the message; does not require the person
> to give extra personal information or log in to, or create, an account to
> unsubscribe from marketing messages."

And the consumer page, https://www.acma.gov.au/dealing-with-spam (last updated
29 August 2025), read the same evening:

> "Senders cannot ask you to log into an account or provide personal
> information to unsubscribe (other than the email or phone number to be
> unsubscribed) unless you've agreed in advance."

(These replace the search extract this section first recorded, which was marked
PARTLY UNSOURCED until a direct read landed. The rules read the same.)

Decided: the Remind me stop is one click on a link. It needs no login, costs
nothing, takes effect at once rather than within five days, and keeps working
for as long as the reminder row exists, which is until 30 days after the event
ends (the retention the privacy draft proposes). The day-before reminder goes
before the event starts, and the program can only be sent while the event has
not ended (publishWalkInProgram refuses afterwards), so every stop link works
for at least 30 days after its message.

## The database

**PostgreSQL 18 documentation**, ALTER TYPE,
https://www.postgresql.org/docs/current/sql-altertype.html (PostgreSQL 18.6).

> "If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed."

Decided: the three new ledger demand actions are added in their own migration
file, `20261021000010`, before the file that names them, `20261021000020`. This
is the same split `20260906000001` made for `archived`.

## Instagram handles

**UNSOURCED.** Instagram's help page on usernames
(https://help.instagram.com/229252147229436) rendered as an empty "Help Center"
shell when read without a browser on 21 October 2026, and no search result
carried the character set or a length limit. So `organisations.instagram_handle`
is checked only for what makes it safe inside a link (no whitespace, no slash,
no `@`, no `?` or `#`), and no claim is made about Instagram's own limits.
