/**
 * THE AUSTRALIAN BUSINESS NUMBER: VALIDATION AND DISPLAY.
 *
 * ============================================================================
 * THE ALGORITHM, FROM THE REGISTER ITSELF
 * ============================================================================
 *
 * Not from memory (Law 7). The Australian Business Register publishes it:
 *
 *   "The 11 digit ABN is structured as a 9 digit identifier with two leading
 *    check digits. The leading check digits are derived using a modulus 89
 *    (remainder after dividing by 89) calculation.
 *
 *    To verify an ABN:
 *      Subtract 1 from the first (left-most) digit of the ABN to give a new
 *        11 digit number
 *      Multiply each of the digits in this new number by a "weighting factor"
 *        based on its position
 *      Sum the resulting 11 products
 *      Divide the sum total by 89, noting the remainder
 *      If the remainder is zero the number is a valid ABN"
 *
 *   https://abr.business.gov.au/Help/AbnFormat  (ABN Lookup version 9.9.7,
 *   fetched 25 August 2026)
 *
 * The weighting table, position 1 to 11, from the same page:
 *
 *   10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19
 *
 * And its worked example, which is the test case below: 51 824 753 556 becomes
 * 41 824 753 556, the weighted sum is 534, and 534 / 89 is 6 remainder 0.
 *
 * ============================================================================
 * WHAT THIS DOES NOT DO
 * ============================================================================
 *
 * It does not ask the register whether the ABN is REGISTERED, ACTIVE, or
 * belongs to the organiser who typed it. That needs an ABN Lookup web-service
 * credential and is a separate piece of work. A checksum answers one question
 * only: "is this a well-formed ABN, or a typo?" Saying more than that on the
 * strength of a modulus would be the kind of claim Law 7 exists to stop.
 */

/** Position 1..11 weighting factors, published by the ABR. */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const

/** Strip everything that is not a digit. ABNs are written with spaces. */
export function normaliseAbn(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '')
}

/**
 * Is this a well-formed ABN?
 *
 * Eleven digits, and the modulus 89 check passes. A leading zero is rejected
 * because subtracting 1 from it is not defined by the published algorithm and
 * no issued ABN starts with zero.
 */
export function isValidAbn(input: string | null | undefined): boolean {
  const digits = normaliseAbn(input)
  if (digits.length !== 11) return false
  if (digits[0] === '0') return false

  let sum = 0
  for (let i = 0; i < 11; i += 1) {
    const digit = Number(digits[i]) - (i === 0 ? 1 : 0)
    sum += digit * WEIGHTS[i]
  }
  return sum % 89 === 0
}

/**
 * The ABR's own display grouping: 2 3 3 3.
 *
 * `51 824 753 556` in the worked example above, and the form every Australian
 * business card and invoice uses. Returns the input unchanged when it is not
 * eleven digits, so a partial value shown back to an organiser mid-typing is
 * not silently mangled.
 */
export function formatAbn(input: string | null | undefined): string {
  const digits = normaliseAbn(input)
  if (digits.length !== 11) return String(input ?? '')
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`
}

/**
 * One place that decides what to tell an organiser about what they typed.
 *
 * Returns null when the value is acceptable, or the sentence to show. Kept
 * here rather than in the form so the server action and the client hint cannot
 * disagree about what is valid.
 */
export function abnValidationMessage(input: string | null | undefined): string | null {
  const digits = normaliseAbn(input)
  if (digits.length === 0) return null // absent is allowed; it just is not a tax invoice
  if (digits.length !== 11) return `An ABN is 11 digits. That is ${digits.length}.`
  if (!isValidAbn(digits)) return 'That is 11 digits but it does not pass the ABN check. Please re-read it.'
  return null
}
