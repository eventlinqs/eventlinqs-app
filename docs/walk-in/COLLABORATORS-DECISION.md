# Collaborators: a venue or a performer joins a listing and shares its kit

The locked plan of 27 October 2026, Sprint 3, item 15: "Collaborators: a venue or
performer joins a listing and shares its kit". Done when "A collaborator shows on
the page and gets tracked links". Window 2, 27 October 2026.

## What already exists (read on main 4576d17f)

- **A performer already collaborates.** An organiser adds an artist to the
  lineup (`event_artists`, `/dashboard/events/[id]/lineup`); the artist who owns
  the profile (`artists.owner_user_id`) opens `/artist/dashboard`, which mints
  share links tagged with the artist (`share_links.artist_id`,
  `src/lib/broadcast/share-links.ts`), and every view, click and sale through
  them is attributed to the artist (`fetchEventArtistAttribution`). What is
  missing for a performer is only the free walk-in page, which draws no lineup.
- **A venue does not.** A venue belongs to an organisation
  (`venues.organisation_id`) and an event names its venue (`events.venue_id`),
  but when a promoter's night is at somebody else's venue, the venue has no way
  to join it, no place on its page and no links of its own.

## Law 7, read 27 October 2026

- Humanitix, https://help.humanitix.com/en/articles/8892751-how-to-share-event-access-with-another-user-or-team
  (dated 21 January 2026): "You can share access to events with other Humanitix
  users, allowing them to help manage and build your event." The page says
  nothing of a co-host's own links or what their sharing brought.
- Eventbrite's lineup help (support.eventbrite.com, article 34824489602706)
  answered 403 to a fetch: UNSOURCED, so nothing here rests on it.

## Criteria, written before the candidates

1. The venue shows on the event's page as a collaborator, by its own name, linked
   to its own venue page.
2. It gets tracked links of its own, and what they bring is counted, never
   estimated, through the one spine (`share_links`, `share_link_events`).
3. No second store beside that spine, and no new way for anybody to edit an event
   they do not organise.
4. Consent both ways: the organiser asks, the venue's own people accept.

## Three ways

- **A, chosen. A collaborator row.** `event_collaborators` (event, the venue's
  organisation, status invited or joined), asked by the event's organiser and
  joined by a person who may act for the venue's organisation; a joined venue
  shows on the page and mints links tagged with its row
  (`share_links.collaborator_id`), counted like an artist's.
- B, lost: make the venue an artist row. A venue is not a performer; its page,
  claim and owner live on `venues`, and a fake artist would split one business
  into two identities.
- C, lost: hand the venue an untagged link from the organiser's kit. Its sharing
  could not be told apart from the organiser's own (criterion 2), and nothing
  shows on the page (criterion 1).

## Reversal

If thirty days after this goes live no venue has joined an event it was asked to,
the ask is redrawn three ways; if a joined venue's links are ever counted as the
organiser's own, the collaborator tag is wrong and is fixed before anything else.
