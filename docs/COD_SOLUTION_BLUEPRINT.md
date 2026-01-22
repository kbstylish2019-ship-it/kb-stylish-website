# Solution Blueprint: Cash on Delivery (COD) Implementation

## Problem Statement
The KB Stylish platform is production-ready but lacks a functional "Cash on Delivery" (COD) payment system. While the UI has a COD option, the backend and frontend logic currently blocks it.

## Proposed Solution
Enable COD as a first-class payment method by creating a specialized path in the `create-order-intent` Edge Function that bypasses external gateways and enqueues the order finalization job immediately.

## Architecture Changes
1. **Frontend**: Remove the blockage for `payment === 'cod'` in `CheckoutClient.tsx`.
2. **Edge Function (`create-order-intent`)**:
   - Add `cod` to the list of allowed payment methods.
   - Implement logic to create a `payment_intents` record with status `succeeded` and provider `cod`.
   - Enqueue a `finalize_order` job in `job_queue`.
3. **Database**:
   - Add `payment_method` column to `orders` table.
   - Update `process_order_with_occ` RPC to populate this column.

## Database Changes
```sql
-- Migration: Add payment_method to orders
ALTER TABLE public.orders ADD COLUMN payment_method text;

-- Update record for existing status consistency (optional but recommended)
COMMENT ON COLUMN public.orders.payment_method IS 'The payment method used: npx, khalti, esewa, or cod';
```

## API Changes
### Edge Function: `create-order-intent`
- **Request**: `payment_method: 'cod'`
- **Action**: 
  - Validates cart total.
  - Reserves inventory.
  - Inserts `payment_intents`.
  - Enqueues `job_queue` job.
- **Response**: `success: true, payment_method: 'cod', redirect_to_success: true`

## Frontend Changes
### `CheckoutClient.tsx`
- Remove validation block for COD.
- Handle `redirect_to_success` in the response to show the success modal immediately.

## Security Considerations
- **Spam Prevention**: COD is susceptible to fake orders. We will rely on simple verification (user must be authenticated) for now as per "simple yet effective" requirement.
- **Data Integrity**: Reusing `process_order_with_occ` ensures that inventory and ledger remain accurate.

## Testing Strategy
- **Manual**: Place a COD order and verify it appears in the Admin Dashboard and the `orders` table.
- **Integration**: Verify `job_queue` picks up the job and `order-worker` processes it.

## Rollback Plan
1. Delete the added column in `orders`.
2. Revert the changes in `create-order-intent` and `CheckoutClient`.
