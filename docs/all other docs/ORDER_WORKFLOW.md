# 📦 Order Workflow & Vendor Actions

## Overview
This document explains the complete order lifecycle from the vendor's perspective and what actions vendors can take at each stage.

---

## 🔄 Order Lifecycle States

### 1. **Confirmed** (`confirmed`)
**What it means**: Customer has completed payment, order is active

**Vendor Can See**:
- ✅ Order number (#ORD-YYYYMMDD-XXXXX)
- ✅ Customer name and shipping address
- ✅ Customer phone number
- ✅ Product details (name, SKU, quantity)
- ✅ Total amount for their items
- ✅ Fulfillment status: `pending`

**Vendor Actions Required**:
1. Review the order details
2. Verify inventory is available
3. Prepare items for shipment
4. Update fulfillment status to `processing` (when packing)
5. Update to `shipped` (when dispatched)
6. Add tracking information (if available)

---

### 2. **Processing** (`processing`)
**What it means**: Vendor is preparing the order for shipment

**Vendor Actions**:
- Pack the items securely
- Print shipping label
- Prepare invoice/packing slip
- Update status when ready to ship

---

### 3. **Shipped** (`shipped`)
**What it means**: Items have been dispatched to customer

**Vendor Must Provide**:
- Shipping carrier name
- Tracking number (if available)
- Expected delivery date

**System Actions**:
- Customer receives shipping notification
- Customer can track shipment
- Earnings move to "Pending Payout"

---

### 4. **Delivered** (`delivered`)
**What it means**: Customer has received the items

**System Actions**:
- Order marked complete
- Customer can leave review
- Vendor earnings eligible for payout
- Commission (15%) deducted
- Net amount (85%) added to payout balance

---

### 5. **Cancelled** (`cancelled`)
**What it means**: Order was cancelled (by customer or admin)

**Financial Impact**:
- No earnings for vendor
- Inventory returned to available stock
- Refund issued to customer

---

## 💰 Payment & Payout Flow

### How Vendors Get Paid

```
Order Confirmed
    ↓
Vendor Ships Item
    ↓
Customer Receives (Delivered)
    ↓
Platform deducts 15% commission
    ↓
Vendor gets 85% in Pending Balance
    ↓
Payout processed (1st & 15th of month)
    ↓
Money transferred to vendor's bank/eSewa
```

### Payout Schedule
- **Frequency**: Twice per month
- **Dates**: 1st and 15th of each month
- **Minimum**: NPR 1,000 to initiate payout
- **Processing Time**: 2-3 business days

### Commission Structure
- **Platform Fee**: 15% of item total
- **Vendor Receives**: 85% of item total
- **Example**: 
  - Item sold for NPR 100
  - Platform fee: NPR 15
  - Vendor receives: NPR 85

---

## 🎯 Current Implementation Status

### ✅ Implemented
- [x] Order display with full details
- [x] Real-time dashboard metrics
- [x] Revenue tracking
- [x] Commission calculation
- [x] Order filtering and search

### 🚧 In Development (Beta Launch Required)
- [ ] Fulfillment status updates
- [ ] Tracking number input
- [ ] Payout request system
- [ ] Payout history with real data
- [ ] Bank account/eSewa integration
- [ ] Automated payout processing

### 📋 Planned Features
- [ ] Bulk order processing
- [ ] Print shipping labels
- [ ] Order notifications (email/SMS)
- [ ] Return/refund management
- [ ] Analytics and insights

---

## 🛠️ For Beta Launch - Priority Items

### 1. **Payout System** (CRITICAL)
**What's Needed**:
- Vendor bank account / eSewa details collection
- Payout request workflow
- Admin approval system
- Real transaction records
- Payment proof uploads

**Current State**:
- ✅ Payout page UI exists
- ❌ Using mock data (NPR 105,500)
- ❌ No real transaction history
- ❌ No request/approval flow

**Action Items**:
1. Create `payouts` table schema
2. Create `payout_requests` table
3. Add bank/eSewa details to vendor profile
4. Implement request creation
5. Admin approval workflow
6. Transaction recording

---

### 2. **Order Status Updates** (HIGH PRIORITY)
**What's Needed**:
- UI for vendors to update fulfillment status
- Dropdown/buttons for status changes
- Tracking number input field
- Customer notification triggers
- History/audit log

**Current State**:
- ✅ Orders display correctly
- ❌ No way to update status
- ❌ No tracking number storage

**Action Items**:
1. Add status update UI to order cards
2. Create `update_fulfillment_status` function
3. Add `tracking_number` column to order_items
4. Implement status change notifications
5. Add audit trail

---

### 3. **Revenue Accuracy** (COMPLETED ✅)
- ✅ Admin vendors page now shows correct revenue
- ✅ Dashboard metrics real-time
- ✅ Commission calculations correct
- ✅ Multi-vendor order handling

---

## 📊 Order Display Logic

### For Multi-Vendor Orders
When a customer orders from multiple vendors in one transaction:

**Customer Sees**:
- Single order with all items
- One order number
- Total amount for entire order

**Each Vendor Sees**:
- Same order number
- ONLY their items
- ONLY their portion of total
- Same customer/shipping info

**Example**:
```
Customer Order #ORD-20251014-28763 (NPR 6,952)
├─ Vendor A items: NPR 6,484 (rabindra prasad sah product)
└─ Vendor B items: NPR 468 (lksdnfjlsjk product)

Vendor A Dashboard: Shows NPR 6,484
Vendor B Dashboard: Shows NPR 468
Admin Dashboard: Shows NPR 6,952 (full amount)
```

---

## 🔐 Security & Permissions

### What Vendors CAN See
- ✅ Orders containing their products
- ✅ Customer shipping details (for fulfillment)
- ✅ Their own revenue and metrics
- ✅ Their product performance

### What Vendors CANNOT See
- ❌ Other vendors' orders
- ❌ Other vendors' revenue
- ❌ Platform-wide metrics
- ❌ Customer payment details
- ❌ Admin functions

---

## 📞 Support & Questions

**For Vendors**:
- Contact Support through dashboard
- Email: support@kbstylish.test
- Response time: 24-48 hours

**For Customers**:
- Order tracking page
- Contact vendor through platform
- Platform support for disputes

---

## 🚀 Next Steps for Beta Launch

1. **Implement Payout System** (2-3 days)
   - Database schema
   - Request workflow
   - Admin approval UI

2. **Add Status Updates** (1-2 days)
   - UI components
   - Backend functions
   - Notifications

3. **Testing** (1 day)
   - End-to-end order flow
   - Payout calculations
   - Multi-vendor scenarios

4. **Documentation** (ongoing)
   - Vendor onboarding guide
   - FAQ
   - Video tutorials

---

**Last Updated**: October 14, 2025, 4:45 PM NPT  
**Status**: Orders ✅ | Payouts ✅ | Status Updates ✅ | Cancellation ✅
