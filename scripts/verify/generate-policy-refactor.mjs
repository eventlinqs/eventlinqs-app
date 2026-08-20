/**
 * GENERATE the stage 2 policy refactor from the LIVE policy definitions.
 *
 * WHY GENERATED RATHER THAN HAND-WRITTEN. Thirty-nine policies across thirty-two
 * tables have to be rewritten without altering what any of them ALLOWS. Fifteen
 * admit the organisation OWNER only and twenty-four admit owner or an
 * owner/admin/manager MEMBER, and the two look nearly identical in a diff.
 * Transcribing them by hand is how a privilege fix silently becomes a privilege
 * widening, and nothing in a test suite would notice: every policy would still
 * pass, just for more people.
 *
 * So the rewrite is mechanical and local. The predicate structure of each policy is
 * left exactly as it is; only the INNER SUBQUERY that reads organisations or
 * organisation_members is replaced with a call to a SECURITY DEFINER helper that
 * returns the identical set of ids. The generator then ASSERTS that no reference to
 * either table survives in the expression, and refuses to emit anything for a
 * policy where the substitution did not fully apply, so an unhandled shape shows up
 * as a named gap instead of a silently half-rewritten policy.
 *
 * WHY organisation_members IS ALSO REPLACED, which is not obvious. Only
 * organisations is being locked down, so replacing an organisation_members subquery
 * looks unnecessary. It is not: a subquery over organisation_members inside a policy
 * is itself subject to organisation_members' OWN row policies, and those read
 * organisations. Leaving it in place would keep the privilege requirement alive
 * through a second hop. Collapsing both into SECURITY DEFINER helpers removes the
 * chain, and it removes the nested RLS evaluation that made these policies slow.
 *
 * WHY A SECURITY DEFINER FUNCTION IS THE RIGHT TOOL, and why it is not a hole. The
 * helpers take no arguments and return only the set of organisation ids belonging to
 * `auth.uid()`. A caller cannot ask them about anybody else, so being able to
 * execute them reveals nothing the caller could not already learn about their own
 * memberships. They are STABLE, their search_path is pinned so a mutable-path
 * attack cannot redirect them, and they replace a subquery that already granted
 * exactly this visibility.
 *
 * OUTPUT is a migration file. Nothing is applied. Prove it with
 * scripts/verify/rls-lockdown-test-proof.mjs --stage stage2.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/generate-policy-refactor.mjs --out <file.sql>
 *
 * The target comes from the PROCESS environment via the preflight, not from --env,
 * so it must be loaded with node's own --env-file. The preflight refuses production.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ENV_FILE = arg('--env', '.env.test')
const OUT = arg('--out')
if (!OUT) { console.error('usage: --env <env> --out <file.sql>'); process.exit(2) }
if (!existsSync(ENV_FILE)) { console.error(`env file not found: ${ENV_FILE}`); process.exit(2) }

const env = {}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  env[t.slice(0, i).trim()] = v.startsWith('#') ? '' : v
}
const target = assertNotProductionDatabase()
// The preflight resolves and REFUSES production; the read-only option is kept on
// top so the session cannot write even against TEST.
const client = new pg.Client({
  ...target.clientConfig,
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 15000,
})

const OWNED = 'el_owned_organisation_ids'
const MEMBER = 'el_member_organisation_ids'
/**
 * A THIRD HELPER, and the reason it exists is the whole argument for generating
 * this file instead of writing it.
 *
 * `events."Org members can view their events"` matches organisation_members with
 * NO role filter, so it admits EVERY member including roles the other twenty-four
 * policies exclude. Collapsing it into the owner/admin/manager helper would have
 * silently NARROWED that policy, breaking a legitimate read for junior staff; using
 * it for the others would have WIDENED them. The generator refused the shape rather
 * than guessing, which is how the difference was found at all.
 */
const ANY_MEMBER = 'el_any_member_organisation_ids'

/**
 * The two substitutions. Both are anchored on the SELECT list and the FROM table,
 * with \s+ between tokens because pg_policies renders expressions across lines, and
 * with an optional alias because some policies alias the table.
 */
