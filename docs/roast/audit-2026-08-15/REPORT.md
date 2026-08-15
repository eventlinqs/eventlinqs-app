# Full platform audit

Base: https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app
Run: 2026-08-15T00:48:24.057Z
Surfaces recorded: 81. Findings: 31.

## Findings, most severe first

| Severity | Surface | Kind | Detail |
|---|---|---|---|
| MONEY PATH | checkout | payment surface not reached | the walk stopped at /events/opm-night-filipino-live-music-showcase without mounting a Stripe payment element. Either the flow needs sign-in first, or the money path is blocked. |
| DEAD LINK OR CONTROL | organisers marketing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Copy" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Copy" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Copy" changed nothing observable |
| DEAD LINK OR CONTROL | organisers marketing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "Open menu" did not open or close |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "Melbourne" did not open or close |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "Discover" did not open or close |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "Communities" did not open or close |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "For organisers" did not open or close |
| DEAD LINK OR CONTROL | event detail | inert disclosure | "Company" did not open or close |
| ERROR | dashboard | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard events | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard create event | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard venues | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard payouts | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard organisation | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard invites | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard insights | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | dashboard tickets | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | account | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| ERROR | my tickets | NOT COVERED | login did not complete, so this surface was not audited. It is not a pass. |
| EMPTY STATE | search miss (390) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | hero category networking (390) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | event detail (390) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | search miss (1440) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | hero category networking (1440) | empty state | renders the designed empty state rather than content (0 event links) |
| EMPTY STATE | event detail (1440) | empty state | renders the designed empty state rather than content (0 event links) |

## The deep phases: what was opened, clicked and read

| Phase | Item | Verdict | Detail |
|---|---|---|---|
| event detail | tabs | NONE | this page uses no tab pattern |
| event detail | disclosure "Melbourne" | WORKS |  |
| event detail | disclosure "Open menu" | INERT |  |
| event detail | disclosure "Melbourne" | INERT |  |
| event detail | disclosure "Discover" | INERT |  |
| event detail | disclosure "Communities" | INERT |  |
| event detail | disclosure "For organisers" | INERT |  |
| event detail | disclosure "Company" | INERT |  |
| event detail | Share button | WORKS | opened the share surface |
| event detail | share: WhatsApp | WORKS | https://wa.me/?text=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug%20https%3A%2F%2Feventlin |
| event detail | share: Facebook | WORKS | https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Feventlinqs-app-git-integration-launch-lawals-projects-c20c0be |
| event detail | share: X | WORKS | https://twitter.com/intent/tweet?text=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug&url=ht |
| event detail | share: Email | WORKS | mailto:?subject=OPM%20Night%3A%20Filipino%20Live%20Music%20Showcase%20-%20Sat%2C%2015%20Aug&body=OPM%20Night%3A%20Filipi |
| event detail | share: Copy link | UNREADABLE | the button clicked but the clipboard could not be read back headless |
| event detail | Open in Maps | WORKS | https://www.google.com/maps/search/?api=1&query=Brisbane%20Powerhouse%2C%20Brisbane%20Powerhouse%2C%20119%20La -> 200 |
| auth | signup | STOPPED | filled [email, password]; the submit control "Create account" is ENABLED and was NOT clicked |
| auth | login | STOPPED | filled [email, password]; the submit control "Sign in" is ENABLED and was NOT clicked |
| auth | forgot password | STOPPED | filled [email]; the submit control "Send reset link" is ENABLED and was NOT clicked |
| launch composer | description accepted | WORKS | 115 chars read back |
| launch composer | artefact reveal | WORKS | heading: "Warehouse party at the Barwon Club in Geelong, Marlo Reyes b2b Kita" |
| launch composer | reveal at 390 | WORKS | horizontal overflow 0px |
| launch composer | kit code | WORKS | eakmhzwhbc65 |
| artefact | story | PULLED | 183 KB, 1080x1920 px, image/jpeg |
| artefact | square | PULLED | 169 KB, 1080x1080 px, image/jpeg |
| artefact | feed | PULLED | 250 KB, 1440x1800 px, image/jpeg |
| artefact | poster | PULLED | 26 KB, unreadable, application/pdf |
| artefact | poster printed address line | READ | C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat\docs\roast\audit-2026-08-15\artefacts\poster.pdf |
| checkout | Stripe payment surface | NOT REACHED | stopped at /events/opm-night-filipino-live-music-showcase |

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
| event detail | 390 | 390x844 | 200 | EMPTY STATE | 0 | 93 | 18 |
| city page | 390 | 390x844 | 200 | CONTENT | 4 | 161 | 62 |
| community page | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 390 | 390x844 | 200 | CONTENT | 0 | 7 | 1 |
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
| events free filter | 1440 | 1440x900 | 200 | CONTENT | 1 | 105 | 67 |
| search hit | 1440 | 1440x900 | 200 | CONTENT | 2 | 106 | 67 |
| search miss | 1440 | 1440x900 | 200 | EMPTY STATE | 0 | 81 | 43 |
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
| event detail | 1440 | 1440x900 | 200 | EMPTY STATE | 2 | 93 | 18 |
| city page | 1440 | 1440x900 | 200 | CONTENT | 4 | 161 | 62 |
| community page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 1440 | 1440x900 | 200 | CONTENT | 0 | 7 | 1 |
| suburb page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 36 |
| artists (flag off, 404 expected) | 1440 | 1440x900 | 404 | CONTENT | 1 | 81 | 10 |
| sitemap.xml | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| robots.txt | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| checkout up to Stripe | 1440 | - | 200 | ticket selection | 0 | 0 | 0 |
| dashboard | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard events | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard create event | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard venues | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard payouts | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard organisation | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard invites | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard insights | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| dashboard tickets | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| account | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |
| my tickets | 1440 | - | NOT COVERED | login failed | 0 | 0 | 0 |