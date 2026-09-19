/**
 * GUARD: a reference catalogue read only after an action is not serialised into
 * the document of every page.
 *
 * ============================================================================
 * WHY THIS EXISTS, with the measurement that produced it
 * ============================================================================
 *
 * Found on 19 September 2026 by close-out C8B.1's origin cost table, and it was
 * live. The location picker's city dialog has been behind a dynamic import
 * since 17 September (`interaction-only-chrome-is-split`), which took its CODE
 * off every route. Its DATA stayed exactly where it was, because the header
 * passed the catalogue to the client component as a prop, and a prop that
 * crosses the server/client boundary is serialised into the RSC payload whether
 * the component that reads it ever mounts or not.
 *
 * Measured on the gate build of 19 September 2026, served on 127.0.0.1:3200:
 *
 *     /          document 1,014,418 B   catalogue 6,988 B   0.69%
 *     /events      document 406,181 B   catalogue 6,988 B   1.72%
 *     /pricing     document 187,810 B   catalogue 6,988 B   3.72%
 *     /login        document 95,833 B   catalogue 6,988 B   7.29%
 *
 * Every page, the same 6,988 bytes, twice: the header renders the picker for
 * the desktop bar and again for the mobile sheet, and each JSX element carries
 * its own copy of its props. 40 rows for 20 cities, each with a latitude and a
 * longitude, on a login page where nobody is choosing a city.
 *
 * SPLITTING THE CODE IS THEREFORE NOT THE SAME AS DEFERRING THE SURFACE, and
 * that is the whole lesson. The bytes moved out of the JavaScript bundle and
 * `initial-bundle-budget` recorded the win; the same feature's bytes stayed in
 * the HTML, where no gate was looking.
 *
 * ============================================================================
 * TWO MODES, BECAUSE THE THING THAT MATTERS ONLY EXISTS AFTER A BUILD
 * ============================================================================
 *
 *   node scripts/guards/no-catalogue-in-every-document.mjs
 *       prebuild, registered in run-guards.mjs. Judges the CONTRACT: every
 *       registered catalogue still has the endpoint that replaced the prop,
 *       its marker field still exists in the source that produces the rows,
 *       and the postbuild half is still wired. It weighs nothing and says so.
 *
 *   node scripts/guards/no-catalogue-in-every-document.mjs --built
 *       postbuild, from package.json. Reads the documents the build just wrote
 *       and fails on any that carries a registered catalogue. This is the
 *       proof; the prebuild half is a promise.
 *
 * The same shape as initial-bundle-budget.mjs and card-raster-traced.mjs, for
 * the same reason: a source rule is a promise and the build output is the fact.
 *
 * ============================================================================
 * THE CALIBRATION, WHICH IS THE CLAUSE THIS GUARD WOULD BE USELESS WITHOUT
 * ============================================================================
 *
 * Every other guard in this repository fails by finding something. This one
 * passes by finding NOTHING, which means a matcher that has gone blind and a
 * platform that is clean are the same green.
 *
 * Three ordinary edits would blind it: renaming `isLaunchCity`, a framework
 * change to how props are escaped inside a flight chunk, and a typo in the
 * marker. None of them would fail a test, and all three would leave this guard
 * reporting PASS for ever.
 *
 * So before it judges anything it runs its own matcher over a document it
 * builds itself, containing one row in the escaped form the framework actually
 * emits, and REFUSES if that row is not found. It is the same discipline the
 * Vercel-logs investigation of 9 August 2026 arrived at the hard way: an
 * instrument that reports an absence has to be calibrated against a known
 * positive before the absence means anything.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, stated rather than implied
 * ============================================================================
 *
 * ONLY PRERENDERED ROUTES. A dynamic route's document does not exist until a
 * request arrives, so this cannot weigh /login or /events directly. It does not
 * need to: `_not-found.html` is prerendered and Next serialises the root
 * not-found boundary into the payload of EVERY page, so the chrome that carries
 * a catalogue carries it there too. A catalogue absent from the prerendered set
 * is absent from the chrome, and a catalogue present in it is present
 * everywhere. The served-document measurement is
 * `node scripts/perf/srcset-weight.mjs --serve`, and it is what produced the
 * numbers above.
 *
 * IT JUDGES CATALOGUES, NOT PAGE DATA. The registry says what a catalogue is
 * and both halves of that test have to hold: the same rows on every route, and
 * read only after an action. This guard has nothing to say about an event page
 * serialising its own event.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { catalogueWeight } from '../perf/lib/document-weight.mjs'
import { CATALOGUES } from '../perf/lib/catalogues.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[no-catalogue-in-every-document]'
const BUILT = process.argv.includes('--built')
const APP = join(ROOT, '.next', 'server', 'app')

/**
 * Where each catalogue's rows are DECLARED, and under which exported type.
 *
 * SCOPED TO THE TYPE DECLARATION, NOT TO THE FILE, and the first version of this
 * clause was scoped to the file and was too weak to drill. `isLaunchCity` is
 * written four times in picker-cities.ts, so renaming the FIELD left the string
 * present in three assignments and the clause passed on a tree where the field
 * no longer existed. The declaration is the one place the name has to be, so
 * that is where it is looked for.
 */
