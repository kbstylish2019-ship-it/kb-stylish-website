# End-to-End Testing Plan: Live Order Pipeline
**Principal QA Architect Implementation**

## Testing Infrastructure Layer 3: Complete System Verification Protocol

This document provides the comprehensive manual testing protocol for validating the entire Live Order Pipeline from cart population to database verification.

---

## **Pre-Test Setup Requirements**

### Environment Configuration
- **Server**: Development server running on `localhost:3000`
- **Database**: Supabase project accessible via MCP tools
- **Browser**: Chrome/Firefox with DevTools open
- **Network Tab**: Monitoring enabled for API calls
- **Console Tab**: Monitoring enabled for debug logs

### Required Test Data
- **Active Products**: At least 2-3 products with available inventory
- **User Account**: Authenticated user (recommended) or guest session
- **Payment Methods**: eSewa, Khalti, and Cash on Delivery options available

### Browser Preparation
```bash
# Clear all application data
- Clear localStorage
- Clear sessionStorage  
- Clear cookies for localhost:3000
- Disable cache (recommended)
```

---

## **Test Scenario 1: Successful Order Flow (Happy Path)**

### **Step 1: Cart Population**
**Objective**: Populate cart with test items

1. Navigate to `http://localhost:3000/shop`
2. **Verify**: Product grid loads with available items
3. Select first product (e.g., "Premium T-Shirt")
4. **Action**: Click "Add to Cart" button
5. **Verify**: Success notification appears
6. **Verify**: Cart icon shows item count
7. Repeat for second product (e.g., "Designer Jeans")
8. **Network Verification**: 
   - Monitor `cart-manager` Edge Function calls
   - Verify status 200 responses
   - Check response includes `cart_items` array

**Expected Console Logs**:
```
[CartAPI] addToCart called with: {variant_id: "...", quantity: 1}
[CartAPI] Using authenticated headers for user: [user_id]
[Store] Cart updated with items: Array(2)
```

### **Step 2: Navigate to Checkout**
**Objective**: Access checkout interface

1. **Action**: Click cart icon or navigate to `/checkout`
2. **Verify**: Checkout page loads with cart items displayed
3. **Verify**: Item details visible (name, price, quantity, variant)
4. **Verify**: Order summary shows correct subtotals
5. **Verify**: "Place Order" button is initially disabled

**Expected Console Logs**:
```
[CheckoutClient] Raw cart items: Array(2)
```

### **Step 3: Form Completion**
**Objective**: Fill all required checkout fields

**Address Information**:
```
Full Name: John Doe Smith
Phone: +977-9841234567
City: Kathmandu
Area/Street: Thamel Marg
Province: Bagmati Province
Apartment/Floor: (optional) 2nd Floor
```

**Payment Selection**:
- **Action**: Select "eSewa" payment method
- **Verify**: eSewa button shows as selected (highlighted)
- **Verify**: "Place Order" button becomes enabled

**Form Validation Checks**:
- Try leaving name field empty → Button should remain disabled
- Try invalid phone format → Button should remain disabled  
- Complete all required fields → Button should enable

### **Step 4: Order Placement**
**Objective**: Execute the complete order flow

1. **Action**: Click "Place Order" button
2. **Immediate Verification**:
   - Button text changes to "Processing Order..."
   - Loading spinner appears
   - Button becomes disabled
   - Security badge hides during processing

3. **Network Monitoring**:
   - **API Call**: `create-order-intent` Edge Function
   - **Method**: POST
   - **Expected Response Time**: 200-500ms
   - **Status Code**: 200

**Expected Request Payload**:
```json
{
  "shipping_address": {
    "name": "John Doe Smith",
    "phone": "+977-9841234567", 
    "address_line1": "Thamel Marg",
    "address_line2": "2nd Floor",
    "city": "Kathmandu",
    "state": "Bagmati Province",
    "postal_code": "44600",
    "country": "NP"
  },
  "metadata": {
    "source": "web_checkout",
    "timestamp": "2025-09-22T..."
  }
}
```

**Expected Response Structure**:
```json
{
  "success": true,
  "payment_intent_id": "pi_mock_[timestamp]_[random]",
  "client_secret": "pi_mock_..._secret_...",
  "amount_cents": 16094,
  "expires_at": "2025-09-22T10:15:00.000Z"
}
```

### **Step 5: Success Flow Verification**
**Objective**: Validate post-order UI behavior

1. **Wait**: ~2 seconds for mock payment processing
2. **Success Modal Verification**:
   - Modal appears with "Order Placed Successfully!" header
   - Order confirmation number displayed (last 8 chars of payment_intent_id)
   - Total amount shows correct value (not NPR 0)
   - Green checkmark icon visible
   - Professional gradient styling applied

3. **Cart State Verification**:
   - **Wait**: 500ms after modal appears
   - Cart should be cleared (items array becomes empty)
   - Cart icon should show 0 items

