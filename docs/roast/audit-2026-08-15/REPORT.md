# Full platform audit

Base: https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app
Run: 2026-08-15T02:28:25.959Z
Surfaces recorded: 88. Findings: 23.

## Findings, most severe first

| Severity | Surface | Kind | Detail |
|---|---|---|---|
| MONEY PATH | checkout | payment surface not reached | the walk stopped at /events/opm-night-filipino-live-music-showcase without mounting a Stripe payment element. Either the flow needs sign-in first, or the money path is blocked. |
| DEAD LINK OR CONTROL | organisers marketing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | organisers marketing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard events (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard events (1440) | inert control | "Cancel" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard create event (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard venues (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard payouts (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard organisation (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard invites (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard insights (1440) | inert control | "Notifications" changed nothing observable |
| DEAD LINK OR CONTROL | dashboard tickets (1440) | inert control | "Notifications" changed nothing observable |
| ERROR | event detail (ticketing blocked) | NOT COVERED | no example of this page type could be discovered from the site or its sitemap, so it was not audited. It is not a pass. |
| ERROR | seat builder | no canvas rendered | /dashboard/venues/fa1f4f8f-543a-408d-81df-59e1806dd783/seat-maps |
| EMPTY STATE | search miss (390) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | hero category networking (390) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | search miss (1440) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | hero category networking (1440) | empty state | renders the designed empty state rather than content (0 event links) |
| COSMETIC | event detail | no link to the organiser | no event page links to the organiser running the event; the only /organisers/ link on an event page is the signup call to action. 38 organiser profiles are in the sitemap and indexable but unreachable by clicking. |
| COSMETIC | event detail | no link to the organiser | no event page links to the organiser running the event; the only /organisers/ link on an event page is the signup call to action. 38 organiser profiles are in the sitemap and indexable but unreachable by clicking. |

## The deep phases: what was opened, clicked and read

| Phase | Item | Verdict | Detail |
|---|---|---|---|
| sample selection | event walked by the deep phases | SELLABLE | /events/opm-night-filipino-live-music-showcase |
| corrected surfaces | event detail (ticketing blocked) | NOT COVERED | no example of this page type could be discovered |
| event detail | tabs | NONE | this page uses no tab pattern |
| event detail | disclosure "Melbourne" | WORKS |  |
| event detail | Share button | WORKS | opened the share surface |
| event detail | share: WhatsApp | WORKS | https://wa.me/?text=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug%20https%3A%2F%2Feventlin |
| event detail | share: Facebook | WORKS | https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Feventlinqs-app-git-integration-launch-lawals-projects-c20c0be |
| event detail | share: X | WORKS | https://twitter.com/intent/tweet?text=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug&url=ht |
| event detail | share: Email | WORKS | mailto:?subject=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug&body=OPM%20Night%3A%20Filipi |
| event detail | share: Copy link | WORKS | clipboard: https://eventlinqs-k7dxfjn4m-lawals-projects-c20c0be8.vercel.app/events/opm-night-filipino-live-music-showcase |
| event detail | Open in Maps | WORKS | https://www.google.com/maps/search/?api=1&query=Brisbane%20Powerhouse%2C%20Brisbane%20Powerhouse%2C%20119%20La -> 200 |
| auth | signup | STOPPED | filled [email, password]; the submit control "Create account" is ENABLED and was NOT clicked |
| auth | login | STOPPED | filled [email, password]; the submit control "Sign in" is ENABLED and was NOT clicked |
| auth | forgot password | STOPPED | filled [email]; the submit control "Send reset link" is ENABLED and was NOT clicked |
| launch composer | description accepted | WORKS | 115 chars read back |
| launch composer | artefact reveal | WORKS | heading: "Warehouse party at the Barwon Club in Geelong, Marlo Reyes b2b Kita" |
| launch composer | reveal at 390 | WORKS | horizontal overflow 0px |
| launch composer | kit code | WORKS | aszp9zddhqrb |
| artefact | story | PULLED | 184 KB, 1080x1920 px, image/jpeg |
| artefact | square | PULLED | 169 KB, 1080x1080 px, image/jpeg |
| artefact | feed | PULLED | 252 KB, 1440x1800 px, image/jpeg |
| artefact | poster | PULLED | 26 KB, 595x842 pt (210x297 mm = A4), application/pdf |
| artefact | poster: the printed call-to-action line | READ | From $25 · eventlinqs.com.au/launch/k/aszp9zddhqrb |
| artefact | poster: the printed date and time line | READ | Sunday 20 September, 10:00 pm |
| artefact | poster: every drawn line, verbatim | READ | Warehoushptay pB / From $25 · eventlinqs.com.au/launch/k/aszp9zddhqrb / Waareho / Sunday 20 September, 10:00 pm / Warehouse / party at the / Barwon Club / in Geelong, / Marlo Reyes / b2b Kita / Warehoausptyp B wWnCwlb / i |
| checkout | quantity stepper | WORKS | raised the quantity by one |
| checkout | controls on the ticket surface | NONE MATCHED | enabled+visible buttons: "What are you in the mood for?
/", "Melbourne", "Share event", "Save event", "Save event", "Follow", "Share", "Copy link", "−", "+", "+", "Checkout · AUD 48.70", "Share", "Copy link" |
| checkout | proceed control | NONE ENABLED | 0 matched by name, none of them enabled |
| checkout | Stripe payment surface | NOT REACHED | stopped at /events/opm-night-filipino-live-music-showcase |
| magic start | verdict | MODEL | HTTP 200, source="model": the Anthropic call succeeded and wrote the draft |
| seat builder | canvas | ABSENT | no canvas element on the seat map surface |

## Every surface

| Surface | Viewport | Measured | Status | State | Console | Links | Controls |
|---|---|---|---|---|---|---|---|
| homepage | 390 | 390x844 | 200 | CONTENT | 0 | 255 | 51 |
| events browse | 390 | 390x844 | 200 | CONTENT | 0 | 115 | 77 |
| events filtered category | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 67 |
| events category comedy | 390 | 390x844 | 200 | CONTENT | 0 | 90 | 54 |
| events category arts and community | 390 | 390x844 | 200 | CONTENT | 0 | 93 | 57 |
| events sorted | 390 | 390x844 | 200 | CONTENT | 0 | 115 | 77 |
| events free filter | 390 | 390x844 | 200 | CONTENT | 0 | 105 | 67 |
| search hit | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 67 |
| search miss | 390 | 390x844 | 200 | EMPTY STATE | 0 | 81 | 43 |
| hero category afrobeats | 390 | 390x844 | 200 | CONTENT | 0 | 114 | 21 |
| hero category networking | 390 | 390x844 | 200 | EMPTY STATE | 0 | 82 | 10 |
| communities index | 390 | 390x844 | 200 | CONTENT | 0 | 100 | 10 |
| cities index | 390 | 390x844 | 200 | CONTENT | 0 | 99 | 10 |
| organisers marketing | 390 | 390x844 | 200 | CONTENT | 0 | 101 | 25 |
| pricing | 390 | 390x844 | 200 | CONTENT | 0 | 84 | 25 |
| about | 390 | 390x844 | 200 | CONTENT | 0 | 82 | 10 |
| contact | 390 | 390x844 | 200 | CONTENT | 0 | 84 | 11 |
| help | 390 | 390x844 | 200 | CONTENT | 0 | 91 | 20 |
| legal privacy | 390 | 390x844 | 200 | CONTENT | 0 | 87 | 10 |
| legal terms | 390 | 390x844 | 200 | CONTENT | 0 | 97 | 10 |
| legal refunds | 390 | 390x844 | 200 | CONTENT | 0 | 84 | 10 |
| launch composer | 390 | 390x844 | 200 | CONTENT | 0 | 79 | 12 |
| login | 390 | 390x844 | 200 | THIN | 0 | 5 | 2 |
| signup | 390 | 390x844 | 200 | CONTENT | 0 | 6 | 1 |
| forgot password | 390 | 390x844 | 200 | THIN | 0 | 4 | 1 |
| deliberate 404 | 390 | 390x844 | 404 | CONTENT | 1 | 81 | 10 |
| event detail | 390 | 390x844 | 200 | CONTENT | 2 | 93 | 23 |
| city page | 390 | 390x844 | 200 | CONTENT | 6 | 161 | 62 |
| community page | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 390 | 390x844 | 200 | CONTENT | 0 | 81 | 12 |
| suburb page | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 38 |
| artists (flag off, 404 expected) | 390 | 390x844 | 404 | CONTENT | 1 | 81 | 10 |
| sitemap.xml | 390 | - | 200 | CONTENT | 0 | 0 | 0 |
| robots.txt | 390 | - | 200 | CONTENT | 0 | 0 | 0 |
| checkout up to Stripe | 390 | - | 200 | ticket selection | 0 | 0 | 0 |
| homepage | 1440 | 1440x900 | 200 | CONTENT | 0 | 255 | 51 |
| events browse | 1440 | 1440x900 | 200 | CONTENT | 2 | 115 | 77 |
| events filtered category | 1440 | 1440x900 | 200 | CONTENT | 2 | 106 | 67 |
| events category comedy | 1440 | 1440x900 | 200 | CONTENT | 2 | 90 | 54 |
| events category arts and community | 1440 | 1440x900 | 200 | CONTENT | 2 | 93 | 57 |
| events sorted | 1440 | 1440x900 | 200 | CONTENT | 2 | 115 | 77 |
| events free filter | 1440 | 1440x900 | 200 | CONTENT | 2 | 105 | 67 |
| search hit | 1440 | 1440x900 | 200 | CONTENT | 2 | 106 | 67 |
| search miss | 1440 | 1440x900 | 200 | EMPTY STATE | 2 | 81 | 43 |
| hero category afrobeats | 1440 | 1440x900 | 200 | CONTENT | 0 | 114 | 21 |
| hero category networking | 1440 | 1440x900 | 200 | EMPTY STATE | 0 | 82 | 10 |
| communities index | 1440 | 1440x900 | 200 | CONTENT | 0 | 100 | 10 |
| cities index | 1440 | 1440x900 | 200 | CONTENT | 0 | 99 | 10 |
| organisers marketing | 1440 | 1440x900 | 200 | CONTENT | 0 | 101 | 25 |
| pricing | 1440 | 1440x900 | 200 | CONTENT | 0 | 84 | 25 |
| about | 1440 | 1440x900 | 200 | CONTENT | 0 | 82 | 10 |
| contact | 1440 | 1440x900 | 200 | CONTENT | 0 | 84 | 11 |
| help | 1440 | 1440x900 | 200 | CONTENT | 0 | 91 | 20 |
| legal privacy | 1440 | 1440x900 | 200 | CONTENT | 0 | 87 | 10 |
| legal terms | 1440 | 1440x900 | 200 | CONTENT | 0 | 97 | 10 |
| legal refunds | 1440 | 1440x900 | 200 | CONTENT | 0 | 84 | 10 |
| launch composer | 1440 | 1440x900 | 200 | CONTENT | 0 | 79 | 12 |
| login | 1440 | 1440x900 | 200 | THIN | 0 | 5 | 2 |
| signup | 1440 | 1440x900 | 200 | CONTENT | 0 | 6 | 1 |
| forgot password | 1440 | 1440x900 | 200 | THIN | 0 | 4 | 1 |
| deliberate 404 | 1440 | 1440x900 | 404 | CONTENT | 1 | 81 | 10 |
| event detail | 1440 | 1440x900 | 200 | CONTENT | 2 | 93 | 23 |
| city page | 1440 | 1440x900 | 200 | CONTENT | 2 | 161 | 62 |
| community page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 1440 | 1440x900 | 200 | CONTENT | 0 | 81 | 12 |
| suburb page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 36 |
| artists (flag off, 404 expected) | 1440 | 1440x900 | 404 | CONTENT | 1 | 81 | 10 |
| sitemap.xml | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| robots.txt | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| checkout up to Stripe | 1440 | - | 200 | ticket selection | 0 | 0 | 0 |
| organiser profile (real) | 390 | 390x844 | 200 | CONTENT | 0 | 81 | 12 |
| event detail (sellable) | 390 | 390x844 | 200 | CONTENT | 0 | 93 | 23 |
| suburb page | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 38 |
| organiser profile (real) | 1440 | 1440x900 | 200 | CONTENT | 0 | 81 | 12 |
| event detail (sellable) | 1440 | 1440x900 | 200 | CONTENT | 0 | 93 | 23 |
| suburb page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 36 |
| dashboard | 1440 | 1440x900 | 200 | CONTENT | 0 | 32 | 3 |
| dashboard events | 1440 | 1440x900 | 200 | CONTENT | 0 | 225 | 210 |
| dashboard create event | 1440 | 1440x900 | 200 | CONTENT | 0 | 13 | 12 |
| dashboard venues | 1440 | 1440x900 | 200 | CONTENT | 0 | 24 | 28 |
| dashboard payouts | 1440 | 1440x900 | 200 | CONTENT | 0 | 12 | 7 |
| dashboard organisation | 1440 | 1440x900 | 200 | CONTENT | 0 | 15 | 4 |
| dashboard invites | 1440 | 1440x900 | 200 | CONTENT | 0 | 13 | 3 |
| dashboard insights | 1440 | 1440x900 | 200 | THIN | 0 | 13 | 3 |
| dashboard tickets | 1440 | 1440x900 | 200 | THIN | 0 | 14 | 3 |
| account | 1440 | 1440x900 | 200 | CONTENT | 0 | 84 | 12 |
| my tickets | 1440 | 1440x900 | 200 | CONTENT | 0 | 62 | 80 |
| seat maps | 1440 | 1440x900 | 200 | CONTENT | 0 | 13 | 6 |