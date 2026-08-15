# Full platform audit

Base: https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app
Run: 2026-08-15T00:04:11.693Z
Surfaces recorded: 74. Findings: 42.

## Findings, most severe first

| Severity | Surface | Kind | Detail |
|---|---|---|---|
| DEAD LINK OR CONTROL | organisers marketing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | organisers marketing (390) | inert control | "My buyer" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (390) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (390) | inert control | "My buyer" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Discover" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Communities" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "For organisers" changed nothing observable |
| DEAD LINK OR CONTROL | launch composer (390) | inert control | "Company" changed nothing observable |
| DEAD LINK OR CONTROL | events browse (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | events filtered category (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | events category comedy (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | events category arts and community (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | events sorted (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | events free filter (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | search hit (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | search miss (1440) | inert control | "Grid" changed nothing observable |
| DEAD LINK OR CONTROL | organisers marketing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | organisers marketing (1440) | inert control | "My buyer" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (1440) | inert control | "-" changed nothing observable |
| DEAD LINK OR CONTROL | pricing (1440) | inert control | "My buyer" changed nothing observable |
| ERROR | deliberate 404 (390) | console error | Failed to load resource: the server responded with a status of 404 () |
| ERROR | deliberate 404 (390) | failed request | HTTP 404 https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app/this-route-does-not-exist-audit-probe |
| ERROR | artists (flag off, 404 expected) (390) | console error | Failed to load resource: the server responded with a status of 404 () |
| ERROR | artists (flag off, 404 expected) (390) | failed request | HTTP 404 https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app/artists |
| ERROR | deliberate 404 (1440) | console error | Failed to load resource: the server responded with a status of 404 () |
| ERROR | deliberate 404 (1440) | failed request | HTTP 404 https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app/this-route-does-not-exist-audit-probe |
| ERROR | artists (flag off, 404 expected) (1440) | console error | Failed to load resource: the server responded with a status of 404 () |
| ERROR | artists (flag off, 404 expected) (1440) | failed request | HTTP 404 https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app/artists |
| ERROR | dashboard | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard events | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard create event | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard venues | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard payouts | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| ERROR | dashboard organisation | NOT COVERED | no credentials supplied, so this surface was not audited. It is not a pass. |
| EMPTY STATE | homepage (390) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | search miss (390) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | hero category networking (390) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | event detail (390) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | homepage (1440) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | search miss (1440) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | hero category networking (1440) | empty state | renders the designed empty state rather than content |
| EMPTY STATE | event detail (1440) | empty state | renders the designed empty state rather than content |

## Every surface

| Surface | Viewport | Measured | Status | State | Console | Links | Controls |
|---|---|---|---|---|---|---|---|
| homepage | 390 | 390x844 | 200 | EMPTY STATE | 0 | 141 | 18 |
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
| city page | 390 | 390x844 | 200 | CONTENT | 2 | 161 | 62 |
| community page | 390 | 390x844 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 390 | 390x844 | 200 | CONTENT | 0 | 7 | 1 |
| artists (flag off, 404 expected) | 390 | 390x844 | 404 | CONTENT | 1 | 81 | 10 |
| sitemap.xml | 390 | - | 200 | CONTENT | 0 | 0 | 0 |
| robots.txt | 390 | - | 200 | CONTENT | 0 | 0 | 0 |
| checkout up to Stripe | 390 | - | 200 | ticket selection | 0 | 0 | 0 |
| homepage | 1440 | 1440x900 | 200 | EMPTY STATE | 0 | 141 | 18 |
| events browse | 1440 | 1440x900 | 200 | CONTENT | 0 | 115 | 77 |
| events filtered category | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 67 |
| events category comedy | 1440 | 1440x900 | 200 | CONTENT | 0 | 90 | 54 |
| events category arts and community | 1440 | 1440x900 | 200 | CONTENT | 0 | 93 | 57 |
| events sorted | 1440 | 1440x900 | 200 | CONTENT | 0 | 115 | 77 |
| events free filter | 1440 | 1440x900 | 200 | CONTENT | 0 | 105 | 67 |
| search hit | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 67 |
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
| event detail | 1440 | 1440x900 | 200 | EMPTY STATE | 0 | 93 | 18 |
| city page | 1440 | 1440x900 | 200 | CONTENT | 4 | 161 | 62 |
| community page | 1440 | 1440x900 | 200 | CONTENT | 0 | 106 | 13 |
| organiser profile | 1440 | 1440x900 | 200 | CONTENT | 0 | 7 | 1 |
| artists (flag off, 404 expected) | 1440 | 1440x900 | 404 | CONTENT | 1 | 81 | 10 |
| sitemap.xml | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| robots.txt | 1440 | - | 200 | CONTENT | 0 | 0 | 0 |
| checkout up to Stripe | 1440 | - | 200 | ticket selection | 0 | 0 | 0 |
| dashboard | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard events | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard create event | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard venues | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard payouts | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |
| dashboard organisation | 1440 | - | NOT COVERED | no credentials | 0 | 0 | 0 |