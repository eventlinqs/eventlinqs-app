/**
 * How much of the source can the copy gate actually read?
 *
 * WHY THIS EXISTS. copy-tell-gate spent months reporting "clean" while unable
 * to see most user-facing copy: its JSX matcher needed `>` and `<` on the same
 * line, and Prettier wraps copy onto its own line. 3,134 lines across 488
 * files were invisible, including the whole legal corpus. Nothing noticed,
 * because a gate that narrows its own vision gets quieter, not louder.
 *
 * So the gate now measures its own eyesight and fails when it dims.
 *
 * THE RATIO, and why it is a ratio rather than a count. The numerator is
 * chunker-dependent (lines the chunker yields copy from); the denominator is
 * chunker-INDEPENDENT (non-comment, non-blank source lines). Adding or
 * deleting files moves both together, so the ratio is stable across ordinary
 * work. Narrowing the chunker moves only the numerator, so the ratio falls and
 * the gate goes red. That is exactly the failure this cannot allow again.
 */

export function measureCoverage(files, readFile, copyChunks) {
  let denominator = 0
  let numerator = 0
  const perFile = new Map()

  for (const file of files) {
    const lines = readFile(file).split(/\r?\n/)
    let inBlock = false
    let fileDen = 0
    let fileNum = 0

    for (const line of lines) {
      const t = line.trim()
      const opens = t.includes('/*')
      const closes = t.includes('*/')
      const was = inBlock
      if (opens && !closes) inBlock = true
      else if (closes) inBlock = false
      if (was || (opens && !closes)) continue
      if (t.length === 0 || t.startsWith('//') || t.startsWith('*')) continue

      fileDen++
      if (copyChunks(line).length > 0) fileNum++
    }

    denominator += fileDen
    numerator += fileNum
    if (fileDen > 0) perFile.set(file, { read: fileNum, total: fileDen })
  }

  return {
    numerator,
    denominator,
    ratio: denominator === 0 ? 0 : numerator / denominator,
    perFile,
  }
}
