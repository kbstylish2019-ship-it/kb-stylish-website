# 📧 P1 EMAILS - PHASE 1: CODEBASE IMMERSION

**Protocol**: UNIVERSAL AI EXCELLENCE PROTOCOL v2.0  
**Date**: October 27, 2025  
**Status**: 🔄 IN PROGRESS  
**Scope**: 4 P1 (Important) Email Types

---

## 🎯 P1 EMAIL TYPES TO IMPLEMENT

### Priority 1 (Important - High Value)
1. **Booking Reminder** - 24 hours before appointment
2. **Order Cancelled** - When customer cancels order
3. **Review Request** - After order delivered (7 days)
4. **Vendor New Order Alert** - Instant notification to vendor

---

## 📊 P1-1: BOOKING REMINDER EMAIL

### Business Logic
**Trigger**: 24 hours before scheduled appointment  
**Recipient**: Customer (from `bookings.customer_email`)  
**Purpose**: Reduce no-shows, improve customer experience

### Database Schema Analysis
```sql
-- From bookings table
bookings (
  id UUID,
  customer_email TEXT,  -- ✅ Direct email field
  customer_name TEXT,
  start_time TIMESTAMPTZ,  -- ✅ For calculating 24hr window
  status TEXT,  -- 'confirmed', 'completed', 'cancelled'
  service_name TEXT,
  stylist_user_id UUID
)

-- From stylist_profiles
stylist_profiles (
  user_id UUID,
  user_profiles (
    display_name TEXT  -- Stylist name
  )
)
```

### Trigger Mechanism
**Option A**: Cron job (runs every hour)
```sql
-- Query for bookings 24-25 hours in future
SELECT * FROM bookings
WHERE status = 'confirmed'
AND start_time BETWEEN NOW() + INTERVAL '24 hours' 
                   AND NOW() + INTERVAL '25 hours'
AND reminder_sent = false;  -- Need to add this column
```

**Option B**: Database trigger (on booking creation)
- Schedule email for (start_time - 24 hours)
- Requires job queue system

**Recommendation**: Option A (simpler, no new infrastructure)

### Code Integration Point
**New File**: `supabase/functions/booking-reminder-worker/index.ts`
- Cron schedule: `0 * * * *` (every hour)
- Query bookings 24hrs ahead
- Send emails
- Mark `reminder_sent = true`

### Email Preferences Check
```typescript
// Check if user wants reminders
const canSend = await supabase.rpc('can_send_optional_email', {
  p_user_id: booking.user_id,
  p_email_type: 'booking_reminder'
});
```

---

## 📊 P1-2: ORDER CANCELLED EMAIL

### Business Logic
**Trigger**: When customer cancels order  
**Recipient**: Customer + potentially vendor  
**Purpose**: Confirmation, refund information

### Current Cancel Flow
```typescript
// Need to find where order cancellation happens
// Likely in:
// - Customer dashboard
// - Admin panel
// - Automatic timeout cancellation
```

### Database Analysis
```sql
-- From orders table
orders (
  id UUID,
  user_id UUID,  -- Customer
  status TEXT,  -- Includes 'cancelled'
  order_number TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT  -- May need to add
)

-- Status transitions:
-- 'pending' → 'cancelled' (before payment)
-- 'payment_authorized' → 'cancelled' (after payment, needs refund)
```

### Code Search Required
**Find**:
1. Where order status changes to 'cancelled'
2. Admin cancel order function
3. Customer cancel order function
4. Automatic timeout cancellation

### Email Content Needed
```typescript
{
  customerName: string;
  orderNumber: string;
  cancelledAt: string;
  reason?: string;
  refundAmount?: number;  // If already paid
  refundETA?: string;  // "3-5 business days"
  items: Array<{name, quantity, price}>;
}
```

---

## 📊 P1-3: REVIEW REQUEST EMAIL

### Business Logic
**Trigger**: 7 days after order delivered  
**Recipient**: Customer  
**Purpose**: Collect reviews, improve seller ratings

### Database Analysis
```sql
-- From orders table
orders (
  id UUID,
  user_id UUID,
  status TEXT,  -- 'delivered'
  delivered_at TIMESTAMPTZ,  -- ✅ Exists? Need to verify
  review_requested_at TIMESTAMPTZ  -- Need to add
)

-- From reviews table
reviews (
  id UUID,
  user_id UUID,
  product_id UUID,
  rating INTEGER,
  review_text TEXT
)
```

