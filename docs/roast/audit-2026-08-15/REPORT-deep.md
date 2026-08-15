# Full platform audit

Base: https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app
Run: 2026-08-15T01:18:55.798Z
Catalogue census: 87 event pages, 40 sampled, 33 cannot sell, 0 paid and sellable, 7 free.
Surfaces recorded: 19. Findings: 16.

## Findings, most severe first

| Severity | Surface | Kind | Detail |
|---|---|---|---|
| MONEY PATH | catalogue | no paid ticket exists to buy | every one of the 7 sellable events sampled is FREE, so no automated walk on this deployment can reach the Stripe payment surface. That is not proof the paid path works, and it is not proof it is broken: it is proof it is UNTESTED here. |
| MONEY PATH | catalogue | events that cannot sell a ticket | 33 of 40 sampled event pages render "still finishing their payment setup" because the organiser has no completed Stripe Connect account. Correct behaviour per event, but it means most of the browsable catalogue has no purchase path. |
| MONEY PATH | event detail (ticketing blocked) (390) | ticketing blocked | the organiser has not completed Stripe Connect, so this event page offers no way to buy a ticket |
| MONEY PATH | checkout | payment surface not reached | the walk stopped at /events/marketplace-gate-night-geelong without mounting a Stripe payment element. Either the flow needs sign-in first, or the money path is blocked. |
| ERROR | dashboard | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard events | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard create event | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard venues | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard payouts | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard organisation | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard invites | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard insights | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard tickets | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | account | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | my tickets | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| COSMETIC | event detail | copy-link result unproven | the button clicked but neither a clipboard read nor a visible confirmation could establish what it copied |

## The deep phases: what was opened, clicked and read

| Phase | Item | Verdict | Detail |
|---|---|---|---|
| sample selection | event walked by the deep phases | SELLABLE | /events/marketplace-gate-night-geelong |
| event detail | tabs | NONE | this page uses no tab pattern |
| event detail | disclosure "Melbourne" | WORKS |  |
| event detail | Share button | WORKS | opened the share surface |
| event detail | share: WhatsApp | WORKS | https://wa.me/?text=Marketplace%20Gate%20Night%2C%20Geelong%20-%20Fri%2C%2021%20Aug%20https%3A%2F%2Feventlinqs-app-git-i |
| event detail | share: Facebook | WORKS | https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Feventlinqs-app-git-integration-launch-lawals-projects-c20c0be |
| event detail | share: X | WORKS | https://twitter.com/intent/tweet?text=Marketplace%20Gate%20Night%2C%20Geelong%20-%20Fri%2C%2021%20Aug&url=https%3A%2F%2F |
| event detail | share: Email | WORKS | mailto:?subject=Marketplace%20Gate%20Night%2C%20Geelong%20-%20Fri%2C%2021%20Aug&body=Marketplace%20Gate%20Night%2C%20Gee |
| event detail | share: Copy link | UNPROVEN | the control was clicked; the clipboard could not be read headless and no confirmation appeared. Canonical for reference: https://eventlinqs-p85kfm0fy-lawals-projects-c20c0be8.vercel.app/events/marketplace-gate-night-geelong |
| event detail | Open in Maps | WORKS | https://www.google.com/maps/search/?api=1&query=Waterfront%20Pavilion%2C%20Waterfront%20Pavilion%2C%20Geelong% -> 200 |
| auth | signup | STOPPED | filled [email, password]; the submit control "Create account" is ENABLED and was NOT clicked |
| auth | login | STOPPED | filled [email, password]; the submit control "Sign in" is ENABLED and was NOT clicked |
| auth | forgot password | STOPPED | filled [email]; the submit control "Send reset link" is ENABLED and was NOT clicked |
| launch composer | description accepted | WORKS | 115 chars read back |
| launch composer | artefact reveal | WORKS | heading: "Warehouse party at the Barwon Club in Geelong, Marlo Reyes b2b Kita" |
| launch composer | reveal at 390 | WORKS | horizontal overflow 0px |
| launch composer | kit code | WORKS | fu9q7jvkkd7z |
| artefact | story | PULLED | 184 KB, 1080x1920 px, image/jpeg |
| artefact | square | PULLED | 169 KB, 1080x1080 px, image/jpeg |
| artefact | feed | PULLED | 251 KB, 1440x1800 px, image/jpeg |
| artefact | poster | PULLED | 26 KB, 595x842 pt (210x297 mm = A4), application/pdf |
| artefact | poster: the printed call-to-action line | READ | From $25 · eventlinqs.com.au/launch/k/fu9q7jvkkd7z |
| artefact | poster: the printed date and time line | READ | Sunday 20 September, 10:00 pm |
| artefact | poster: every drawn line, verbatim | READ | Warehoushptay pB / From $25 · eventlinqs.com.au/launch/k/fu9q7jvkkd7z / Waareho / Sunday 20 September, 10:00 pm / Warehouse / party at the / Barwon Club / in Geelong, / Marlo Reyes / b2b Kita / Warehoausptyp B wWnCwlb / i |
| checkout | quantity stepper | WORKS | raised the quantity by one |
| checkout | controls on the ticket surface | NONE MATCHED | enabled+visible buttons: "What are you in the mood for?
/", "Melbourne", "Share event", "Save event", "Save event", "Follow", "Share", "Copy link", "−", "+", "Register 1 ticket", "Share", "Copy link" |
| checkout | proceed control | NONE ENABLED | 0 matched by name, none of them enabled |
| checkout | Stripe payment surface | NOT REACHED | stopped at /events/marketplace-gate-night-geelong |

## Every surface

| Surface | Viewport | Measured | Status | State | Console | Links | Controls |
|---|---|---|---|---|---|---|---|
| organiser profile (real) | 390 | 390x844 | 200 | CONTENT | 0 | 81 | 12 |
| event detail (sellable) | 390 | 390x844 | 200 | CONTENT | 0 | 90 | 21 |
| event detail (ticketing blocked) | 390 | 390x844 | 200 | TICKETING BLOCKED | 0 | 93 | 18 |
| suburb page | 390 | 390x844 | 200 | CONTENT | 0 | 107 | 39 |
| organiser profile (real) | 1440 | 1440x900 | 200 | CONTENT | 0 | 81 | 12 |
| event detail (sellable) | 1440 | 1440x900 | 200 | CONTENT | 0 | 90 | 21 |
| event detail (ticketing blocked) | 1440 | 1440x900 | 200 | CONTENT | 0 | 93 | 23 |
| suburb page | 1440 | 1440x900 | 200 | CONTENT | 0 | 107 | 37 |
| dashboard | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard events | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard create event | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard venues | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard payouts | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard organisation | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard invites | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard insights | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard tickets | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| account | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| my tickets | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |