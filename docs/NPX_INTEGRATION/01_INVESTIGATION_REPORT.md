# Nepal Payment (NPX) Gateway Integration - Investigation Report

**Date**: November 11, 2025  
**Status**: Phase 1 - Deep Investigation  
**Priority**: CRITICAL - Production Ready Required

---

## Executive Summary

KB Stylish is migrating from eSewa to Nepal Payment (NPX) gateway due to business conflicts with eSewa. This document outlines the complete investigation of current payment infrastructure and NPX integration requirements.

## Business Context

- **Current Gateway**: eSewa (working, tested)
- **New Gateway**: Nepal Payment / NPX Enterprise Gateway
- **Reason for Change**: Business conflict between eSewa and KB Stylish
- **Timeline**: Fast-track UAT → Production
- **Strategy**: Keep eSewa backend code but hide from frontend

## NPX Credentials (UAT)

```
Environment: UAT/Sandbox
Gateway URL: https://eg-uat.nepalpayment.com/
Merchant ID: 8574
API Username: kbstylishapi
API Password: Kb$tylish123
Security Key: Tg9#xKp3!rZq7@Lm2S

Merchant Panel:
URL: https://eg-uat.nepalpayment.com/
Username: kbstylishuser  
Password: Kbstyle$152
```

## Integration URLs

```
Success URL: https://kbstylish.com.np/payment/callback?provider=npx&status=success
Failure URL: https://kbstylish.com.np/payment/callback?provider=npx&status=failure  
Notification URL: https://kbstylish.com.np/api/npx/webhook
```

---

## Current Payment Architecture Analysis

### 1. Payment Flow Overview

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Checkout  │─────▶│ create-order-    │─────▶│ Payment Gateway │
│   Frontend  │      │ intent (Edge Fn) │      │   (eSewa/etc)   │
└─────────────┘      └──────────────────┘      └─────────────────┘
                              │                          │
                              ▼                          │
                     ┌──────────────────┐               │
                     │ payment_intents  │               │
                     │   (Database)     │               │
                     └──────────────────┘               │
                              ▲                          │
                              │                          ▼
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Payment   │◀─────│  verify-payment  │◀─────│  User Payment   │
│   Callback  │      │    (Edge Fn)     │      │  on Gateway     │
└─────────────┘      └──────────────────┘      └─────────────────┘
       │                      │
       ▼                      ▼
┌─────────────┐      ┌──────────────────┐
│ order-worker│◀─────│   job_queue      │
│  (Edge Fn)  │      │   (Database)     │
└─────────────┘      └──────────────────┘
       │
       ▼
┌─────────────┐
│   Orders    │
│  (Database) │
└─────────────┘
```

### 2. Key Files and Components

#### Backend (Supabase Edge Functions)
- `supabase/functions/_shared/esewa.ts` - eSewa integration module
- `supabase/functions/create-order-intent/index.ts` - Payment intent creation
- `supabase/functions/verify-payment/index.ts` - Payment verification
- `supabase/functions/order-worker/index.ts` - Order finalization (FIXED TODAY)

#### Frontend (Next.js)
- `src/components/checkout/CheckoutClient.tsx` - Checkout flow
- `src/app/payment/callback/page.tsx` - Payment callback handler
- `src/lib/api/cartClient.ts` - Cart API client

#### Database
- `payment_intents` table - Stores payment intent records
- `job_queue` table - Async job processing
- `orders` table - Final order records

### 3. Payment Provider Support

Current supported providers in `payment_intents.provider`:
- `esewa` ✅ (working, to be hidden)
- `khalti` (exists in code)
- `stripe` (exists in code)
- `mock` (test mode)
- **`npx`** ❌ (to be added)

---

## eSewa Integration Analysis (Reference for NPX)

### eSewa Module Structure (`_shared/esewa.ts`)

```typescript
export interface EsewaConfig {
  merchantCode: string;
  secretKey: string;
  testMode: boolean;
}

// Key Functions:
1. generateEsewaSignature(secretKey, message) - HMAC-SHA256
2. verifyEsewaTransaction(config, uuid, amount) - Server verification
3. prepareEsewaPaymentForm(config, data) - Client form data
```

### eSewa Payment Flow

1. **Intent Creation**: `create-order-intent` generates payment intent
2. **Form Submission**: Client submits to eSewa gateway with signed fields
3. **User Payment**: User pays on eSewa portal
4. **Redirect**: eSewa redirects to `success_url` with `data` parameter
5. **Verification**: `verify-payment` calls eSewa API for server-to-server verification
6. **Job Enqueue**: Creates `finalize_order` job in `job_queue`
7. **Order Creation**: `order-worker` processes job, creates order

### eSewa Security Features

```typescript
// HMAC-SHA256 Signature
const message = `total_amount=${amount},transaction_uuid=${uuid},product_code=${merchantCode}`;
const signature = CryptoJS.HmacSHA256(message, secretKey);

// Integer-based amount comparison (prevents floating-point errors)
const expectedPaisa = Math.round(amountNPR * 100);
const receivedPaisa = Math.round(parseFloat(data.total_amount) * 100);

// Network timeout protection (10 seconds)
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);
```

---

## Required Changes for NPX Integration

### 1. Backend Changes

#### New File: `supabase/functions/_shared/npx.ts`
- NPX configuration interface
- Signature generation (if required by NPX)
- Payment verification function
- Form preparation function

#### Update: `supabase/functions/create-order-intent/index.ts`
- Add NPX case in provider switch
- Generate NPX payment form data

#### Update: `supabase/functions/verify-payment/index.ts`
- Add NPX verification logic
- Parse NPX callback parameters

#### New: `supabase/functions/npx-webhook/index.ts`
- Handle NPX webhook notifications
- Process async payment updates

### 2. Database Changes

#### `payment_intents` table
- Already supports `provider` column (text)
- Add 'npx' as valid provider value

#### Environment Variables
```bash
NPX_MERCHANT_ID=8574
NPX_API_USERNAME=kbstylishapi
NPX_API_PASSWORD=Kb$tylish123
NPX_SECURITY_KEY=Tg9#xKp3!rZq7@Lm2S
NPX_TEST_MODE=true  # UAT mode
```

### 3. Frontend Changes

#### `src/components/checkout/CheckoutClient.tsx`
- Add NPX as payment method option
- Hide eSewa from UI (conditional rendering)

#### `src/app/payment/callback/page.tsx`
- Add NPX provider handling
- Parse NPX callback parameters

#### `src/lib/api/cartClient.ts`
- Add NPX in payment provider types

---

## Next Steps (Phase 2: Expert Consultation)

1. ✅ Review NPX API documentation PDF
2. ⏳ Understand NPX authentication mechanism
3. ⏳ Map NPX API endpoints
4. ⏳ Identify signature/security requirements
5. ⏳ Design NPX module architecture
6. ⏳ Create integration blueprint

---

## Risk Assessment

### High Risk
- 🔴 **NPX API undocumented behavior** - Need thorough testing
- 🔴 **Webhook security** - Must validate all incoming webhooks
- 🔴 **Amount tampering** - Integer-based comparison required

### Medium Risk
- 🟡 **Gateway timeout** - Implement proper timeout handling
- 🟡 **Idempotency** - Prevent duplicate order creation
- 🟡 **Error scenarios** - Handle all failure cases

### Low Risk
- 🟢 **Frontend updates** - Simple provider switch
- 🟢 **Database changes** - No schema changes required
- 🟢 **Backend structure** - Following existing patterns

---

## Success Criteria

### UAT Phase
- ✅ Successful test payment with NPX UAT credentials
- ✅ Order created and confirmed
- ✅ Email notifications sent
- ✅ Vendor dashboard updated
- ✅ Webhook handling verified

### Production Phase
- ✅ Live payment processing
- ✅ Zero downtime deployment
- ✅ eSewa hidden from frontend but backend intact
- ✅ Comprehensive error monitoring
- ✅ Production credentials configured

---

**Next Document**: `02_API_DOCUMENTATION_REVIEW.md`
