# Phase 2: Expert Panel Consultation - Cash on Delivery (COD)

## 👨‍💻 Expert 1: Senior Security Architect
### Questions & Review
**1. What are the security implications of this change?**
- COD orders don't require upfront payment, which makes the system vulnerable to "Order Spamming" or "Inventory Exhaustion" attacks.
- **Mitigation**: Add rate limiting to order creation. Consider phone number verification (OTP) for the first COD order or orders above a certain threshold (NPR 5000+).

**2. Does this violate least-privilege principle?**
- No, current RLS and RPC patterns are maintained.

**3. Can this be exploited?**
- Exploitation via spam is the biggest risk.
- **Mitigation**: Implement a "Trust Score" or simply limit the number of active COD orders per user.

**4. Is RLS properly enforced?**
- Yes, using `SECURITY INVOKER` for reads and guarded `SECURITY DEFINER` for writes.

---

## ⚡ Expert 2: Performance Engineer
### Questions & Review
**1. Will this scale?**
- Yes, the aggregate-based metrics system (metrics schema) is designed for 10M+ rows. COD orders will be ingested into the same pipeline.

**2. Are there race conditions?**
- Race conditions in inventory are already handled by `reserve_inventory_for_payment` and `process_order_with_occ` using OCC patterns.

**3. Is this operation atomic?**
- Yes, the transition from `Cart` -> `Payment Intent` -> `Order` is managed via DB transactions in RPCs.

---

## 🗄️ Expert 3: Data Architect
### Questions & Review
**1. Is the schema normalized?**
- Yes. However, a `payment_method` column should be added to `orders` for clearer visibility without joining to `payment_intents`.

**2. Is data consistency maintained?**
- Yes, by reusing the `job_queue` and `finalize_order` logic, we ensure that COD orders follow the same state machine as paid orders.

**3. Can we rollback safely?**
- Yes, if the `order-worker` fails, the job remains in `pending` or `failed` state for retry.

---

## 🎨 Expert 4: Frontend/UX Engineer
### Questions & Review
**1. Is the UX intuitive?**
- Users are familiar with COD. We need to clearly state that payment is collected at delivery.
- **Improvement**: Show a "Confirmation" screen before placing a COD order to prevent accidental clicks.

**2. Are loading states handled?**
- Yes, `isProcessingOrder` in `CheckoutClient` handles the placement state.

**3. Are errors user-friendly?**
- We must handle cases where COD might be unavailable (e.g., specific regions or high-value items).

---

## 🔬 Expert 5: Principal Engineer
### Questions & Review
**1. What's the complete end-to-end flow?**
- User -> Checkout -> `create-order-intent` -> `payment_intents` (status: succeeded, provider: cod) -> `job_queue` -> `order-worker` -> `process_order_with_occ` -> Dashboard.

**2. Where can this break silently?**
- If the `job_queue` processing fails for COD, the user sees "Success" but the order isn't created in `orders`.
- **Fix**: The frontend should ideally wait for the order ID if possible, or we must have a robust notification system.

**3. Rollback strategy?**
- Same as existing: Cancel order and release inventory reservation.
