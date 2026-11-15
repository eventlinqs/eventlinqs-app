/**
 * A COUNT AND ITS NOUN, SAID AS A PERSON SAYS IT (the PM's 02:45 of 16 November 2026, fix 3: '5 piece(s)', '3 letter(s)'
 * and '19 organiser photo(s)' on the admin read as a machine's). One for one, the plural for more; the verb agrees.
 * tests/unit/admin/no-maybe-plurals.test.ts fails on any '(s)' left in the admin's own strings.
 */
const NUMBER = new Intl.NumberFormat('en-AU')

/** '1 piece', '5 pieces', '1 reply', '2 replies' (the plural given where it is not the noun and an s). */
export function countOf(n: number, one: string, many: string = `${one}s`): string {
  return `${NUMBER.format(n)} ${n === 1 ? one : many}`
}

/** The word that agrees with a count: agrees(1, 'waits', 'wait') is 'waits'. */
export function agrees(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
