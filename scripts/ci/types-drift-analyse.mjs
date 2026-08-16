// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this via scripts/ci/types-drift-guard.mjs.
/**
 * TYPES ARE STALE, versus MIGRATIONS ARE PENDING. They are OPPOSITE problems.
 *
 * THE DESIGN FLAW THIS CLOSES. The old guard asked one question - "does the
 * committed types file equal the types regenerated from the live database?" -
 * and reported every inequality as drift with one remedy: regenerate from the
 * live database. That remedy is correct for exactly one of the two conditions
 * the question conflates, and actively destructive for the other:
 *
 *   TYPES ARE STALE      the live schema has moved and the committed types have
 *                        not caught up. A real defect. The fix is to regenerate.
 *
 *   MIGRATIONS ARE PENDING
 *                        the committed types are correct for the schema the
 *                        repository's migrations DEFINE, and the target database
 *                        has not had those migrations applied yet. Expected and
 *                        correct. Regenerating would overwrite correct types with
 *                        the pre-migration shape, DELETING the work, and would
 *                        then fail typecheck against the code that uses it.
 *
 * The second state is not hypothetical or rare. It is the NORMAL state of any
 * change that ships a migration, because the repository is merged before the
 * migration is applied, and on this platform it is sometimes the ONLY safe
 * order: 20260808000010 revokes anon column privileges that main's deployed code
 * still reads, so applying it before that code ships takes every paid event off
 * sale. A guard that demands the database move first cannot be satisfied without
 * causing an outage.
 *
 * WHAT THIS MODULE DOES INSTEAD. It computes the schema deltas between the
 * committed types and the live types, then tries to ATTRIBUTE each delta to DDL
 * in a migration file that is present in the repository but NOT YET APPLIED to
 * the target. Attribution is directional: a pending `ADD COLUMN` explains a
 * column the COMMITTED types have and the LIVE database lacks, and explains
 * nothing in the other direction. If every delta is attributed, the tree is
 * self-consistent and the guard reports PENDING and passes, naming the
 * migrations. If even one delta is not attributed, that is drift and it fails.
 *
 * IT IS NOT A RELAXATION. Three things are checked now that were not before:
 *   1. A column present in LIVE and absent from COMMITTED still fails, exactly
 *      as before - that is the stale-types defect, and no pending migration can
 *      explain it unless it actually DROPS that column.
 *   2. A column present in COMMITTED that NO migration in the repository ever
 *      creates now fails. The old guard could not tell an invented type from a
 *      pending one; it called both drift and prescribed a regeneration that
 *      would silently delete a hand-edited type without anybody noticing.
 *   3. Any delta this module cannot classify fails. Unrecognised is never
 *      treated as explained.
 *
 * The applied-migration list comes from the Supabase Management API's
 * "List applied migration versions" endpoint, GET
 * /v1/projects/{ref}/database/migrations, which returns [{version, name}]
 * (https://api.supabase.com/api/v1-json, fetched 16 August 2026). It is a READ.
 * Nothing in this guard writes to any database.
 */

/* -------------------------------------------------------------------------- */
/* 1. Parsing the generated types file                                        */
/* -------------------------------------------------------------------------- */

/**
 * Parse a `supabase gen types --lang=typescript` file into a flat map of
 * dotted paths to leaf descriptors.
 *
 * `public.Tables.share_links.Row.event_id` -> { optional: false, type: 'string | null' }
 *
 * The generated file is machine-written with strictly consistent two-space
 * indentation, which is what makes an indentation walk safe here. A general
 * TypeScript parser would be more correct in the abstract and worse in
 * practice: it would need the compiler as a dependency of a guard whose whole
 * job is to run early and cheaply.
 *
 * Bracketed blocks (`Relationships: [ ... ]`) are captured as a single
 * normalised blob per path rather than walked, so a foreign-key change is still
 * visible as one delta instead of vanishing or exploding into noise.
 */
