# Photo day

How to get a batch of licensed photos onto the platform. Three steps: drop the
files, run one command, done. The script validates, optimises to AVIF, uploads to
storage, and writes a manifest that the seed data and fixtures read. It never
touches a database row, so this can never disturb live events, orders, or seed
data. The manifest is the only thing it writes.

## The 3 steps

### 1. Drop your photos into `design-assets/incoming/`

Put every licensed photo in `design-assets/incoming/` (one flat folder, no
subfolders needed). Name each file by the convention:

```
<role>__<key>__<city>__<descriptor>.jpg
```

Fields are separated by a DOUBLE underscore (`__`), so slugs that contain a
single hyphen (`hip-hop-rnb`, `inner-west`) stay intact. Use the word `none` for
a field that does not apply.

| Field | What it is | Allowed values |
|---|---|---|
| `role` | what the photo is for | `hero`, `category`, `scene`, `city`, `venue` |
| `key` | the category or scene it belongs to | a category slug (role `category`), a scene slug (role `scene`), else `none` |
| `city` | the city it is for | a city slug (`sydney`, `melbourne`, `brisbane`, `perth`, `adelaide`, `gold-coast`, `canberra`, `hobart`, `darwin`, `newcastle`, `wollongong`), or `none` |
| `descriptor` | a short human label, kebab-case, makes the name unique in its slot | e.g. `harbour-rooftop`, `crowd-hands-up` |

Examples:

```
hero__none__none__summer-festival-night.jpg
category__music__sydney__harbour-rooftop.jpg
category__hip-hop-rnb__melbourne__laneway-set.jpg
scene__afrobeats-amapiano__none__crowd-hands-up.jpg
city__none__sydney__harbour-dusk.jpg
venue__none__sydney__the-forum-interior.jpg
```

Use the real platform taxonomy for `key` and `city`, never an invented slug:

- **Category** slugs are the real `event_categories` set (sports, music,
  arts-culture, family, festival, food-drink, nightlife, business-networking).
- **Scene** slugs are the locked Scene layer in `CLAUDE.md` (Electronic & Dance,
  Country, ..., First Nations, South Asian, ...). Slugify the name: "Hip-Hop &
  RnB" becomes `hip-hop-rnb`, "Afrobeats & Amapiano" becomes
  `afrobeats-amapiano`.
- **City** slugs are the launch cities listed above.

### 2. Run one command

```
node scripts/ingest-imagery.mjs
```

That is the whole job. It validates every file, converts each to responsive AVIF
at the locked sizes, uploads the renditions to the `event-images` storage bucket,
and writes the manifest to `supabase/seed/imagery-map.json`.

To preview without uploading (validate + see the plan, no network):

```
node scripts/ingest-imagery.mjs --dry-run
```

### 3. Done

`supabase/seed/imagery-map.json` is updated. Seed data and fixtures reference it
by slot (role / key / city / descriptor) to set event covers, hero images, and
tile imagery. No database row was touched - seeding rows is a separate step
(`seed-events`).

## What "validated" means (the quality floor)

A file is **rejected and not uploaded** (the run exits with an error so you
notice) when it would let a soft or low-grade image onto a luxury surface:

| Check | Floor |
|---|---|
| Bad filename | must be `role__key__city__descriptor`, role in the set, slugs kebab-case |
| Width too small | `hero` >= 1920px, `category`/`scene` >= 1440px, `city`/`venue` >= 1200px (no upscaling) |
| Height too small | >= 600px |
| File too small | >= 40KB (catches thumbnails / garbage) |

Fix or rename the flagged files and re-run. To process anyway despite warnings
(rare, e.g. a deliberately small asset), add `--force`.

## Prerequisites (one-time)

- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  (only needed for a real upload; `--dry-run` needs neither).
- The `event-images` bucket must allow the `image/avif` MIME type. If a real run
  fails with an avif-not-supported error, add `image/avif` to the bucket's
  allowed MIME types in Supabase, then re-run.

## Safety

- **Storage only.** The script's Supabase client is wrapped so only `.storage`
  is reachable; any attempt to call a data table, RPC, or auth throws. It
  structurally cannot read or write a production seed row. The output is the
  manifest, nothing else.
- **Idempotent.** Object paths are deterministic and uploads upsert, so re-running
  the same batch overwrites in place rather than duplicating.

## Flags (reference)

| Flag | Default | Meaning |
|---|---|---|
| `--src <dir>` | `design-assets/incoming` | library root |
| `--dry-run` | off | validate + convert + map only, no network |
| `--out <file>` | `supabase/seed/imagery-map.json` | manifest path |
| `--bucket <name>` | `event-images` | storage bucket |
| `--prefix <path>` | `stock` | key prefix inside the bucket |
| `--quality <n>` | `62` | AVIF quality (1-100) |
| `--force` | off | process despite validation failures (logged as warnings) |

## Back-compat: the folder-tree library

An existing nested library still works, so you can also drop into role folders
instead of using the flat naming convention:

```
design-assets/incoming/hero/<name>.jpg
design-assets/incoming/categories/<category>/<name>.jpg
design-assets/incoming/scenes/<scene>/<name>.jpg
design-assets/incoming/cities/<name>.jpg
design-assets/incoming/venues/<name>.jpg
```

The flat convention is the recommended photo-day path; the tree is read in the
same run for anyone with an existing library.