const MARKER_SOURCES = {
  isLaunchCity: { file: 'src/lib/locations/picker-cities.ts', declaredIn: 'PickerCity' },
}

/**
 * The body of `export type <name> = { ... }`, up to the first closing brace at
 * the start of a line. These row types are flat by nature, so a brace counter
 * would be machinery for a case that does not arise.
 */
function typeBody(source, name) {
  const open = source.indexOf(`export type ${name} = {`)
  if (open === -1) return null
  const close = source.indexOf('\n}', open)
  if (close === -1) return null
  return source.slice(open, close)
}

const problems = []
/** Which catalogues were actually found in a document, so the footer names them. */
const carrying = new Set()

console.log(`${TAG} the registry, printed every run so it cannot rot into a list nobody questions:`)
for (const c of CATALOGUES) {
  console.log(`${TAG}   "${c.name}" marked by the field ${c.marker}`)
  console.log(`${TAG}     ${c.why}`)
  console.log(`${TAG}     served instead by ${c.servedBy}`)
  console.log(
    `${TAG}     measured before the fix: ${c.measuredBefore.bytesPerCopy} B per copy, ` +
      `${c.measuredBefore.totalBytesInPrerenderedDocuments} B across the prerendered set`,
  )
}

/**
 * ONE ROW IN THE FORM THE FRAMEWORK EMITS. Inside a flight chunk the props are
 * JSON inside a JavaScript string literal, so every quote arrives escaped. The
 * second form is the `.rsc` payload, where they are not.
 */
function calibrationDocuments(marker) {
  const escaped =
    '<script>self.__next_f.push([1,"a:[\\"$\\",\\"div\\",null,' +
    `{\\"cities\\":[{\\"city\\":\\"Geelong\\",\\"slug\\":\\"geelong\\",\\"${marker}\\":true}]}` +
    ']\\n"])</script>'
  const plain = `{"city":"Geelong","slug":"geelong","${marker}":true}`
  return [
    { what: 'a flight chunk, quotes escaped', html: escaped },
    { what: 'an .rsc payload, quotes plain', html: plain },
  ]
}

let calibrations = 0
for (const catalogue of CATALOGUES) {
  for (const probe of calibrationDocuments(catalogue.marker)) {
    calibrations += 1
    const found = catalogueWeight(probe.html, {
      marker: catalogue.marker,
      arrayKeys: catalogue.arrayKeys,
    })
    if (found.rows !== 1 || found.distinct !== 1 || found.bytes === 0) {
      problems.push(
        `CALIBRATION FAILED for "${catalogue.name}" on ${probe.what}: the matcher found ` +
          `${found.rows} row(s) and ${found.distinct} distinct slug(s) in a document built to ` +
          `contain exactly one. This guard passes by finding nothing, so a blind matcher and a ` +
          `clean platform are the same green, and the absence it reports means nothing until ` +
          `this probe passes. Check that the field "${catalogue.marker}" is still what the rows ` +
          `carry and that catalogueWeight still understands the escaping.`,
      )
    }
  }
}

/* CONTRACT CLAUSES. Judged in both modes: they are cheap, and a built run that
   found nothing because the registry had rotted would be the worst of the two
   possible wrong answers. */