export function parseGeneratedTypes(text) {
  const leaves = new Map()
  const lines = String(text).split(/\r?\n/)

  // Only walk inside `export type Database = {`. Everything above it is the
  // Json helper type and everything below is the generated tail helpers.
  let start = lines.findIndex((l) => /^export type Database = \{/.test(l))
  if (start === -1) return leaves

  const stack = []
  const indentOf = (l) => l.match(/^ */)[0].length
  const unquote = (s) => s.replace(/^"(.*)"$/, '$1')

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    if (/^\}/.test(raw)) break // end of `export type Database`

    const indent = indentOf(raw)
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop()

    const line = raw.trim()
    if (line === '}' || line === '},' || line === '{') continue
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue

    // `key: {`  -> descend
    const open = line.match(/^("?[A-Za-z_$][\w$]*"?|\[[^\]]*\]):\s*\{$/)
    if (open) {
      stack.push({ key: unquote(open[1]), indent })
      continue
    }

    // `key: [`  -> capture the whole bracket block as one normalised blob
    const arr = line.match(/^("?[A-Za-z_$][\w$]*"?):\s*\[$/)
    if (arr) {
      const parts = []
      let j = i + 1
      for (; j < lines.length; j++) {
        const inner = lines[j]
        if (indentOf(inner) <= indent && /^\s*\]/.test(inner)) break
        if (inner.trim()) parts.push(inner.trim())
      }
      const path = [...stack.map((s) => s.key), unquote(arr[1])].join('.')
      leaves.set(path, { optional: false, type: parts.join(' ').replace(/\s+/g, ' ') })
      i = j
      continue
    }

    // `key: value` or `key?: value`, with the value possibly continued on
    // following lines that begin with `|` (long enum unions wrap).
    const leaf = line.match(/^("?[A-Za-z_$][\w$]*"?)(\?)?:\s*(.+?)$/)
    if (leaf) {
      let value = leaf[3]
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) {
        value += ' ' + lines[i + 1].trim()
        i++
      }
      const path = [...stack.map((s) => s.key), unquote(leaf[1])].join('.')
      leaves.set(path, {
        optional: Boolean(leaf[2]),
        type: value.replace(/,$/, '').replace(/\s+/g, ' ').trim(),
      })
    }
  }

  return leaves
}

/* -------------------------------------------------------------------------- */
/* 2. Diffing two parsed schemas                                              */
/* -------------------------------------------------------------------------- */

const stripNull = (t) => t.replace(/\s*\|\s*null\s*$/, '').trim()

/*
 * NULLABILITY AND OPTIONALITY ARE DIFFERENT THINGS, and the first version of
 * this module treated them as one. `| null` says the column can HOLD null;
 * the `?` marker says the key may be OMITTED from an Insert or an Update.
 * Dropping NOT NULL moves both, but they do not always move together, and an
 * Update section is optional on EVERY column regardless of nullability.
 *
 * The drill caught it on its first run: share_links.Update.event_id is `?` on
 * both sides, so a combined test saw "nullish both sides", declined to call it
 * became-nullable, fell through to type-changed, found no `ALTER COLUMN ... TYPE`
 * to match, and reported the pending migration as unexplained drift. The guard
 * would have kept failing PR #118 for a different wrong reason.
 */
const hasNull = (leaf) => /\|\s*null\s*$/.test(leaf.type)

/**
 * Deltas are expressed FROM THE LIVE DATABASE TOWARDS THE COMMITTED TYPES,
 * because that is the direction a pending migration travels. `added` means the
 * committed types carry something the live database does not yet have.
 */
export function diffSchemas(committed, live) {
  const deltas = []
  const paths = new Set([...committed.keys(), ...live.keys()])

  for (const path of [...paths].sort()) {
    const c = committed.get(path)
    const l = live.get(path)

    if (c && !l) {
      deltas.push({ path, kind: 'added', committed: c, live: null })
      continue
    }
    if (!c && l) {
      deltas.push({ path, kind: 'removed', committed: null, live: l })
      continue
    }
    if (c.type === l.type && c.optional === l.optional) continue

    if (stripNull(c.type) === stripNull(l.type)) {
      if (hasNull(c) && !hasNull(l)) {
        deltas.push({ path, kind: 'became-nullable', committed: c, live: l })
        continue
      }
      if (!hasNull(c) && hasNull(l)) {
        deltas.push({ path, kind: 'became-non-nullable', committed: c, live: l })
        continue
      }
      // Same underlying type, same nullability: the key's optionality moved on
      // its own, which is what a DEFAULT being added or removed looks like in
      // the Insert section.
      if (c.optional !== l.optional) {
        deltas.push({ path, kind: 'optionality-changed', committed: c, live: l })
        continue
      }
    }
    deltas.push({ path, kind: 'type-changed', committed: c, live: l })
  }

  return deltas
}