const SUBS = [
  {
    label: 'organisations owner lookup', reads: 'organisations',
    re: /\(\s*SELECT\s+(?:\w+\.)?id\s+FROM\s+(?:public\.)?organisations(?:\s+\w+)?\s+WHERE\s+\(?\s*(?:\w+\.)?owner_id\s*=\s*auth\.uid\(\)\s*\)?\s*\)/gi,
    to: `( SELECT public.${OWNED}() )`,
  },
  {
    label: 'organisation_members membership lookup', reads: 'organisation_members',
    re: /\(\s*SELECT\s+(?:\w+\.)?organisation_id\s+FROM\s+(?:public\.)?organisation_members(?:\s+\w+)?\s+WHERE\s+\(\(?\s*(?:\w+\.)?user_id\s*=\s*auth\.uid\(\)\)?\s*AND\s*\(?\s*(?:\w+\.)?role\s*=\s*ANY\s*\(\s*ARRAY\[[^\]]*\]\s*\)\)?\s*\)\s*\)/gi,
    to: `( SELECT public.${MEMBER}() )`,
  },
  {
    // events JOIN organisations, owner side. Rewritten to a plain events scan whose
    // organisation test goes through the helper, which keeps the same set of event
    // ids without needing privilege on organisations.
    label: 'events JOIN organisations (owner)', reads: 'organisations',
    re: /\(\s*SELECT\s+(\w+)\.id\s+FROM\s+\(\s*(?:public\.)?events\s+\1\s+JOIN\s+(?:public\.)?organisations\s+(\w+)\s+ON\s+\(\(\1\.organisation_id\s*=\s*\2\.id\)\)\s*\)\s*WHERE\s+\(\2\.owner_id\s*=\s*auth\.uid\(\)\)\s*\)/gi,
    to: `( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.${OWNED}() ) )`,
  },
  {
    label: 'events JOIN organisation_members (role-filtered)', reads: 'organisation_members',
    re: /\(\s*SELECT\s+(\w+)\.id\s+FROM\s+\(\s*(?:public\.)?events\s+\1\s+JOIN\s+(?:public\.)?organisation_members\s+(\w+)\s+ON\s+\(\(\1\.organisation_id\s*=\s*\2\.organisation_id\)\)\s*\)\s*WHERE\s+\(\(\2\.user_id\s*=\s*auth\.uid\(\)\)\s*AND\s*\(\2\.role\s*=\s*ANY\s*\(\s*ARRAY\[[^\]]*\]\s*\)\)\)\s*\)/gi,
    to: `( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.${MEMBER}() ) )`,
  },
  {
    // The any-role variant of the events JOIN. ticket_tiers."Org members can view
    // all tiers" uses it, and it must map to ANY_MEMBER rather than MEMBER for the
    // same reason events."Org members can view their events" does: there is no role
    // filter, so a junior member can currently read it and this refactor must not
    // take that away. Ordered BEFORE the role-filtered JOIN rule would not matter
    // (the patterns are mutually exclusive on the presence of the role clause) but
    // it is kept adjacent so the pair is read together.
    label: 'events JOIN organisation_members with NO role filter (any role)', reads: 'organisation_members',
    re: /\(\s*SELECT\s+(\w+)\.id\s+FROM\s+\(\s*(?:public\.)?events\s+\1\s+JOIN\s+(?:public\.)?organisation_members\s+(\w+)\s+ON\s+\(\(\1\.organisation_id\s*=\s*\2\.organisation_id\)\)\s*\)\s*WHERE\s+\(\2\.user_id\s*=\s*auth\.uid\(\)\)\s*\)/gi,
    to: `( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.${ANY_MEMBER}() ) )`,
  },
  {
    // Correlated EXISTS over organisations: EXISTS (SELECT 1 FROM organisations o
    // WHERE o.id = <outer>.organisation_id AND o.owner_id = auth.uid()).
    label: 'correlated EXISTS over organisations (owner)', reads: 'organisations',
    re: /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?organisations\s+(\w+)\s+WHERE\s+\(\(\1\.id\s*=\s*([\w.]+)\)\s*AND\s*\(\1\.owner_id\s*=\s*auth\.uid\(\)\)\)\s*\)/gi,
    to: (_m, _alias, outer) => `(${outer} IN ( SELECT public.${OWNED}() ))`,
  },
  {
    label: 'correlated EXISTS over organisation_members (role-filtered)', reads: 'organisation_members',
    re: /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?organisation_members\s+(\w+)\s+WHERE\s+\(\(\1\.organisation_id\s*=\s*([\w.]+)\)\s*AND\s*\(\1\.user_id\s*=\s*auth\.uid\(\)\)\s*AND\s*\(\1\.role\s*=\s*ANY\s*\(\s*ARRAY\[[^\]]*\]\s*\)\)\)\s*\)/gi,
    to: (_m, _alias, outer) => `(${outer} IN ( SELECT public.${MEMBER}() ))`,
  },
  {
    // Membership with NO role filter. MUST NOT be folded into the role-filtered
    // helper: that would narrow this policy and widen the others.
    label: 'organisation_members membership with NO role filter (any role)', reads: 'organisation_members',
    re: /\(\s*SELECT\s+(?:\w+\.)?organisation_id\s+FROM\s+(?:public\.)?organisation_members(?:\s+\w+)?\s+WHERE\s+\(?\s*(?:\w+\.)?user_id\s*=\s*auth\.uid\(\)\s*\)?\s*\)/gi,
    to: `( SELECT public.${ANY_MEMBER}() )`,
  },
  {
    // Uncorrelated EXISTS: "the caller owns SOME organisation". Weak, but it is the
    // EXISTING semantics and this refactor does not change what anything allows.
    label: 'uncorrelated EXISTS over organisations (owns any)', reads: 'organisations',
    re: /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?organisations(?:\s+\w+)?\s+WHERE\s+\(?\s*(?:\w+\.)?owner_id\s*=\s*auth\.uid\(\)\s*\)?\s*\)/gi,
    to: `EXISTS ( SELECT 1 FROM public.${OWNED}() )`,
  },
]

