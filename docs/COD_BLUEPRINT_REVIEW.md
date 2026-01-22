# Phase 5: Blueprint Review - Cash on Delivery (COD)

## 👨‍💻 Expert 1: Security Architect
**Review**: Approved with caution.
- **Concern**: The `payment_intents` status `succeeded` for COD might be confusing. 
- **Recommendation**: Use status `succeeded` for consistency with the `order-worker` filter, but ensure the `metadata` clearly states `payment_confirmed_at_delivery: true`.

## ⚡ Expert 2: Performance Engineer
**Review**: Approved.
- **Comment**: Enqueueing the job immediately is the right approach to keep the UI responsive. The worker will handle the transactional DB load.

## 🗄️ Expert 3: Data Architect
**Review**: Approved.
- **Comment**: Adding `payment_method` to `orders` is essential for analytics. Ensure the `process_order_with_occ` RPC handles the mapping correctly.

## 🎨 Expert 4: Frontend/UX Engineer
**Review**: Approved.
- **Recommendation**: Add a clear "Pay on delivery" badge in the order success screen for COD orders to reassure the user.

## 🔬 Expert 5: Principal Engineer
**Review**: Approved.
- **Concern**: What if the user cancels a COD order?
- **Response**: The existing `orders` table has `canceled_at`, and we should ensure that canceling a COD order also releases inventory (which is already part of the system).
