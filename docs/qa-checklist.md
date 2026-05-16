# QA Checklist

Maps each requirement to its test coverage.

## Authentication (Req 1)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| Email/password registration | auth.test.ts | POST /api/auth/register — returns 201 |
| Duplicate email rejected | auth.test.ts | returns 409 when email is already registered |
| Phone OTP registration | auth.test.ts | POST /api/auth/register/phone |
| OTP expiry | auth.test.ts | returns 400 for expired OTP |
| Login returns tokens | auth.test.ts | returns 200 with tokens on valid credentials |
| Token refresh | auth.test.ts | returns 200 with new token pair |
| Password reset | auth.test.ts | POST /api/auth/password/reset |
| bcrypt cost >= 12 | auth.service.ts | BCRYPT_COST = 12 constant |

## Cart (Req 6)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| Add to cart | cart.test.ts | returns 200 when item is added |
| Quantity cap at stock | cart.test.ts | P2: quantity never exceeds stock |
| Cart persists across sessions | cart.service.ts | DB-backed (not session) |
| Subtotal consistency | cart.test.ts | P1: Cart Subtotal Consistency |
| Stock non-negativity | cart.test.ts | P2: Stock Non-Negativity |

## Orders (Req 8)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| Order total integrity | orders.test.ts | P4: Order Total Integrity |
| Delivery slot capacity | orders.test.ts | P7: Delivery Slot Capacity |
| Stock decrement | order.service.ts | optimistic locking in $transaction |
| COD flow | orders.test.ts | returns 201 for COD |

## Security (Req 21)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| JWT role isolation | security.test.ts | P5: JWT Role Isolation |
| Refresh token single-use | security.test.ts | P6: Refresh Token Single-Use |
| Rate limiting | auth.test.ts | authLimiter middleware |
| 401 for unauthenticated | auth.test.ts | JWT middleware tests |
| 403 for wrong role | security.test.ts | customer cannot access admin |

## Loyalty (Req 15)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| Points non-negativity | loyalty.test.ts | P8: Loyalty Points Balance Non-Negativity |
| Max 20% redemption | loyalty.test.ts | redemption capped at 20% |

## Wishlist (Req 10)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| Uniqueness invariant | loyalty.test.ts | P10: Wishlist Uniqueness Invariant |
| Idempotent add | wishlist.service.ts | upsert prevents duplicates |

## Delivery Partner (Req 15)

| Requirement | Test File | Test Name |
|-------------|-----------|-----------|
| 403 for wrong partner | delivery.test.ts | returns 403 when partner tries to update unassigned order |
| delivered_at timestamp | delivery.test.ts | returns 200 when status is updated to delivered |