for (const catalogue of CATALOGUES) {
  if (!existsSync(join(ROOT, catalogue.servedBy))) {
    problems.push(
      `"${catalogue.name}" is registered as served by ${catalogue.servedBy} and that file is not ` +
        `in the tree. The endpoint is what a deferred surface fetches INSTEAD of being handed the ` +
        `rows as a prop; without it the only way the dialog can have its data is the way this ` +
        `guard exists to refuse.`,
    )
  }
  const markerSource = MARKER_SOURCES[catalogue.marker]
  if (!markerSource) {
    problems.push(
      `"${catalogue.name}" is marked by the field ${catalogue.marker} and MARKER_SOURCES in this ` +
        `guard does not say where it is declared. Name it, so the clause below can check the ` +
        `field still exists rather than assuming it.`,
    )
    continue
  }
  const body = typeBody(readFileSync(join(ROOT, markerSource.file), 'utf8'), markerSource.declaredIn)
  if (body === null) {
    problems.push(
      `${markerSource.file} no longer declares "export type ${markerSource.declaredIn}", which is ` +
        `the row type of "${catalogue.name}". Point MARKER_SOURCES at whatever replaced it, ` +
        `because the clause below cannot check a field in a type it cannot find.`,
    )
  } else if (!body.includes(catalogue.marker)) {
    problems.push(
      `the field ${catalogue.marker} no longer appears in ${markerSource.declaredIn}, declared in ` +
        `${markerSource.file}, which is the row type of "${catalogue.name}". The matcher is ` +
        `anchored on that name, so this is a rename that would have disarmed the guard silently ` +
        `while leaving it reporting PASS. Carry it into scripts/perf/lib/catalogues.mjs.`,
    )
  }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
if (!String(pkg.scripts?.postbuild ?? '').includes('no-catalogue-in-every-document.mjs --built')) {
  problems.push(
    `package.json's postbuild no longer runs this guard with --built. The prebuild half you are ` +
      `reading weighs nothing: it cannot open a document, because no document exists yet. Without ` +
      `the postbuild half registered there is no proof at all, only a promise.`,
  )
}

let documentsJudged = 0
let bytesFound = 0

if (BUILT) {
  if (!existsSync(APP)) {
    problems.push(
      `--built was passed and there is no build under .next/server/app. This mode exists to read ` +
        `what the build wrote, and a run with nothing to read is a gate looking at nothing.`,
    )
  } else {
    const files = []
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        if (name.endsWith('.html') || name.endsWith('.rsc')) files.push(path)
      }
    }
    walk(APP)

    if (files.length === 0) {
      problems.push(
        `not one .html or .rsc document under .next/server/app. Every build of this tree ` +
          `prerenders some, so this is the walk failing rather than a build with no output.`,
      )
    }

    for (const file of files) {
      const html = readFileSync(file, 'utf8')
      const where = relative(ROOT, file).replace(/\\/g, '/')
      documentsJudged += 1
      for (const catalogue of CATALOGUES) {
        const weight = catalogueWeight(html, {
          marker: catalogue.marker,
          arrayKeys: catalogue.arrayKeys,
        })
        if (weight.bytes === 0) continue
        bytesFound += weight.bytes
        carrying.add(catalogue.name)
        /* ONE SHORT LINE PER DOCUMENT. The explanation is printed once in the
           footer instead of once per document: this fires on every prerendered
           route at the same time, and forty copies of the same paragraph is a
           gate output nobody reads to the end of. */
        problems.push(
          `${where} carries "${catalogue.name}": ${weight.bytes} B, ${weight.rows} row(s), ` +
            `${weight.distinct} distinct, ${weight.copies} copy(ies), ` +
            `${weight.sharePercent.toFixed(2)}% of the document`,
        )
      }
    }
  }
}

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`${TAG} FAIL: ${p}`)
  console.error('')
  for (const name of carrying) {
    const catalogue = CATALOGUES.find(x => x.name === name)
    console.error(`${TAG} "${name}" is ${catalogue.why}.`)
    console.error(`${TAG} A PROP IS HOW IT GETS THERE. A prop crossing the server/client boundary is`)
    console.error(`${TAG} serialised into the RSC payload whether the component reading it ever mounts`)
    console.error(`${TAG} or not, so deferring the CODE does nothing for it. It reaches the client from`)
    console.error(`${TAG} ${catalogue.servedBy} on the same intent that fetches the surface's chunk.`)
    console.error('')
  }
  console.error(`${TAG} Measured when this was removed: 6,988 B on every page of the platform,`)
  console.error(`${TAG} 7.29 percent of the login document, for a dialog almost nobody opens.`)
}

declareWork(TAG.slice(1, -1), {
  did: {
    'registered catalogue judged': CATALOGUES.length,
    'calibration probe run': calibrations,
    // Only declared in --built mode. In contract mode there is no build to
    // weigh, and declaring a count that is zero BY DESIGN would either train a
    // reader to ignore the did-nothing warning or need a zeroIsFine entry that
    // says "it is fine that this weighed nothing", which is the sentence this
    // repository removed from four guards in a week.
    ...(BUILT ? { 'built document weighed': documentsJudged } : {}),
  },
  found: { 'fault': problems.length, 'catalogue byte in a document': bytesFound },
  zeroIsFine: {
    fault: 'every catalogue is fetched on intent rather than serialised',
    'catalogue byte in a document': 'no built document carries a registered catalogue',
  },
})

if (problems.length > 0) process.exit(1)

if (BUILT) {
  console.log(
    `${TAG} PASS - ${documentsJudged} built document(s) weighed, ${CATALOGUES.length} registered ` +
      `catalogue(s), 0 bytes of catalogue in any of them. Matcher calibrated on ${calibrations} probes.`,
  )
} else {
  console.log(
    `${TAG} PASS (contract only, nothing weighed) - ${CATALOGUES.length} catalogue(s) still have ` +
      `their endpoint and their marker field, and postbuild still runs the half that weighs. ` +
      `Matcher calibrated on ${calibrations} probes.`,
  )
}
