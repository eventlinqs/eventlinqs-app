/**
 * GUARD: CONSENT IS THE TITLE DEED TO THE AUDIENCE ASSET, AND THE DATABASE HOLDS IT.
 *
 * Close-out GA1. An audience without provable consent cannot be used and cannot
 * be sold. The Spam Act 2003 is enforced hard in Australia, and the dates in
 * this paragraph were WRONG in the first version of this file, so they are
 * stated carefully now: ACMA penalised TAB 4,003,270 dollars in June 2025 and
 * 2.7 million dollars again in July 2026, largely for messages carrying no
 * unsubscribe, and penalised the Commonwealth Bank 7.5 million dollars,
 * announced in October 2024, for 34.8 million messages sent to people who had
 * not consented or had withdrawn. A broken exit and a missing consent are
 * therefore both real exposure, not one or the other. The three things GA1 asks
 * this guard to hold are the three
 * things that would make the asset worthless, and each of them is checked
 * against what the DATABASE enforces rather than against what some function
 * remembers to do.
 *
 * THE THREE GA1 CLAUSES.
 *
 *   1. AN AUDIENCE ROW CANNOT EXIST WITH CONSENT STATE NOT TRUE. The CHECK
 *      constraint must be on the table. Application logic is not enough and a
 *      prompt instruction is not enforcement: the whole point of putting it in
 *      the schema is that a future caller, a backfill script or a hand-run
 *      INSERT cannot get around it.
 *   2. THE STORED CONSENT WORDING CANNOT BE EMPTY. Evidence that says nothing is
 *      not evidence. The wording and its version are both constrained present.
 *   3. THE UNSUBSCRIBE ROUTE CANNOT REQUIRE A SESSION. An unsubscribe behind a
 *      login is the exact failure the fines above were for. The route and the
 *      action behind it must not read an auth session.
 *
 * TWO MORE, BECAUSE THEY PROTECT THE SAME ASSET FROM THE SAME KIND OF SILENCE.
 *
 *   4. THE COMMUNITY TAXONOMY IS ONE DECISION IN TWO LANGUAGES. A trigger cannot
 *      call TypeScript, so public.community_tag_map carries what
 *      src/lib/communities/tag-bridge.ts carries. If the two drift, the audience
 *      is segmented by a taxonomy the platform no longer shows, and nothing
 *      anywhere would say so.
 *   5. THE PRICE BANDS ARE ONE DECISION IN TWO LANGUAGES, for the same reason.
 *      A boundary that moves in SQL and not in TypeScript makes the admin count
 *      and the stored band disagree about the same buyer.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build host
 * with no database and no credentials. supabase/migrations survives the upload:
 * several registered guards already read it.
 *
 * Run standalone:  node scripts/guards/audience-consent-is-the-title-deed.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[audience-consent-is-the-title-deed]'

const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const TAG_BRIDGE = join(ROOT, 'src', 'lib', 'communities', 'tag-bridge.ts')
const SEGMENTS = join(ROOT, 'src', 'lib', 'audience', 'segments.ts')

/** The unsubscribe surfaces that must work with no session, and what they use. */
const NO_SESSION_SURFACES = [
  join(ROOT, 'src', 'app', 'unsubscribe', 'digest', '[token]', 'page.tsx'),
  join(ROOT, 'src', 'app', 'unsubscribe', '[token]', 'page.tsx'),
  join(ROOT, 'src', 'app', 'waitlist', 'unsubscribe', '[token]', 'page.tsx'),
]

/** Anything that proves a surface is asking who the visitor is. */
const SESSION_TELLS = [
  'auth.getUser',
  'auth.getSession',
  'requireUser',
  'requireAdminSession',
  'requireSession',
]

function readAllMigrations() {
  if (!existsSync(MIGRATIONS)) return { sql: '', files: 0 }
  const names = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  let sql = ''
  for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  return { sql, files: names.length }
}

/** Collapse whitespace so a reformatted constraint still matches. */
function flat(text) {
  return text.replace(/\s+/g, ' ')
}

/**
 * Parse `('slug', array['a', 'b'])` rows out of the community_tag_map seed.
 * Deliberately narrow: it reads the one INSERT this guard is about, and reports
 * finding nothing rather than passing when the shape it expects is gone.
 */
function parseSeededCommunityMap(sql) {
  const start = sql.indexOf('insert into public.community_tag_map')
  if (start === -1) return null
  const end = sql.indexOf(';', start)
  if (end === -1) return null
  const body = sql.slice(start, end)
  const out = new Map()
  const row = /\(\s*'([^']+)'\s*,\s*array\[([^\]]*)\]\s*\)/g
  let m
  while ((m = row.exec(body)) !== null) {
    const tokens = [...m[2].matchAll(/'([^']*)'/g)].map(t => t[1])
    out.set(m[1], tokens)
  }
  return out.size > 0 ? out : null
}