4. **Auto-Redirect Verification**:
   - **Wait**: 5 seconds after modal appears
   - Modal should automatically close
   - Browser should redirect to home page (`/`)

**Expected Console Logs Sequence**:
```
[CheckoutClient] Creating order intent with address: {fullName: "...", ...}
[CartAPI] Using authenticated headers for user: [user_id]
[CheckoutClient] Order intent response: {success: true, payment_intent_id: "...", ...}
[CheckoutClient] Payment intent created: pi_mock_...
[CartAPI] Using authenticated headers for user: [user_id] 
[CheckoutClient] Raw cart items: []
[CheckoutClient] Order complete! Would redirect to: /order-confirmation/pi_mock_...
```

---

## **Test Scenario 2: Error Handling Verification**

### **Scenario 2A: Insufficient Inventory Error**

**Setup**: Ensure one cart item has insufficient stock in database

1. Follow Steps 1-3 from Scenario 1
2. **Action**: Click "Place Order"
3. **Expected Response**:
```json
{
  "success": false,
  "error": "Inventory reservation failed", 
  "details": ["Insufficient inventory for SKU-ABC-123"]
}
```
4. **UI Verification**:
   - Error message displays: "Some items in your cart are no longer available. Please review your cart."
   - Red error box with warning icon
   - "Dismiss" button available
   - Order processing stops
   - "Place Order" button re-enables

### **Scenario 2B: Authentication Error**

**Setup**: Clear authentication tokens/cookies

1. **Action**: Clear browser localStorage and cookies
2. Follow Steps 1-3 from Scenario 1 as guest user
3. **Action**: Click "Place Order"
4. **Expected Response**:
```json
{
  "success": false,
  "error": "Authentication required"
}
```
5. **UI Verification**:
   - Error message: "Please sign in to place an order."
   - Error dismissible
   - Button re-enables for retry

### **Scenario 2C: Network Error Simulation**

**Setup**: Simulate network failure

1. **Action**: Open DevTools → Network → Enable "Offline" mode
2. Follow Steps 1-3 from Scenario 1
3. **Action**: Click "Place Order"
4. **UI Verification**:
   - Error message: "An unexpected error occurred. Please try again."
   - Network request fails in DevTools
   - Button re-enables after error

---

## **Test Scenario 3: Database Verification Protocol**

### **Pre-Order Database State**
**Objective**: Establish baseline database state

Execute these SQL queries via MCP tools:

```sql
-- 1. Check cart state before order
SELECT 
    c.id as cart_id,
    c.user_id,
    ci.variant_id,
    ci.quantity,
    ci.price_snapshot
FROM carts c
JOIN cart_items ci ON c.id = ci.cart_id
WHERE c.user_id = '[USER_ID]'
ORDER BY ci.added_at DESC;

-- 2. Check inventory levels before order
SELECT 
    variant_id,
    quantity_available,
    quantity_reserved,
    version,
    updated_at
FROM inventory 
WHERE variant_id IN ('[VARIANT_1]', '[VARIANT_2]')
ORDER BY updated_at DESC;

-- 3. Check payment intent count
SELECT COUNT(*) as payment_intent_count
FROM payment_intents 
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

**Record Baseline Values**:
- Cart item count: `_____`
- Available inventory for variant 1: `_____`
- Available inventory for variant 2: `_____`
- Payment intent count: `_____`

### **Post-Order Database Verification**
**Objective**: Confirm database state changes after successful order

**Immediately after order placement**, execute:

```sql
-- 1. Verify payment intent creation
SELECT 
    payment_intent_id,
    user_id,
    cart_id,
    amount_cents,
    status,
    inventory_reserved,
    provider,
    created_at,
    expires_at
FROM payment_intents 
WHERE created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results**:
- ✅ New payment intent record exists
- ✅ `status = 'pending'` or `'succeeded'` 
- ✅ `inventory_reserved = true`
- ✅ `amount_cents` matches UI total
- ✅ `expires_at` is 15 minutes from creation
- ✅ `provider = 'mock_provider'`

```sql
-- 2. Verify inventory reservation
SELECT 
    variant_id,
    quantity_available,
    quantity_reserved,
    version,
    updated_at
FROM inventory 
WHERE variant_id IN ('[VARIANT_1]', '[VARIANT_2]')
AND updated_at > NOW() - INTERVAL '2 minutes'
ORDER BY updated_at DESC;
```

**Expected Results**:
- ✅ `quantity_available` decreased by cart quantity
- ✅ `quantity_reserved` increased by cart quantity  
- ✅ `version` incremented (OCC)
- ✅ `updated_at` timestamp recent

```sql
-- 3. Verify cart clearing (after 500ms delay)
SELECT COUNT(*) as remaining_cart_items
FROM cart_items ci
JOIN carts c ON c.id = ci.cart_id
WHERE c.user_id = '[USER_ID]';
```

**Expected Results**:
- ✅ `remaining_cart_items = 0`

### **Long-Term Database Verification** 
**Objective**: Verify order creation after webhook processing

