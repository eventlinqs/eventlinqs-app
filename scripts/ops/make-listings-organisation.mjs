// MAKE THE LISTINGS ORGANISATION (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 6).
//
// Every host (venue) and night the city listings import makes belongs to one
// organisation until a host claims it. organisations.owner_id is NOT NULL and
// names a person's profile, so who owns it is the founder's question (question
// A in WINDOW4-STATUS.txt, 23 October 2026). This script makes it for whichever
// owner he names, and makes nothing else.
//
// Usage, from the repository root in PowerShell (the token comes from the
// Supabase CLI's own login and is never printed):
//
//   scripts\ops\with-supabase-token.ps1 node scripts/ops/make-listings-organisation.mjs --target test --owner-email <email>
//     ... --target production    production (gndnldyfudbytbboxesk); waits for Lawal's yes
//     ... --apply                write; asks the operator to type APPLY first.
//                                Without it, a dry run that writes nothing.
//
// A production apply is logged in C:\dev\PRODUCTION-WRITES.txt (operating rule 4
// of 25 September 2026).
//
// IT REFUSES BEFORE IT ACTS:
//   - no --target, or a target other than test or production;
//   - an owner email that is not exactly one profile on the target;
//   - the organisation already exists (it says who owns it, and writes nothing).
// The organisation and its owner membership are written in one statement, so
// both land or neither does. Inserting an organisation fires the platform's
// "organiser created" notification to the founder, as every organisation does.
// It proves the result by reading both rows back, never by trusting the write.

import { appendFileSync, readSync } from 'node:fs'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const SLUG = 'eventlinqs-listings'
const NAME = 'EventLinqs listings'
// Strict enough that the address can sit inside a SQL literal with nothing to escape.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

class Refusal extends Error {}

function parseArgs(argv) {
  const out = { target: null, owner: null, apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--target' || a === '--owner-email') {
      out[a === '--target' ? 'target' : 'owner'] = argv[i + 1] ?? null
      i += 1
    } else throw new Refusal(`unknown argument ${JSON.stringify(a)}`)
  }
  if (!out.target || !(out.target in TARGETS)) {
    throw new Refusal(`--target must be test or production (got ${JSON.stringify(out.target)}); there is no default`)
  }
  if (!out.owner || !EMAIL.test(out.owner)) {
    throw new Refusal(`--owner-email must be one plain email address (got ${JSON.stringify(out.owner)})`)
  }
  return out
}

/** One synchronous read of the console, so nothing of ours is pending afterwards. */
function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(256)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    return ''
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Refusal('SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts\\ops\\with-supabase-token.ps1')
  }
  const ref = TARGETS[args.target]
  const query = async (sql, readOnly) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: readOnly }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`query failed on ${args.target} (HTTP ${res.status}): ${text.slice(0, 600)}`)
    return JSON.parse(text)
  }
  console.log(`target ${args.target} (${ref}), ${args.apply ? 'APPLY' : 'dry run'}`)

  const readOrg = () =>
    query(
      `select o.id, o.name, o.status, p.email as owner_email,
              exists (select 1 from public.organisation_members m
                       where m.organisation_id = o.id and m.user_id = o.owner_id and m.role = 'owner') as owner_is_member
         from public.organisations o join public.profiles p on p.id = o.owner_id
        where o.slug = '${SLUG}'`,
      true,
    )
  const [existing] = await readOrg()
  if (existing) {
    console.log(`NOTHING TO DO: ${SLUG} exists on ${args.target} (${existing.id}), owned by ${existing.owner_email}, status ${existing.status}`)
    return 0
  }
  const owners = await query(
    `select id from public.profiles where lower(email) = lower('${args.owner}')`,
    true,
  )
  if (owners.length !== 1 || !UUID.test(owners[0].id)) {
    throw new Refusal(`${args.owner} is ${owners.length === 0 ? 'no' : `${owners.length}`} profiles on ${args.target}; it must be exactly one`)
  }
  const ownerId = owners[0].id
  console.log(`WOULD MAKE ${NAME} (slug ${SLUG}, status active), owned by ${args.owner}, with that owner as its member`)
  if (!args.apply) {
    console.log('DRY RUN: nothing written')
    return 0
  }

  const typed = askLine(`Type APPLY to make ${SLUG} on ${args.target} (${ref}), owned by ${args.owner}: `)
  if (typed !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }
  await query(
    `do $make$
     declare v_org uuid;
     begin
       insert into public.organisations (name, slug, owner_id, status)
       values ('${NAME}', '${SLUG}', '${ownerId}'::uuid, 'active')
       returning id into v_org;
       insert into public.organisation_members (organisation_id, user_id, role)
       values (v_org, '${ownerId}'::uuid, 'owner');
     end
     $make$;`,
    false,
  )
  const [made] = await readOrg()
  const ok = Boolean(made) && made.owner_email.toLowerCase() === args.owner.toLowerCase() && made.owner_is_member === true
  console.log(
    ok
      ? `APPLIED: ${SLUG} exists on ${args.target} (${made.id}), owned by ${made.owner_email}, who is its owner member; read back from the database`
      : `FAILED: read back ${JSON.stringify(made ?? null)}`,
  )
  if (ok && args.target === 'production') {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    appendFileSync(LOG, `${stamp}  founder typed APPLY: APPLIED: ${SLUG} organisation made (WI2 listings), owner ${made.owner_email}\n`)
    console.log(`LOGGED in ${LOG}`)
  }
  return ok ? 0 : 1
}

// process.exitCode rather than process.exit after network work: exiting while a
// fetch socket is still closing aborts Node on Windows (nodejs/node#56645).
main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`${error instanceof Refusal ? 'REFUSED' : 'FAILED'}: ${error.message}`)
    process.exitCode = error instanceof Refusal ? 2 : 1
  },
)