/** Parse the same map out of the TypeScript bridge. */
function parseBridgeCommunityMap(source) {
  const start = source.indexOf('COMMUNITY_TO_TAGS')
  if (start === -1) return null
  const open = source.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return null
  const body = source.slice(open + 1, end)
  const out = new Map()
  const entry = /(?:'([^']+)'|([A-Za-z_][\w-]*))\s*:\s*\[([^\]]*)\]/g
  let m
  while ((m = entry.exec(body)) !== null) {
    const slug = m[1] ?? m[2]
    const tokens = [...m[3].matchAll(/'([^']*)'/g)].map(t => t[1])
    out.set(slug, tokens)
  }
  return out.size > 0 ? out : null
}

/** The lower bound of every price band, from the SQL CASE. */
function parseSqlPriceBands(sql) {
  const start = sql.indexOf('function public.audience_price_band')
  if (start === -1) return null
  const end = sql.indexOf('$$;', start)
  if (end === -1) return null
  const body = sql.slice(start, end)
  const out = []
  for (const m of body.matchAll(/when p_unit_cents\s*<\s*(\d+)\s*then\s*'([^']+)'/g)) {
    out.push({ band: m[2], underCents: Number(m[1]) })
  }
  return out.length > 0 ? out : null
}

/** The same boundaries, from the TypeScript. */
function parseTsPriceBands(source) {
  const start = source.indexOf('export function priceBandOf')
  if (start === -1) return null
  const body = source.slice(start, start + 1200)
  const out = []
  for (const m of body.matchAll(/if\s*\(unitCents\s*<\s*(\d+)\)\s*return\s*'([^']+)'/g)) {
    out.push({ band: m[2], underCents: Number(m[1]) })
  }
  return out.length > 0 ? out : null
}