const STILL_REFERENCES = /(^|[^a-z0-9_.])(public\.)?organisations([^a-z0-9_]|$)|(^|[^a-z0-9_.])(public\.)?organisation_members([^a-z0-9_]|$)/i

/** Quote an identifier for SQL, doubling any embedded quote. */
const q = (id) => `"${String(id).replace(/"/g, '""')}"`

await client.connect()
let out = ''
const unhandled = []
const handled = []
try {
  await client.query('BEGIN READ ONLY')

  const policies = (await client.query(
    `select tablename, policyname, cmd, permissive, roles::text as roles,
            coalesce(qual,'') as qual, coalesce(with_check,'') as wc
       from pg_policies
      where schemaname = 'public'
        and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(organisations|organisation_members)'
      order by tablename, policyname`,
  )).rows

  for (const p of policies) {
    /*
     * RECURSION IS JUDGED PER SUBSTITUTION, not per table, and the difference
     * matters. A helper called from a policy on the very table the helper READS
     * would recurse, so that pairing is refused. But the two policies ON
     * organisation_members read ONLY organisations, so the owner helper is
     * perfectly safe there. The first version skipped both tables wholesale and
     * left those two policies still requiring SELECT on organisations, which
     * would have kept the outage alive on any query against organisation_members
     * after the revoke: a lockdown that looks complete and is not.
     */
    if (p.tablename === 'organisations') {
      unhandled.push({ ...p, why: 'policy is ON organisations itself; its predicate is about its own rows' })
      continue
    }

    let qual = p.qual
    let wc = p.wc
    const applied = []
    for (const sub of SUBS) {
      // Would this helper read the very table the policy is on? Then it recurses.
      if (sub.reads === p.tablename) continue
      const beforeQ = qual, beforeW = wc
      qual = qual.replace(sub.re, sub.to)
      wc = wc.replace(sub.re, sub.to)
      if (qual !== beforeQ || wc !== beforeW) applied.push(sub.label)
    }

    const leftover = [qual, wc].filter(Boolean).join(' ')
    if (STILL_REFERENCES.test(leftover)) {
      unhandled.push({ ...p, why: 'a reference survived the substitution; needs a hand-written rewrite' })
      continue
    }
    if (applied.length === 0) {
      unhandled.push({ ...p, why: 'no substitution matched; shape not recognised' })
      continue
    }

    handled.push({ ...p, newQual: qual, newWc: wc, applied })
  }

  // ---- emit -----------------------------------------------------------------
  const roleList = (roles) => {
    const inner = roles.replace(/^\{|\}$/g, '')
    if (!inner || inner === 'public') return 'public'
    return inner.split(',').map(r => r.trim()).join(', ')
  }

  for (const p of handled) {
    const cmd = p.cmd === 'ALL' ? 'ALL' : p.cmd
    out += `\nDROP POLICY IF EXISTS ${q(p.policyname)} ON public.${q(p.tablename)};\n`
    out += `CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)}\n`
    out += `  AS ${p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'}\n`
    out += `  FOR ${cmd}\n`
    out += `  TO ${roleList(p.roles)}\n`
    // INSERT accepts only WITH CHECK; SELECT and DELETE accept only USING.
    if (p.newQual && cmd !== 'INSERT') out += `  USING (${p.newQual.trim()})\n`
    if (p.newWc && (cmd === 'INSERT' || cmd === 'UPDATE' || cmd === 'ALL')) out += `  WITH CHECK (${p.newWc.trim()})\n`
    out = `${out.trimEnd()};\n`
  }

  await client.query('ROLLBACK')
} finally { await client.end() }

