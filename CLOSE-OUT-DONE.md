# CLOSE-OUT-DONE

Items from CLOSE-OUT.md that are fully MET with evidence. Nothing is ever
deleted, only moved here, so CLOSE-OUT.md stays short enough to keep reading.
Each item leaves one line behind there giving its id, DONE, the date and the
commit. The ledger row and the driven evidence are the proof; this file is the
original brief, kept verbatim so a verdict can always be read against what was
actually asked for.


---

## UX1. SIX DEFECTS ON THE FIRST REAL ORGANISER EVENT, FOUND ON PRODUCTION.

Seen on https://www.eventlinqs.com.au/events/afro-fusion-music-showcase-with-mikhaell-friends-a-l1vcpz
by the owner on 9 September 2026. The first real outside organiser event on the
platform. Four of the six are platform defects that will hit every organiser.

UX1.1 The organiser bio renders raw markdown. The MKL Studios bio displays
      **MKL Studios** with the asterisks visible. Decide one rule and apply it
      everywhere an organiser or artist writes prose: render markdown, or strip it.
      Never display the syntax. Guard it, drilled on a bio containing bold, italic,
      a link and a list.

UX1.2 The venue name is duplicated in Getting there: "Quakers Centre, Quakers
      Centre, 484 William Street, West Melbourne, VIC, Australia". The venue name is
      being concatenated with a formatted address that already carries it. Fix at the
      formatter, not the page, and prove it on a venue whose name is and is not part
      of its address.

UX1.3 Tags are not case normalised. The same event carries #African and #african.
      Normalise at write time, migrate existing rows, and guard that two tags
      differing only by case cannot both exist.

UX1.4 The homepage hero crop cuts the top of the organiser's poster. Organisers put
      the event name at the top of a poster. Either respect a safe area or choose a
      focal point rather than a fixed crop. Drive it at 390, 768 and 1440 on this
      event.

Also recorded, not platform faults, for the owner to raise with the organiser:
  the description begins "oin Mikhaell & Friends", missing the J
  the ticket name is lowercase "general admission" while the page is title case

Verify separately and report: the Google venue map renders on production with a real
pin, which suggests NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is present. Name which key is
serving it and whether it is set on preview as well as production.
