# EventLinqs Scope v5, Addendum A: the community layer and the event categories as built

**APPROVED BY OWNER, added during build, September 2026.** Owner decision of 7 September 2026
(CLOSE-OUT C18 FINAL): the community layer is an approved, deliberate feature added during the
build. It is a differentiator and it stays. Nothing in it is removed. This addendum becomes part of
the authoritative scope beside `docs/EventLinqs_Scope_v5.md`, which references it from its footer and
whose body is unchanged. Where the platform is ahead of the scope, this document records what was
built; where the scope names something the platform lacks, the platform is built to match; naming
differences are reported and nothing is renamed without the owner.

The machine-readable form of every list below is `docs/scope/community-layer-approved.json`, and
`scripts/guards/community-layer-protected.mjs` fails the build if the source or the database ever
diverges from it in either direction. Every list was enumerated on 7 September 2026 from the source
the live surfaces read and from the production database, read only, never typed from memory.

## A.1 The 21 communities

The canonical list is `src/lib/communities/data.ts` (`getAllCommunities`, `COMMUNITY_SLUGS`). It is
the list every live surface reads: the community pages, the community-by-city pages, the communities
index, the organiser form's community tagging, on-site search, the footer, the related-communities
rails, the sitemap and the AI drafting assistant. In heritage order, First Nations first:

| Order | Community | Slug | Page |
|---|---|---|---|
| 1 | Aboriginal & Torres Strait Islander | `aboriginal-torres-strait-islander` | `/community/aboriginal-torres-strait-islander` |
| 2 | African | `african` | `/community/african` |
| 3 | Caribbean | `caribbean` | `/community/caribbean` |
| 4 | Indian | `indian` | `/community/indian` |
| 5 | Chinese | `chinese` | `/community/chinese` |
| 6 | Filipino | `filipino` | `/community/filipino` |
| 7 | Latin American | `latin-american` | `/community/latin-american` |
| 8 | Vietnamese | `vietnamese` | `/community/vietnamese` |
| 9 | Lebanese & Levantine | `lebanese-levantine` | `/community/lebanese-levantine` |
| 10 | Greek | `greek` | `/community/greek` |
| 11 | Italian | `italian` | `/community/italian` |
| 12 | Korean | `korean` | `/community/korean` |
| 13 | Japanese | `japanese` | `/community/japanese` |
| 14 | Pacific / Pasifika | `pacific-pasifika` | `/community/pacific-pasifika` |
| 15 | Maori | `maori` | `/community/maori` |
| 16 | Persian / Iranian | `persian-iranian` | `/community/persian-iranian` |
| 17 | Turkish | `turkish` | `/community/turkish` |
| 18 | Arab | `arab` | `/community/arab` |
| 19 | Other South Asian | `other-south-asian` | `/community/other-south-asian` |
| 20 | Other East & Southeast Asian | `other-east-southeast-asian` | `/community/other-east-southeast-asian` |
| 21 | Other European | `other-european` | `/community/other-european` |

All 21 are tier 1 in the source. The production sitemap publishes all 21 pages and all 21 return 200
with real content (driven on production on 6 and 7 September 2026, CLOSE-OUT C6 and C18F.6).

**A database table that is not the list.** `public.communities` on production and TEST holds 14 rows
(`african`, `south-asian`, `caribbean`, `latin`, `east-asian`, `filipino`, `mediterranean`,
`middle-eastern`, `european`, `pacific`, `gospel`, `comedy`, `wellness`, `pride`) that predate the
21-community layer. Nothing in the application reads it (no `from('communities')` anywhere under
`src` on 7 September 2026). It is recorded here and left exactly as it is; retiring it is the owner's
decision, not a build step.

## A.2 The routes and what each renders

