/**
 * A RECEIPT IS NOT A TAX INVOICE, AND SAYING IT IS COSTS THE BUYER MONEY.
 *
 * Every assertion here is a line from the Australian Taxation Office's "Tax
 * invoices" page, quoted in src/lib/tax/tax-invoice.ts with its fetch date
 * (https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices,
 * page last updated 25 August 2025, fetched 25 August 2026), plus the ABN
 * checksum published by the Australian Business Register
 * (https://abr.business.gov.au/Help/AbnFormat, ABN Lookup 9.9.7).
 *
 * The two worked examples in those pages are used verbatim as fixtures, so a
 * change to this code is checked against the regulator's own arithmetic rather
 * than against a number somebody here invented.
 */
import { describe, it, expect } from 'vitest'
import { isValidAbn, formatAbn, normaliseAbn, abnValidationMessage } from '@/lib/tax/abn'
import {
  buildTaxInvoice,
  missingTaxInvoiceRequirements,
  gstOnInclusiveCents,
  BUYER_IDENTITY_THRESHOLD_CENTS,
  lineTaxLabel,
} from '@/lib/tax/tax-invoice'

/** The ABR's own worked example. */
const ABR_EXAMPLE = '51824753556'

const seller = {
  name: 'Harbour Lights Collective',
  legalName: 'Harbour Lights Pty Ltd',
  abn: ABR_EXAMPLE,
  gstRegistered: true,
}

function invoice(over: Partial<Parameters<typeof buildTaxInvoice>[0]> = {}) {
  return buildTaxInvoice({
    orderNumber: 'EL-1001',
    issuedAt: new Date('2026-08-25T03:00:00Z'),
    currency: 'AUD',
    lines: [{ description: 'General Admission', quantity: 2, amountCents: 6600, taxable: true }],
    totalCents: 6600,
    buyerName: 'A Buyer',
    buyerEmail: 'buyer@example.test',
    seller,
    ...over,
  })
}

describe('the ABN check digit, from the register', () => {
  it('accepts the ABR worked example', () => {
    // "Subtract 1 from the first digit (5) to give 41 824 753 556 ... Sum to
    // give a total of 534 ... Divide 534 by 89 giving 6 with zero remainder."
    expect(isValidAbn(ABR_EXAMPLE)).toBe(true)
  })

  it('accepts it however a human types it', () => {
    expect(isValidAbn('51 824 753 556')).toBe(true)
    expect(isValidAbn('51-824-753-556')).toBe(true)
    expect(normaliseAbn('51 824 753 556')).toBe(ABR_EXAMPLE)
  })

  it('rejects a single transposed digit, which is the typo it exists to catch', () => {
    expect(isValidAbn('51824753565')).toBe(false)
    expect(isValidAbn('15824753556')).toBe(false)
  })

  it('rejects the wrong length and a leading zero', () => {
    expect(isValidAbn('5182475355')).toBe(false)
    expect(isValidAbn('518247535566')).toBe(false)
    expect(isValidAbn('01824753556')).toBe(false)
  })

  it('formats the way the register prints it', () => {
    expect(formatAbn(ABR_EXAMPLE)).toBe('51 824 753 556')
  })

  it('says nothing about an empty value, because absent is allowed', () => {
    expect(abnValidationMessage('')).toBeNull()
    expect(abnValidationMessage('123')).toMatch(/11 digits/)
    expect(abnValidationMessage('51824753565')).toMatch(/does not pass/)
  })
})

describe('when a document is a tax invoice', () => {
  it('is one when the seller is registered, has a valid ABN, and the sale is taxable', () => {
    const doc = invoice()
    expect(doc.isTaxInvoice).toBe(true)
    expect(doc.documentTitle).toBe('Tax invoice')
    expect(missingTaxInvoiceRequirements(doc)).toEqual([])
  })

  it('is NOT one when the seller has not declared GST registration', () => {
    // A document saying "Tax invoice" over a seller who is not registered
    // invites the buyer to claim a credit that does not exist.
    const doc = invoice({ seller: { ...seller, gstRegistered: false } })
    expect(doc.isTaxInvoice).toBe(false)
    expect(doc.documentTitle).toBe('Receipt')
    expect(doc.notTaxInvoiceReason).toMatch(/not declared GST registration/)
    expect(doc.gstCents).toBe(0)
  })

  it('is NOT one when the ABN is absent or fails the check digit', () => {
    expect(invoice({ seller: { ...seller, abn: null } }).isTaxInvoice).toBe(false)
    expect(invoice({ seller: { ...seller, abn: '51824753565' } }).isTaxInvoice).toBe(false)
    expect(invoice({ seller: { ...seller, abn: null } }).sellerAbn).toBeNull()
  })

  it('is NOT one for a free ticket, which is not a taxable sale', () => {
    const doc = invoice({
      lines: [{ description: 'Free entry', quantity: 1, amountCents: 0, taxable: false }],
      totalCents: 0,
    })
    expect(doc.isTaxInvoice).toBe(false)
    expect(doc.taxableExtent).toBe('none')
  })
})