/* -------------------------------------------------------------------------- */
/* 3. Parsing migration DDL                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Strip comments and dollar-quoted bodies, then split into statements.
 *
 * The dollar-quote strip is not decoration. 20260808000006 defines a plpgsql
 * trigger function whose body contains several semicolons inside `$$ ... $$`;
 * splitting on `;` without removing it first shreds one statement into five
 * fragments and the DDL either side of it stops parsing.
 */
export function splitSqlStatements(sql) {
  let s = String(sql)
  s = s.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ') // dollar-quoted bodies
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
  s = s.replace(/--[^\n]*/g, ' ') // line comments
  return s
    .split(';')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const bare = (name) => String(name).replace(/^"?public"?\./i, '').replace(/"/g, '').toLowerCase()

/**
 * Extract the schema-shaping DDL from one migration file.
 *
 * Deliberately narrow: it recognises the statements that can move a GENERATED
 * TYPE, and nothing else. An index, a grant, a policy, a comment or a trigger
 * cannot change the shape of `Database`, so they are not modelled, and a
 * statement that is not recognised simply explains nothing - it can never
 * accidentally justify a delta.
 */
export function parseMigrationDdl(sql) {
  const out = []
  for (const stmt of splitSqlStatements(sql)) {
    const alter = stmt.match(/^alter\s+table\s+(?:if\s+exists\s+)?([\w".]+)\s+(.*)$/i)
    if (alter) {
      const table = bare(alter[1])
      const body = alter[2]

      for (const m of body.matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/gi)) {
        out.push({ kind: 'add-column', table, column: bare(m[1]) })
      }
      for (const m of body.matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?([\w"]+)/gi)) {
        out.push({ kind: 'drop-column', table, column: bare(m[1]) })
      }
      for (const m of body.matchAll(/\balter\s+column\s+([\w"]+)\s+drop\s+not\s+null/gi)) {
        out.push({ kind: 'drop-not-null', table, column: bare(m[1]) })
      }
      for (const m of body.matchAll(/\balter\s+column\s+([\w"]+)\s+set\s+not\s+null/gi)) {
        out.push({ kind: 'set-not-null', table, column: bare(m[1]) })
      }
      for (const m of body.matchAll(/\balter\s+column\s+([\w"]+)\s+(?:set\s+data\s+)?type\s+/gi)) {
        out.push({ kind: 'set-type', table, column: bare(m[1]) })
      }
      // A DEFAULT does not change a column's TYPE, but it does change whether
      // the generated Insert marks the key optional, so it has to be modelled
      // or a legitimate pending migration reports as unexplained drift.
      for (const m of body.matchAll(/\balter\s+column\s+([\w"]+)\s+set\s+default\b/gi)) {
        out.push({ kind: 'set-default', table, column: bare(m[1]) })
      }
      for (const m of body.matchAll(/\balter\s+column\s+([\w"]+)\s+drop\s+default\b/gi)) {
        out.push({ kind: 'drop-default', table, column: bare(m[1]) })
      }
      continue
    }

    let m
    if ((m = stmt.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/i))) {
      out.push({ kind: 'create-table', table: bare(m[1]) })
    } else if ((m = stmt.match(/^drop\s+table\s+(?:if\s+exists\s+)?([\w".]+)/i))) {
      out.push({ kind: 'drop-table', table: bare(m[1]) })
    } else if ((m = stmt.match(/^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w".]+)/i))) {
      out.push({ kind: 'create-view', table: bare(m[1]) })
    } else if ((m = stmt.match(/^drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?([\w".]+)/i))) {
      out.push({ kind: 'drop-view', table: bare(m[1]) })
    } else if ((m = stmt.match(/^create\s+type\s+([\w".]+)/i))) {
      out.push({ kind: 'create-type', name: bare(m[1]) })
    } else if ((m = stmt.match(/^alter\s+type\s+([\w".]+)\s+add\s+value/i))) {
      out.push({ kind: 'alter-type-add-value', name: bare(m[1]) })
    } else if ((m = stmt.match(/^create\s+(?:or\s+replace\s+)?function\s+([\w".]+)/i))) {
      out.push({ kind: 'create-function', name: bare(m[1]) })
    } else if ((m = stmt.match(/^drop\s+function\s+(?:if\s+exists\s+)?([\w".]+)/i))) {
      out.push({ kind: 'drop-function', name: bare(m[1]) })
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* 4. Attribution                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Break `public.Tables.share_links.Row.event_id` into its parts. Returns null
 * for any path shape this module does not model, which then reports as
 * unexplained rather than being waved through.
 */
export function describePath(path) {
  const parts = path.split('.')
  // <schema>.Tables|Views.<table>.<Row|Insert|Update>.<column>
  if (parts.length === 5 && (parts[1] === 'Tables' || parts[1] === 'Views')) {
    return { type: 'column', container: parts[1], table: parts[2].toLowerCase(), section: parts[3], column: parts[4].toLowerCase() }
  }
  // <schema>.Tables|Views.<table>.Relationships
  if (parts.length === 4 && (parts[1] === 'Tables' || parts[1] === 'Views') && parts[3] === 'Relationships') {
    return { type: 'relationships', table: parts[2].toLowerCase() }
  }
  // <schema>.Enums.<name>
  if (parts.length === 3 && parts[1] === 'Enums') {
    return { type: 'enum', name: parts[2].toLowerCase() }
  }
  // <schema>.Functions.<name>....
  if (parts.length >= 3 && parts[1] === 'Functions') {
    return { type: 'function', name: parts[2].toLowerCase() }
  }
  // <schema>.CompositeTypes.<name>....
  if (parts.length >= 3 && parts[1] === 'CompositeTypes') {
    return { type: 'composite', name: parts[2].toLowerCase() }
  }
  return null
}

/**
 * Can this delta be explained by this pending migration's DDL?
 *
 * Direction is enforced everywhere. `added` (committed has it, live does not)
 * is explained ONLY by DDL that CREATES; `removed` (live has it, committed does
 * not) ONLY by DDL that DROPS. Matching on the mere mention of a table or column
 * name would let an unrelated migration launder a genuine staleness, which is
 * the failure this guard exists to catch.
 */
export function ddlExplainsDelta(delta, ddl) {
  const at = describePath(delta.path)
  if (!at) return false

  const has = (pred) => ddl.some(pred)

  if (at.type === 'column') {
    const t = at.table
    const c = at.column
    switch (delta.kind) {
      case 'added':
        return has(
          (d) =>
            (d.kind === 'add-column' && d.table === t && d.column === c) ||
            (d.kind === 'create-table' && d.table === t) ||
            (d.kind === 'create-view' && d.table === t),
        )
      case 'removed':
        return has(
          (d) =>
            (d.kind === 'drop-column' && d.table === t && d.column === c) ||
            (d.kind === 'drop-table' && d.table === t) ||
            (d.kind === 'create-view' && d.table === t) ||
            (d.kind === 'drop-view' && d.table === t),
        )
      case 'became-nullable':
        return has(
          (d) =>
            (d.kind === 'drop-not-null' && d.table === t && d.column === c) ||
            (d.kind === 'create-view' && d.table === t),
        )
      case 'became-non-nullable':
        return has(
          (d) =>
            (d.kind === 'set-not-null' && d.table === t && d.column === c) ||
            (d.kind === 'create-view' && d.table === t),
        )
      case 'optionality-changed':
        return has(
          (d) =>
            (['set-default', 'drop-default', 'drop-not-null', 'set-not-null'].includes(d.kind) && d.table === t && d.column === c) ||
            (d.kind === 'create-view' && d.table === t),
        )
      case 'type-changed':
        return has(
          (d) =>
            (d.kind === 'set-type' && d.table === t && d.column === c) ||
            (d.kind === 'create-view' && d.table === t),
        )
      default:
        return false
    }
  }

  if (at.type === 'relationships') {
    // A foreign key moved. Only a migration that touches THIS table's
    // constraints or recreates it can account for that.
    return has((d) => (d.table === at.table && ['create-table', 'drop-table', 'add-column', 'drop-column'].includes(d.kind)) || (d.kind === 'create-view' && d.table === at.table))
  }

  if (at.type === 'enum' || at.type === 'composite') {
    return has((d) => (d.kind === 'create-type' || d.kind === 'alter-type-add-value') && d.name === at.name)
  }

  if (at.type === 'function') {
    return has((d) => (d.kind === 'create-function' || d.kind === 'drop-function') && d.name === at.name)
  }

  return false
}

/* -------------------------------------------------------------------------- */
/* 5. The verdict                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} input
 * @param {string} input.committedText  committed types, appendix already stripped
 * @param {string} input.liveText       types regenerated from the target database
 * @param {Array<{version:string,file:string,sql:string}>} input.pending
 *        migrations present in the repository and NOT applied to the target
 * @returns {{status:'in-sync'|'pending-migrations'|'drift', deltas:Array, explained:Array, unexplained:Array, migrations:Array<string>}}
 */
export function analyse({ committedText, liveText, pending }) {
  const committed = parseGeneratedTypes(committedText)
  const live = parseGeneratedTypes(liveText)
  const deltas = diffSchemas(committed, live)

  if (deltas.length === 0) {
    return { status: 'in-sync', deltas, explained: [], unexplained: [], migrations: [] }
  }

  const parsed = pending.map((p) => ({ ...p, ddl: parseMigrationDdl(p.sql) }))

  const explained = []
  const unexplained = []
  const migrations = new Set()

  for (const delta of deltas) {
    const by = parsed.find((p) => ddlExplainsDelta(delta, p.ddl))
    if (by) {
      explained.push({ delta, by: by.file })
      migrations.add(by.file)
    } else {
      unexplained.push(delta)
    }
  }

  return {
    status: unexplained.length === 0 ? 'pending-migrations' : 'drift',
    deltas,
    explained,
    unexplained,
    migrations: [...migrations].sort(),
  }
}

/* -------------------------------------------------------------------------- */
/* 6. Rendering the verdict                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Turn a verdict into the exact lines the guard prints and the exit code it
 * exits with.
 *
 * This lives here, beside the decision, so the drill in
 * scripts/verify/types-drift-drill.mjs exercises the REAL reporting path rather
 * than a second copy of it that could agree with the guard today and diverge
 * from it quietly later. A drill that tests a re-implementation of the thing it
 * is drilling proves nothing about the thing.
 *
 * @returns {{lines: string[], exitCode: 0|1}}
 */
export function renderVerdict(result, { committedPath, projectId, migrationsDir, marker = '// BEGIN LEGACY ALIASES' }) {
  const L = []
  const p = (s = '') => L.push(`[types-drift] ${s}`.trimEnd())

  if (result.status === 'in-sync') {
    p(`OK: ${committedPath} generated section matches the live schema of ${projectId}.`)
    return { lines: L, exitCode: 0 }
  }

  if (result.status === 'pending-migrations') {
    p()
    p('MIGRATIONS PENDING - not drift. Passing.')
    p()
    p(`Every one of the ${result.deltas.length} difference(s) between ${committedPath} and the live`)
    p(`schema of ${projectId} is accounted for by a migration that is committed to this`)
    p('repository and has NOT been applied to that database yet:')
    p()
    for (const file of result.migrations) {
      p(`  PENDING  ${migrationsDir}/${file}`)
      for (const e of result.explained.filter((x) => x.by === file)) {
        p(`      explains  ${e.delta.kind.padEnd(20)} ${e.delta.path}`)
      }
    }
    p()
    p('The committed types are correct for the POST-migration schema, which is the')
    p('schema the merged tree compiles against. Do NOT regenerate them from the live')
    p('database: that would replace correct types with the pre-migration shape.')
    p()
    p("Apply them with 'supabase db push --linked' when the ordering is safe. Until")
    p('then this state is expected, and this guard will keep reporting it by name.')
    return { lines: L, exitCode: 0 }
  }

  const show = (d) => {
    const c = d.committed ? `${d.committed.optional ? '?' : ''}: ${d.committed.type}` : '(absent)'
    const l = d.live ? `${d.live.optional ? '?' : ''}: ${d.live.type}` : '(absent)'
    return [`      ${d.path}`, `          committed ${c}`, `          live      ${l}`]
  }

  p(`FAIL: ${committedPath} is out of date with the live database schema of ${projectId}.`)
  p()
  p(`${result.unexplained.length} of ${result.deltas.length} difference(s) are NOT explained by any pending migration.`)
  p('This is genuine drift: the types and the database disagree, and nothing in')
  p('this repository accounts for the disagreement.')
  p()
  for (const d of result.unexplained) {
    p(`  UNEXPLAINED  ${d.kind}`)
    for (const line of show(d)) p(line)
  }
  if (result.explained.length) {
    p()
    p(`(${result.explained.length} other difference(s) ARE explained by pending migrations: ${result.migrations.join(', ')})`)
  }
  p()
  p('To resolve:')
  p(`  - If the LIVE schema is right, regenerate:`)
  p(`      npx supabase gen types --lang=typescript --project-id ${projectId}`)
  p(`    and replace lines 1 through (${marker}) in ${committedPath}.`)
  p('  - If the COMMITTED types are right, the migration that produces them is missing')
  p(`    from ${migrationsDir}/. Add it rather than editing the generated section by hand.`)
  p('  - Then re-run: npx tsc --noEmit')
  return { lines: L, exitCode: 1 }
}
