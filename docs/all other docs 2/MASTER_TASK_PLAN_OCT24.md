# 🚀 MASTER TASK PLAN - OCTOBER 24, 2025
**Following Universal AI Excellence Protocol v2.0**

---

## 📋 TASKS OVERVIEW

| Priority | Task | Status | Complexity | Est. Time |
|----------|------|--------|------------|-----------|
| 1 | Vendor Contact Flow Verification | 🔄 Testing | Low | 30 min |
| 2 | Cart/Checkout Bug Fixes | 🐛 Critical | Medium | 2 hours |
| 3 | Stylish Rating System | 🆕 New Feature | High | 4-6 hours |
| 4 | Modal Transparency Fix | 🎨 Polish | Low | 15 min |

---

## TASK A: VENDOR CONTACT INFO - END-TO-END VERIFICATION

### Current Status:
✅ Database columns added (contact_name, contact_email, contact_phone)
✅ RPC updated to store contact info
✅ RPC updated to fetch contact info
✅ Frontend displays vendor contact cards
✅ Existing vendors backfilled

### Required Testing:
1. **New Vendor Application Flow**
   - Vendor submits application with email/phone
   - Check if data stored in vendor_profiles
   - Admin approves vendor
   - Place order with that vendor's product
   - Track order - verify vendor contact card shows

2. **Existing Vendor Flow**
   - Check swastika vendor data
   - Track order ORD-20251024-82773
   - Verify email: swastika@gmail.com
   - Verify phone: +9779847468175

### Test Plan:
- [ ] Query database for vendor_profiles schema
- [ ] Check live RPC function definition
- [ ] Test track order API response
- [ ] Verify frontend displays correctly
- [ ] Test both email and phone buttons work

---

## TASK B: STYLISH RATING SYSTEM

### Requirements Analysis:
- Simple rating system (1-5 stars)
- Rate after appointment is completed
- Display rating on Book a Stylist page
- Display on stylist profile pages
- No complex reviews, just rating + optional note

### User Flow:
1. **Booking Phase**
   - Customer books appointment with stylist
   - Status: pending → confirmed → in_progress → completed

2. **Completion Phase**
   - Stylist can mark as completed (only after appointment time passed)
   - Can mark ~30 minutes before actual time (buffer)

3. **Rating Phase**
   - Customer sees "Rate your stylist" prompt
   - Submits rating (1-5 stars) + optional note
   - Rating stored and reflected in stylist profile

4. **Display Phase**
   - Book a Stylist page shows average rating
   - Stylist profiles show average rating + count

### Technical Investigation Needed:
- [ ] Check bookings table schema
- [ ] Check if ratings table exists
- [ ] Check completion logic in database
- [ ] Check time-based validation
- [ ] Check existing booking status flow
- [ ] Find all places stylist info is displayed

---

## TASK C: CART/CHECKOUT BUG FIXES

### Bug 1: Services Not Going to Checkout
**Symptom**: Only products reach checkout, services stay in cart
**Evidence**: 
- Console shows booking items: [{...}]
- CheckoutClient shows: Combined items: []
- Decoupled store has bookings

**Investigation Needed**:
- [ ] Check CheckoutClient.tsx logic
- [ ] Check decoupled cart store
- [ ] Check cart API integration
- [ ] Test service booking flow end-to-end

### Bug 2: Remove Product Variant ID Error
**Symptom**: Error "variant_id is required for remove action" but item removes successfully
**Evidence**: Console error but operation succeeds

**Investigation Needed**:
- [ ] Find removeProductItem function
- [ ] Check variant_id validation logic
- [ ] Verify if error is false positive

### Bug 3: Decoupled Store Issues
**Symptom**: Services stored in localStorage, not syncing with checkout
**Investigation Needed**:
- [ ] Review decoupled cart architecture
- [ ] Check localStorage sync logic
- [ ] Verify booking expiry logic

---

## TASK D: MODAL TRANSPARENCY FIX

### Issue:
Modals (like booking details modal) are too transparent - hard to read content

### Investigation Needed:
- [ ] Find modal components
- [ ] Check backdrop opacity
- [ ] Check modal background color
- [ ] Update to more opaque design

---

## 🎯 EXECUTION ORDER

### Phase 1: Quick Verification (30 min)
1. Verify vendor contact info works end-to-end
2. Fix modal transparency

### Phase 2: Critical Bugs (2 hours)
3. Fix cart/checkout issues
4. Test service booking flow

### Phase 3: New Feature (4-6 hours)
5. Implement stylish rating system following full protocol

---

## 📊 SUCCESS CRITERIA

### Task A: Vendor Contact Info
- ✅ New vendor application stores contact info
- ✅ Track order shows correct vendor contact
- ✅ Email and phone buttons work

### Task B: Stylish Rating System
- ✅ Customers can rate after completion
- ✅ Ratings stored in database
- ✅ Average rating displayed on booking page
- ✅ Rating count shown
- ✅ Stylist profile shows rating

### Task C: Cart/Checkout
- ✅ Services reach checkout page
- ✅ No variant_id errors
- ✅ Decoupled store syncs correctly
- ✅ Booking items display in checkout

### Task D: Modal Transparency
- ✅ Modal background more opaque
- ✅ Content clearly readable
- ✅ Professional appearance

---

**Let's begin with Task A verification, then proceed systematically through all tasks!**
