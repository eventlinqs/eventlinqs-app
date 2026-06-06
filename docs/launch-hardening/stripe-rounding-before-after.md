# Stripe revenue card rounding fix - before / after (item 9)

The admin GMV / revenue tiles formatted with `maximumFractionDigits: 0`, rounding every
figure to whole dollars. `formatMoneyDisplay` now renders exact cents.

| Cents | Before (buggy, rounded to dollar) | After (fixed, exact) |
|---|---|---|
| 99 | $1 | $0.99 |
| 1 | $0 | $0.01 |
| 50 | $1 | $0.50 |
| 123456 | $1,235 | $1,234.56 |
| 100050 | $1,001 | $1,000.50 |
| 999999 | $10,000 | $9,999.99 |
| 4999 | $50 | $49.99 |
| 250075 | $2,501 | $2,500.75 |

## Reconciliation

Gross $1,000.50, refunded $0.50, net $1,000.00.

- Before: gross $1,001, refunded $1, net $1,000 -> $1,001 minus $1 reads as not equal to $1,000 (each tile rounded independently).
- After: gross $1,000.50, refunded $0.50, net $1,000.00 -> reconciles exactly.

Fix: `src/lib/money/format.ts` `formatMoneyDisplay`, used by `src/app/admin/(authed)/analytics/page.tsx` and `src/app/admin/(authed)/page.tsx`. Verified by `tests/unit/money/format.test.ts`.