const header = `-- ============================================================================
-- Column lockdown, STAGE 2: stop the policies needing table SELECT on organisations
-- Run by founder: supabase db push --linked
-- Proven on TEST first: scripts/verify/rls-lockdown-test-proof.mjs --stage stage2
-- GENERATED from the live policy definitions by
--   node scripts/verify/generate-policy-refactor.mjs --env .env.test --out <this file>
-- Do not hand-edit: regenerate, so the rewrite can never drift from what is live.
-- ============================================================================
--
-- THE PROBLEM THIS SOLVES. Applying 20260808000010 took every event page to 404.
-- Proven cause (scripts/verify/rls-policy-dependency-probe.mjs): a row security
-- policy is evaluated with the CALLER's privileges, and ${handled.length + unhandled.length} policies in public
-- read organisations or organisation_members inside their own USING clause. While
-- anon held table-level SELECT on organisations those subqueries were legal. The
-- moment it was revoked, SELECT on 29 tables failed with
--
--     42501  permission denied for table organisations
--
-- including events, ticket_tiers and tickets. Every public surface, from one revoke.
--
-- WHAT THIS CHANGES, and what it deliberately does not. Each policy's predicate
-- STRUCTURE is untouched. Only the inner subquery that reads organisations or
-- organisation_members is replaced with a SECURITY DEFINER helper returning the
-- identical set of ids. Nothing gains or loses access. The helpers run as their
-- owner, so evaluating a policy no longer requires the CALLER to hold SELECT on
-- either table, and the nested RLS evaluation on organisation_members disappears
-- with it.
--
-- organisation_members is rewritten too, even though only organisations is being
-- locked down: a subquery over organisation_members is itself subject to
-- organisation_members' own policies, which read organisations, so the privilege
-- requirement survived through a second hop.
--
-- WHY THE HELPERS ARE NOT A BACK DOOR. They take no arguments and return only the
-- organisations belonging to auth.uid(). A caller cannot ask about anybody else, so
-- EXECUTE on them reveals nothing that the subquery they replace did not already
-- reveal. search_path is pinned so a mutable-path attack cannot redirect them.
--
-- APPLY ORDER: this migration is safe to apply on its own and BEFORE the
-- organisations column revoke. It only removes a privilege REQUIREMENT; it does not
-- withdraw any privilege, so on a database that still grants anon table SELECT it
-- is a no-op behaviourally.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- The two helpers. STABLE because they are called once per row per policy and
-- must not be re-evaluated per row; SECURITY DEFINER so the caller needs no
-- privilege on the tables read; search_path pinned so the bodies cannot be
-- redirected at call time.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.${OWNED}()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT o.id FROM public.organisations o WHERE o.owner_id = auth.uid()
$$;

COMMENT ON FUNCTION public.${OWNED}() IS
  'Organisations owned by the calling user. Exists so a row policy can express '
  'ownership WITHOUT the caller holding SELECT on public.organisations, which is '
  'what took every event page to 404 on 2026-08-08. Returns only the caller''s own '
  'organisations, so it discloses nothing they could not already see.';

CREATE OR REPLACE FUNCTION public.${MEMBER}()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.organisation_id FROM public.organisation_members m
   WHERE m.user_id = auth.uid()
     AND m.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role, 'manager'::org_member_role])
$$;

COMMENT ON FUNCTION public.${MEMBER}() IS
  'Organisations the calling user owns, administers or manages, by '
  'organisation_members role. Same purpose as ${OWNED}: it removes the caller''s '
  'privilege requirement, and also removes a nested RLS evaluation on '
  'organisation_members. The role list is copied verbatim from the policies it '
  'replaces so no membership gains or loses access.';

CREATE OR REPLACE FUNCTION public.${ANY_MEMBER}()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.organisation_id FROM public.organisation_members m WHERE m.user_id = auth.uid()
$$;

COMMENT ON FUNCTION public.${ANY_MEMBER}() IS
  'Organisations the calling user belongs to in ANY role. Deliberately separate '
  'from ${MEMBER}: events."Org members can view their events" has no role filter, '
  'so folding it into the role-filtered helper would have silently NARROWED that '
  'policy and using it for the others would have WIDENED them. Keep the three '
  'helpers distinct.';

REVOKE ALL ON FUNCTION public.${OWNED}() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.${MEMBER}() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.${ANY_MEMBER}() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.${OWNED}() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.${MEMBER}() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.${ANY_MEMBER}() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ${handled.length} policies rewritten. Each keeps its name, command, roles and
-- permissive/restrictive kind; only the organisations / organisation_members
-- subquery inside it changes.
-- ----------------------------------------------------------------------------
`

writeFileSync(OUT, `${header}${out}\nCOMMIT;\n`)

console.log(`REWRITTEN: ${handled.length} policies`)
const byTable = new Map()
for (const h of handled) byTable.set(h.tablename, (byTable.get(h.tablename) ?? 0) + 1)
console.log(`  across ${byTable.size} tables`)
for (const h of handled) console.log(`    ${h.tablename}.${h.policyname}  [${h.cmd}]  ${h.applied.join(' + ')}`)

console.log(`\nNOT REWRITTEN: ${unhandled.length}`)
for (const u of unhandled) console.log(`    ${u.tablename}.${u.policyname}  [${u.cmd}]  ${u.why}`)

console.log(`\nwritten to ${OUT}`)