describe('the seven required details, for a sale under $1,000', () => {
  const doc = invoice()

  it('1. declares itself a tax invoice', () => {
    expect(doc.documentTitle).toBe('Tax invoice')
  })

  it("2. names the seller, preferring the registered name over the trading name", () => {
    expect(doc.sellerIdentity).toBe('Harbour Lights Pty Ltd')
    expect(invoice({ seller: { ...seller, legalName: null } }).sellerIdentity).toBe(
      'Harbour Lights Collective',
    )
  })

  it("3. carries the seller's ABN, grouped as the register prints it", () => {
    expect(doc.sellerAbn).toBe('51 824 753 556')
  })

  it('4. carries the date it was issued', () => {
    expect(doc.issuedAt.toISOString()).toBe('2026-08-25T03:00:00.000Z')
  })

  it('5. describes each item with its quantity and price', () => {
    expect(doc.lines).toEqual([
      { description: 'General Admission', quantity: 2, amountCents: 6600, taxable: true },
    ])
  })

  it('6. states the GST, as one eleventh of the inclusive price', () => {
    // 6600 / 11 = 600 exactly.
    expect(doc.gstCents).toBe(600)
    expect(gstOnInclusiveCents(6600)).toBe(600)
  })

  it("6. may use the short form only when the GST really is exactly 1/11 of the total", () => {
    expect(doc.totalPriceIncludesGst).toBe(true)
    const mixed = invoice({
      lines: [
        { description: 'General Admission', quantity: 1, amountCents: 6600, taxable: true },
        { description: 'Donation', quantity: 1, amountCents: 1000, taxable: false },
      ],
      totalCents: 7600,
    })
    // "A tax invoice that includes taxable and non-taxable items, must clearly
    // show which items are taxable." The short form would hide that.
    expect(mixed.totalPriceIncludesGst).toBe(false)
    expect(mixed.taxableExtent).toBe('part')
    expect(mixed.gstCents).toBe(600)
  })

  it('7. states the extent to which each sale is taxable', () => {
    expect(doc.taxableExtent).toBe('all')
    expect(doc.lines.every(l => typeof l.taxable === 'boolean')).toBe(true)
  })

  it('rounds a fraction of a cent to the nearest cent, upwards at the half', () => {
    // 100 / 11 = 9.0909..., 105 / 11 = 9.545...
    expect(gstOnInclusiveCents(100)).toBe(9)
    expect(gstOnInclusiveCents(105)).toBe(10)
  })
})

describe("the buyer's identity, required at $1,000 or more", () => {
  it('is not required below the threshold', () => {
    const doc = invoice({ totalCents: BUYER_IDENTITY_THRESHOLD_CENTS - 1 })
    expect(doc.buyerIdentityRequired).toBe(false)
  })

  it('is required at exactly $1,000', () => {
    const doc = invoice({ totalCents: BUYER_IDENTITY_THRESHOLD_CENTS })
    expect(doc.buyerIdentityRequired).toBe(true)
    expect(doc.buyerIdentity).toBe('A Buyer')
    expect(missingTaxInvoiceRequirements(doc)).toEqual([])
  })

  it('falls back to the email when no name was given', () => {
    const doc = invoice({ totalCents: 120000, buyerName: null })
    expect(doc.buyerIdentity).toBe('buyer@example.test')
  })

  it('NEGATIVE CONTROL: a $1,000 sale with no buyer identity at all is reported incomplete', () => {
    // Proves the requirement list measures something. Without this the suite
    // would pass on an invoice that is missing a required detail.
    const doc = invoice({ totalCents: 120000, buyerName: null, buyerEmail: null })
    expect(missingTaxInvoiceRequirements(doc)).toContain(
      "8. buyer's identity (required at $1,000 or more)",
    )
  })

  it('NEGATIVE CONTROL: an invoice with no line items is reported incomplete', () => {
    const doc = invoice({ lines: [] })
    // No taxable line means it is not a tax invoice at all, so the requirement
    // list is empty by design; the document must say Receipt instead.
    expect(doc.isTaxInvoice).toBe(false)
    expect(doc.documentTitle).toBe('Receipt')
  })
})

describe('the per-line tax label', () => {
  it('says No charge for a zero-priced line, not GST-free', () => {
    // GST-free is a classification the ATO applies to particular supplies
    // (basic food, most health and education). Printing it beside a comp ticket
    // asserts a tax status the line does not have. Found by the verification
    // drive on a $0 guest-list line.
    expect(lineTaxLabel({ description: 'Guest list entry', quantity: 1, amountCents: 0, taxable: false }))
      .toBe('No charge')
  })

  it('says Taxable for a priced taxable line', () => {
    expect(lineTaxLabel({ description: 'GA', quantity: 1, amountCents: 3300, taxable: true })).toBe('Taxable')
  })

  it('says GST-free only for a line that is priced AND not taxable', () => {
    expect(lineTaxLabel({ description: 'Donation', quantity: 1, amountCents: 1000, taxable: false }))
      .toBe('GST-free')
  })
})