- **`/communities`**: the index of all 21 communities, each tile linking to its page.
- **`/community/[community]`**: one page per community. Renders the community's photographic hero
  and eyebrow, its story, its sub-communities ("every sound, every scene"), the community in its
  cities (a rail of the city variants), the community's upcoming events or, with none, the designed
  empty state ("the first ... event on EventLinqs could be yours" with the organiser call to action),
  adjacent communities, and the organiser band. Events reach it through the organiser form's community
  tags (`community_slugs`, written as canonical tokens into the event's tags).
- **`/community/[community]/[city]`**: the community in one city, for every city in
  `src/lib/cities/data.ts` (`getAllCities`, 20 cities: Sydney, Melbourne, Brisbane, Perth, Adelaide,
  Gold Coast, Canberra, Hobart, Newcastle, Wollongong, Geelong, Townsville, Cairns, Darwin, Sunshine
  Coast, Bendigo, Ballarat, Albury, Launceston, Toowoomba): 21 x 20 = 420 pages, all published in the
  sitemap. Each renders the city hero, an editorial for the intersection where one is written
  (`src/lib/communities/intersection-editorial.ts`) or the template copy where not, the community's
  sounds in that city, the upcoming events or the designed empty state, the community in other cities,
  other communities in the same city, and the organiser band.
- **`/faith/[faith]`**: see A.3.

## A.3 Faith, and how it relates to community

Faith is its own axis, on its own route, because a faith community crosses heritage communities: a
Christian night may be African, Filipino, Pacific and Korean at once, and the faith page says so
("across every community") and links the communities within it. `src/lib/faiths/data.ts` holds five
faith pages and three filter-only faiths:

| Faith | Slug | Page |
|---|---|---|
| Christian | `christian` | `/faith/christian` |
| Muslim | `muslim` | `/faith/muslim` |
| Hindu | `hindu` | `/faith/hindu` |
| Buddhist | `buddhist` | `/faith/buddhist` |
| Jewish | `jewish` | `/faith/jewish` |

Filter-only (listed in the browse filter, no page of their own): Sikh (`sikh`), Baha'i (`bahai`),
Spiritual & Interfaith (`spiritual`). Each faith page renders a hero, the census note, a story, the
major moments of the year, the upcoming events or the designed empty state ("Be the first"), and the
communities within the faith. Events reach a faith page through the `faith` filter.

## A.4 How the layer sits beside the Scope v5 event categories (line 351)

Scope v5 line 351 lists the event categories: Music, Sports, Arts & Culture, Food & Drink, Business &
Networking, Education, Charity, Nightlife, Family, Technology, Religion, Fashion, Health & Wellness,
Community, Other, with regional subcategories. Categories and communities are DIFFERENT AXES, not
competing lists. An event has exactly one category (`events.category_id`, a row of
`public.event_categories`) AND may belong to any number of communities (its community tags), and may
appear on a faith page through its faith filter. A Nigerian wedding band's night is category Music,
communities African, and it shows on the Music browse, the African community page and the African
Melbourne page at once. The category axis answers "what kind of event"; the community axis answers
"whose event, and who it gathers".

## A.5 The event categories as built (additive against line 351)

`public.event_categories` carries 22 slugs, identical on production and TEST (read on 7 September
2026). `/categories/[slug]` forwards each real category slug (308) to the canonical category browse,
`/events?category=[slug]`, which renders that category's events; the homepage category rail and the
browse filter read the same table; the organiser form offers the same rows.

| Slug | Name on the platform | Scope v5 line 351 |
|---|---|---|
| `music` | Music | Music |
| `sports` | Sports | Sports |
| `arts-community` | Arts | Arts & Culture (RENAMED, see below) |
| `food-drink` | Food & Drink | Food & Drink |
| `business-networking` | Business & Networking | Business & Networking |
| `education` | Education | Education |
| `charity` | Charity | Charity |
| `nightlife` | Nightlife | Nightlife |
| `family` | Family | Family |
| `technology` | Technology | Technology |
| `religion` | Religion | Religion |
| `fashion` | Fashion | Fashion |
| `health-wellness` | Health & Wellness | Health & Wellness |
| `community` | Community | Community |
| `other` | Other | Other |
| `comedy` | Comedy | approved addition |
| `festival` | Festival | approved addition |
| `film` | Film | approved addition |
| `pride` | Pride | approved addition |
| `european` | European | approved addition |
| `middle-eastern` | Middle Eastern | approved addition |
| `pacific` | Pacific | approved addition |

Every one of the 15 scope categories is present. Seven categories exist beyond the scope and are kept
and recorded here as approved additions. One naming difference, reported and not changed: the scope's
"Arts & Culture" is the platform's "Arts" at `arts-community`, because the scope name's second word is
banned in every form by the constitution (Copy and banned content) and the rename was made on
26 August 2026 with its redirect; the retired slug still forwards to the live one.

**Seven editorial hero categories** live in `src/lib/hero-categories.ts` and are bound to
`/categories/[slug]`: `afrobeats`, `amapiano`, `gospel`, `owambe`, `caribbean`,
`heritage-and-independence` and `networking`. Six are permanently redirected (308) to a community page
by the table in `src/lib/seo/permanent-redirects.ts`; `networking` renders its own landing page. All
seven are kept as they are.

## A.6 What protects this

- `scripts/guards/community-layer-protected.mjs`, registered and blocking on every build: fails if any
  of the 21 communities, the 20 matrix cities, the 5 faith pages or the 3 filter-only faiths leaves
  the source, if the count drops, if any of the 22 categories leaves the database the build runs
  against, if any scope category has no slug in that database, if a community, faith or category
  appears in the source or the database that this record does not carry (the fix is to record it,
  never to remove it), or if the routes or the sitemap stop publishing the layer. Drilled both ways.
- `tests/unit/scope/community-layer-approved.test.ts`: the record equals the source, name for name and
  in order; this addendum names every slug; the scope document points here without its body being
  edited.
- The production drive of every page in this addendum at 390, 768 and 1440 (C18F.6) is in
  `BUILD-LEDGER.md` with its evidence paths.
