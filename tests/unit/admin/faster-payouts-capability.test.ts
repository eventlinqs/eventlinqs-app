// Item 21: faster payouts are switched on per organiser by Lawal alone (the locked foundation: "off until Lawal switches
// it on per organiser"). The capability that gates the switch, admin.payouts.faster, is held by super_admin and by no
// other role, so an admin who may disburse may still not make anyone's payouts faster.

import { describe, expect, test } from 'vitest'
import { hasCapability } from '@/lib/admin/rbac'

describe('who may switch faster payouts', () => {
  test('super_admin alone', () => {
    expect(hasCapability('super_admin', 'admin.payouts.faster')).toBe(true)
    for (const role of ['admin', 'support', 'moderator'] as const) {
      expect(hasCapability(role, 'admin.payouts.faster')).toBe(false)
    }
  })

  test('an admin who may disburse may not switch it', () => {
    expect(hasCapability('admin', 'admin.payouts.disburse')).toBe(true)
    expect(hasCapability('admin', 'admin.payouts.faster')).toBe(false)
  })
})