**Execute after simulated webhook processing**:

```sql
-- 1. Check if order was created (via webhook simulation)
SELECT 
    o.id as order_id,
    o.customer_id,
    o.payment_intent_id,
    o.status,
    o.total_amount_cents,
    o.created_at,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.payment_intent_id = '[PAYMENT_INTENT_ID]'
GROUP BY o.id;

-- 2. Check order items details
SELECT 
    oi.variant_id,
    oi.quantity,
    oi.unit_price_cents,
    oi.line_total_cents
FROM order_items oi
JOIN orders o ON o.id = oi.order_id  
WHERE o.payment_intent_id = '[PAYMENT_INTENT_ID]'
ORDER BY oi.created_at;

-- 3. Check job queue processing
SELECT 
    job_type,
    status,
    created_at,
    completed_at,
    error_message
FROM job_queue 
WHERE job_data->>'payment_intent_id' = '[PAYMENT_INTENT_ID]'
ORDER BY created_at DESC;
```

**Expected Results**:
- ✅ Order record created with `status = 'confirmed'`
- ✅ Order items match cart contents
- ✅ Total amounts match payment intent
- ✅ Job queue shows `status = 'completed'`

---

## **Test Scenario 4: Edge Cases & Stress Testing**

### **Scenario 4A: Concurrent Order Attempts**
**Objective**: Test double-click prevention

1. Complete address form and select payment
2. **Action**: Rapidly double-click "Place Order" button
3. **Verification**:
   - Only one API call made
   - Button disabled after first click
   - No duplicate payment intents created

### **Scenario 4B: Browser Refresh During Processing**
**Objective**: Test mid-process interruption

1. Click "Place Order"
2. **Action**: Immediately refresh browser (F5)
3. **Verification**:
   - Check database for orphaned payment intents
   - Verify inventory reservations expire properly
   - Cart state should be preserved

### **Scenario 4C: Large Cart Volume**
**Objective**: Test performance with multiple items

1. Add 10+ different products to cart
2. Complete checkout flow
3. **Performance Verification**:
   - API response time < 1 second
   - UI remains responsive
   - All items processed correctly

---

## **Performance Benchmarks**

### **Response Time Targets**
- **Cart Operations**: < 300ms
- **Order Intent Creation**: < 500ms 
- **Mock Payment Processing**: ~2000ms (simulated)
- **Total Order Flow**: < 3 seconds
- **UI State Updates**: < 100ms

### **Database Performance**
- **Inventory Reservation**: < 200ms
- **Payment Intent Creation**: < 100ms
- **Cart Clearing**: < 50ms

### **Network Efficiency**
- **Request Size**: < 2KB
- **Response Size**: < 1KB
- **Compression**: Enabled
- **Caching Headers**: Appropriate

---

## **Test Data Recording Template**

### **Test Execution Log**

| Test Run | Date/Time | Scenario | Status | Issues Found | Notes |
|----------|-----------|----------|--------|--------------|--------|
| 1 | 2025-09-22 09:00 | Happy Path | ✅ Pass | None | Perfect flow |
| 2 | 2025-09-22 09:15 | Inventory Error | ✅ Pass | None | Error handling works |
| 3 | 2025-09-22 09:30 | Network Error | ⚠️ Issue | Modal stuck | Fixed in v2.1 |

### **Bug Report Template**

**Bug ID**: E2E-001  
**Severity**: High/Medium/Low  
**Summary**: Brief description  
**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Result**: What should happen  
**Actual Result**: What actually happened  
**Database State**: SQL query results  
**Console Logs**: Relevant log entries  
**Network Traffic**: Request/response details  

---

## **Quality Gate Criteria**

### **Must Pass (Blocking)**
- ✅ Happy path completes end-to-end
- ✅ All error scenarios display correct messages
- ✅ Database state changes correctly
- ✅ No JavaScript errors in console
- ✅ No network request failures (except intentional)
- ✅ Loading states function properly
- ✅ Success modal displays and closes

### **Should Pass (Warning)**
- ✅ Performance targets met
- ✅ Concurrent usage handled
- ✅ Browser refresh recovery works
- ✅ Large cart volumes supported

### **Enhancement Opportunities**
- 🔄 Real payment provider integration
- 🔄 Email confirmation system
- 🔄 Order tracking page
- 🔄 Inventory alerts
- 🔄 Analytics tracking

---

## **Conclusion**

This E2E testing protocol ensures the Live Order Pipeline functions correctly across all user scenarios and system states. Execute all scenarios before any production deployment.

**Quality Assurance Sign-off Required**: ☐ Complete  
**Principal QA Architect Approval**: ☐ Pending  
**Production Deployment Readiness**: ☐ Conditional on test results

---

*"Testing is not just about finding bugs. It's about ensuring confidence in our system's reliability under all conditions."*

**Document Version**: 1.0  
**Last Updated**: September 22, 2025  
**Next Review**: Post-Production Launch
