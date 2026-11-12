import { createHash } from 'node:crypto'

/**
 * ORGANISERS ALREADY WRITTEN TO OUTSIDE THE CRM (the PM, 12 November 2026, 11:58, item 1: "Lawal sent NO outreach on 11
 * November; his 20 first messages went out from lawal@eventlinqs.com on 10 and 11 OCTOBER ... the full list is
 * C:\dev\START-16OCT\EL-ALREADY-WRITTEN-12NOV.txt (20 from lawal@, 1 from hello@, and 8 live conversations or organisers
 * already won) ... so none gets a cold first message again").
 *
 * Those messages are not CRM touches: a touch is the record of the words sent, to a contact the database finds lawful
 * now, and neither is held for most of them (12 November: of the 29 addresses only two organisers, AMCF and the Nigerian
 * Society of VIC, are in the CRM at all). So the list is kept here as hashes, never as addresses: sha256 of each address
 * and of each organisation's own domain (never a free mail domain, which says nothing about the organisation), first 20
 * hex. Any contact on one of them, now or added later, takes its organiser out of the day's first messages.
 */
export const WRITTEN_BEFORE: ReadonlySet<string> = new Set([
  '0908a110c340d405f268', '0d8d37a71cee0c4d1781', '1ca22c5739cc280c690f', '1d62afb54bba43f20a41',
  '20af069af1e9e876a771', '27475f11259406b57ae3', '278790563bae5dc75eac', '28f24922c9a923126109',
  '36d292583b131465da2a', '47a50bb82e5bd356edd0', '4ba99c66dd9a15bc0260', '4e95f249e91715c08736',
  '51d690af604cbe7ade2e', '5cadbc12c2189f463bd3', '60f3b715fa86c97408d5', '62efae1fc5aff6850545',
  '678fee0f2dfb957c7635', '6929bcf7cdf488349486', '76710366a5e2880e23b2', '7d6094a0a9eaba5cd317',
  '7e6c64c36db25f630e7f', '8d8d2f13a369ba91783d', '90ef8d86e28be420489e', '93b929387180c8afbe5f',
  '96a19ceffd559b1c8e48', '9ada7c134f69861bf0bb', '9ca08585b401019bc796', 'a4159ca609ba89b4b0b1',
  'ab72d67e8f524c2259d0', 'b0f449db4fe6e097eedc', 'b507bf17105aad87b589', 'bdb17500f1deb14e9746',
  'bf63e7dc0db4d47601d3', 'c1306bfa1701f62fb284', 'cff815e39701ca66499e', 'd921a7277f76f80897df',
  'e615f0e9d6c3bff949eb', 'e67813f711df5245b0ee', 'ea6286486b7a025a4519', 'ec9eefc3513c320c7a8d',
  'f2a51438febcc6fc7b53', 'f5348ae521430fb7b80a', 'f6b82e56ea1565981192',
])

const FREE_MAIL: ReadonlySet<string> = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'yahoo.com.au', 'bigpond.com', 'bigpond.net.au', 'icloud.com', 'live.com', 'live.com.au', 'optusnet.com.au'])

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 20)

/** Lawal already wrote to this address, or to the organisation that owns its domain. */
export function writtenBefore(address: string): boolean {
  const a = address.trim().toLowerCase()
  if (WRITTEN_BEFORE.has(hashOf(a))) return true
  const domain = a.split('@')[1] ?? ''
  return domain !== '' && !FREE_MAIL.has(domain) && WRITTEN_BEFORE.has(hashOf(`@${domain}`))
}