### Trigger Mechanism
**Cron job** (runs daily):
```sql
-- Find delivered orders from 7 days ago, no review yet
SELECT o.* 
FROM orders o
LEFT JOIN reviews r ON r.user_id = o.user_id 
  AND r.product_id IN (
    SELECT product_id FROM order_items WHERE order_id = o.id
  )
WHERE o.status = 'delivered'
AND o.delivered_at BETWEEN NOW() - INTERVAL '8 days' 
                       AND NOW() - INTERVAL '7 days'
AND o.review_requested_at IS NULL
AND r.id IS NULL;  -- No review exists yet
```

### Email Content
```typescript
{
  customerName: string;
  orderNumber: string;
  deliveredDate: string;
  items: Array<{
    name: string;
    image_url: string;
    product_id: string;
    review_url: string;  // Direct link to review form
  }>;
}
```

### Code Integration
**New File**: `supabase/functions/review-request-worker/index.ts`
- Cron: `0 9 * * *` (daily at 9 AM Nepal time)
- Query eligible orders
- Send review requests
- Update `review_requested_at`

---

## 📊 P1-4: VENDOR NEW ORDER ALERT

### Business Logic
**Trigger**: Immediately when vendor receives new order  
**Recipient**: Vendor (from `vendor_profiles.contact_email`)  
**Purpose**: Fast fulfillment, reduce response time

### Current Flow Analysis
```typescript
// In order-worker/index.ts
// After order created:
// 1. Order items distributed to vendors
// 2. Each vendor should get notification

// From order_items table:
order_items (
  id UUID,
  order_id UUID,
  vendor_id UUID,  -- ✅ Vendor who owns this item
  product_name TEXT,
  quantity INTEGER,
  price_at_purchase INTEGER,
  fulfillment_status TEXT  -- 'pending', 'processing', 'shipped'
)
```

### Integration Point
**In**: `order-worker/index.ts` (after order creation)

```typescript
// After successful order creation:
// 1. Get all unique vendors from order_items
// 2. For each vendor:
//    - Aggregate their items
//    - Send "New Order" email
```

### Email Content
```typescript
{
  vendorName: string;
  orderNumber: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;  // Vendor's earnings
  }>;
  total: number;  // Total vendor earnings
  shippingAddress: string;
  dashboardUrl: string;
}
```

### Vendor Email Preferences
```typescript
// Check vendor preference
const canSend = await supabase.rpc('can_send_optional_email', {
  p_user_id: vendor_id,
  p_email_type: 'new_order_alert'
});
```

---

## 🔍 CRITICAL DISCOVERIES

### 1. Missing Database Columns
**Need to add**:
```sql
ALTER TABLE bookings ADD COLUMN reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN review_requested_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
```

### 2. New Cron Jobs Required
```
booking-reminder-worker → Every hour
review-request-worker → Daily at 9 AM
```

### 3. Code Search Needed
**Must find**:
- [ ] Order cancellation functions (customer + admin)
- [ ] Order delivery status update location
- [ ] Booking status transitions

---

## 📋 INTEGRATION COMPLEXITY MATRIX

| Email Type | Complexity | New Infrastructure | Estimated Time |
|------------|-----------|-------------------|----------------|
| Booking Reminder | 🟡 MEDIUM | Cron worker | 2 hours |
| Order Cancelled | 🟢 LOW | Just trigger | 1 hour |
| Review Request | 🟡 MEDIUM | Cron worker | 2 hours |
| Vendor New Order | 🟢 LOW | Add to existing | 1 hour |

**Total Estimated Time**: 6 hours (including testing)

---

## 🎯 NEXT STEPS (PHASE 2)

1. **Expert Panel Review**: Get feedback on triggers and timing
2. **Code Search**: Find order cancellation points
3. **Schema Updates**: Add missing columns
4. **Cron Workers**: Design architecture
5. **Templates**: Design HTML/text versions

---

**Phase 1 Complete** ✅  
**Readiness**: Atomic-level understanding achieved  
**Next**: Phase 2 - Expert Panel Consultation