function main() {
  const problems = []
  const { sql, files } = readAllMigrations()
  const migrationSql = flat(sql)
  let _filesRead = files

  // ── 1. the audience row cannot exist without consent ──────────────────────
  const consentTrue = /constraint audience_members_consent_must_be_true check \(\s*consent_state is true\s*\)/
  if (!consentTrue.test(migrationSql)) {
    problems.push(
      'no migration constrains audience_members.consent_state to TRUE. GA1 point 4 requires ' +
        'this in the DATABASE, not in application logic: a backfill, a hand-run INSERT or the ' +
        'next caller must be refused by the schema, not trusted to remember.',
    )
  }

  // ── 2. the stored wording cannot be empty ─────────────────────────────────
  const wordingPresent = /constraint audience_members_consent_text_present check \(\s*length\(btrim\(consent_text\)\) > 0\s*\)/
  if (!wordingPresent.test(migrationSql)) {
    problems.push(
      'no migration constrains audience_members.consent_text to be non-empty. A consent record ' +
        'whose wording says nothing is not evidence of anything, and it is exactly what an ' +
        'audit of the list would ask to see.',
    )
  }
  const versionPresent = /constraint audience_members_consent_version_present check \(\s*length\(btrim\(consent_version\)\) > 0\s*\)/
  if (!versionPresent.test(migrationSql)) {
    problems.push(
      'no migration constrains audience_members.consent_version to be non-empty. Without the ' +
        'version the wording cannot be tied to the copy that was actually on screen.',
    )
  }

  // ── 3. the unsubscribe route cannot require a session ─────────────────────
  let surfacesRead = 0
  for (const file of NO_SESSION_SURFACES) {
    if (!existsSync(file)) {
      problems.push(
        `${file.replace(ROOT + '\\', '').replace(ROOT + '/', '')} is missing. An unsubscribe link ` +
          'already in somebody\'s inbox must keep working; deleting the page that serves it is ' +
          'the broken unsubscribe the Spam Act fines are for.',
      )
      continue
    }
    surfacesRead++
    const source = readFileSync(file, 'utf8')
    for (const tell of SESSION_TELLS) {
      if (source.includes(tell)) {
        problems.push(
          `${file.replace(ROOT + '\\', '').replace(ROOT + '/', '')} calls ${tell}, so the ` +
            'unsubscribe asks who the visitor is. An unsubscribe behind a login is the failure ' +
            'the Spam Act enforcement actually punishes: the consent was fine and the exit was not.',
        )
      }
    }
  }
  _filesRead += surfacesRead

  // ── 4. the community taxonomy is one decision in two languages ────────────
  let communitiesCompared = 0
  const seeded = parseSeededCommunityMap(sql)
  const bridge = existsSync(TAG_BRIDGE) ? parseBridgeCommunityMap(readFileSync(TAG_BRIDGE, 'utf8')) : null
  if (!seeded) {
    problems.push(
      'the community_tag_map seed could not be read out of supabase/migrations. The audience ' +
        'resolves a buyer\'s communities through that table, so an unreadable seed means the ' +
        'guard can no longer tell whether SQL and TypeScript agree.',
    )
  } else if (!bridge) {
    problems.push('COMMUNITY_TO_TAGS could not be read out of src/lib/communities/tag-bridge.ts')
  } else {
    _filesRead++
    for (const slug of new Set([...seeded.keys(), ...bridge.keys()])) {
      const a = seeded.get(slug)
      const b = bridge.get(slug)
      if (!a) { problems.push(`community ${slug} is in the tag bridge and not in community_tag_map`); continue }
      if (!b) { problems.push(`community ${slug} is in community_tag_map and not in the tag bridge`); continue }
      communitiesCompared++
      const missing = b.filter(t => !a.includes(t))
      const extra = a.filter(t => !b.includes(t))
      if (missing.length > 0) {
        problems.push(`community ${slug}: community_tag_map is missing ${missing.join(', ')}`)
      }
      if (extra.length > 0) {
        problems.push(`community ${slug}: community_tag_map carries ${extra.join(', ')} which the bridge does not`)
      }
    }
  }

  // ── 5. the price bands are one decision in two languages ──────────────────
  let bandsCompared = 0
  const sqlBands = parseSqlPriceBands(sql)
  const tsBands = existsSync(SEGMENTS) ? parseTsPriceBands(readFileSync(SEGMENTS, 'utf8')) : null
  if (!sqlBands) {
    problems.push('public.audience_price_band could not be read out of supabase/migrations')
  } else if (!tsBands) {
    problems.push('priceBandOf could not be read out of src/lib/audience/segments.ts')
  } else {
    _filesRead++
    if (sqlBands.length !== tsBands.length) {
      problems.push(
        `the price bands disagree on how many there are: SQL has ${sqlBands.length} boundaries, ` +
          `src/lib/audience/segments.ts has ${tsBands.length}`,
      )
    }
    /*
     * THE TWO ENDS, WHICH THE MIDDLE LOOP CANNOT SEE. The free rule and the top
     * band are not "under N" clauses, so a boundary comparison alone would pass
     * a build where SQL called a zero-cost ticket 'under-30' and TypeScript
     * called it 'free'. Both ends are named here explicitly.
     */
    const sqlFree = /when p_unit_cents <= 0 then 'free'/.test(migrationSql)
    const tsFree = /if \(unitCents <= 0\) return 'free'/.test(readFileSync(SEGMENTS, 'utf8'))
    if (!sqlFree || !tsFree) {
      problems.push(
        `the free rule is not stated in both languages: SQL ${sqlFree ? 'has' : 'is missing'} it, ` +
          `src/lib/audience/segments.ts ${tsFree ? 'has' : 'is missing'} it. A free ticket must ` +
          "band as 'free' in both or the stored band and the admin count describe different buyers.",
      )
    } else {
      bandsCompared++
    }
    const sqlTop = /else '200-plus'/.test(migrationSql)
    const tsTop = /return '200-plus'/.test(readFileSync(SEGMENTS, 'utf8'))
    if (!sqlTop || !tsTop) {
      problems.push(
        `the top band is not stated in both languages: SQL ${sqlTop ? 'has' : 'is missing'} ` +
          `'200-plus', src/lib/audience/segments.ts ${tsTop ? 'has' : 'is missing'} it.`,
      )
    } else {
      bandsCompared++
    }
    for (let i = 0; i < Math.min(sqlBands.length, tsBands.length); i++) {
      bandsCompared++
      if (sqlBands[i].band !== tsBands[i].band || sqlBands[i].underCents !== tsBands[i].underCents) {
        problems.push(
          `price band ${i + 1} disagrees: SQL says under ${sqlBands[i].underCents} is ` +
            `'${sqlBands[i].band}', TypeScript says under ${tsBands[i].underCents} is '${tsBands[i].band}'`,
        )
      }
    }
  }

  declareWork('audience-consent-is-the-title-deed', {
    did: {
      'migration file read': files,
      'unsubscribe surface read': surfacesRead,
      'community compared': communitiesCompared,
      'price boundary compared': bandsCompared,
    },
    found: { 'way the asset could lose its title deed': problems.length },
    zeroIsFine: {
      'way the asset could lose its title deed':
        'zero is the goal state; an audience without provable consent cannot be used and cannot be sold',
    },
    exitOnZero: false,
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  Consent is the title deed to this asset. Every campaign that is ever built')
    console.error('  on it inherits whatever is wrong here, and the failure the regulator')
    console.error('  actually punishes is the exit, not the entry.')
    process.exitCode = 1
    return
  }

  console.log(
    `${TAG} PASS - the database refuses an unconsented audience row and an empty consent wording, ` +
      `the ${surfacesRead} unsubscribe surfaces ask nobody to log in, and the ${communitiesCompared} ` +
      `communities and ${bandsCompared} price boundaries say the same thing in SQL and TypeScript.`,
  )
}

main()
