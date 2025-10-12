# **Frontend Integration Quick Start**
## **Payment Gateway Integration - Developer Handoff**

**Last Updated:** 2025-09-30  
**Backend Status:** ✅ 100% Complete  
**Frontend Status:** ⏳ Pending Integration  

---

## **🎯 WHAT YOU NEED TO BUILD**

### **1. Payment Callback Page** (Priority: 🔴 CRITICAL)
**File:** `src/app/payment/callback/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function PaymentCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    verifyPayment();
  }, []);

  async function verifyPayment() {
    const provider = searchParams.get('provider'); // 'esewa' or 'khalti'
    const transactionUuid = searchParams.get('transaction_uuid'); // eSewa
    const pidx = searchParams.get('pidx'); // Khalti

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          transaction_uuid: transactionUuid,
          pidx
        })
      });

      const result = await response.json();

      if (result.success) {
        setStatus('success');
        // Wait 2 seconds then redirect
        setTimeout(() => {
          router.push(`/orders/${result.payment_intent_id}`);
        }, 2000);
      } else {
        setStatus('error');
        setError(result.error || 'Payment verification failed');
      }
    } catch (err) {
      setStatus('error');
      setError('Network error during verification');
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-lg">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold">Payment Successful!</h1>
          <p className="mt-2 text-gray-600">Redirecting to your order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold">Payment Failed</h1>
        <p className="mt-2 text-gray-600">{error}</p>
        <button
          onClick={() => router.push('/checkout')}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Return to Checkout
        </button>
      </div>
    </div>
  );
}
```

---

### **2. Update CheckoutClient.tsx** (Priority: 🔴 CRITICAL)

**File:** `src/components/checkout/CheckoutClient.tsx`

#### **Step 1: Add Payment Method Selector**

```typescript
const [paymentMethod, setPaymentMethod] = useState<'esewa' | 'khalti'>('esewa');

// Add to UI before "Place Order" button:
<div className="mb-4">
  <label className="block text-sm font-medium mb-2">Payment Method</label>
  <div className="flex gap-4">
    <label className="flex items-center">
      <input
        type="radio"
        value="esewa"
        checked={paymentMethod === 'esewa'}
        onChange={(e) => setPaymentMethod(e.target.value as 'esewa' | 'khalti')}
        className="mr-2"
      />
      <img src="/esewa-logo.png" alt="eSewa" className="h-8" />
    </label>
    <label className="flex items-center">
      <input
        type="radio"
        value="khalti"
        checked={paymentMethod === 'khalti'}
        onChange={(e) => setPaymentMethod(e.target.value as 'esewa' | 'khalti')}
        className="mr-2"
      />
      <img src="/khalti-logo.png" alt="Khalti" className="h-8" />
    </label>
  </div>
</div>
```

#### **Step 2: Update onPlaceOrder Handler**

```typescript
async function onPlaceOrder() {
  setIsProcessing(true);
  setError(null);

  try {
    // Call create-order-intent with payment method
    const response = await cartClient.createOrderIntent({
      payment_method: paymentMethod,
      shipping_address: {
        name: address.fullName,
        phone: address.phone,
        address_line1: address.area,
        address_line2: address.landmark || undefined,
        city: address.city,
        state: address.region,
        postal_code: address.postalCode,
        country: 'Nepal'
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to create order intent');
    }

    // Handle eSewa: Auto-submit form
    if (response.payment_method === 'esewa') {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = response.payment_url!;

      // Add all form fields
      Object.entries(response.form_fields!).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    }
    // Handle Khalti: Direct redirect
    else if (response.payment_method === 'khalti') {
      window.location.href = response.payment_url!;
    }

  } catch (err: any) {
    setError(err.message || 'Failed to process payment');
    setIsProcessing(false);
  }
}
```

---

### **3. Update cartClient.ts** (Priority: 🟡 MEDIUM)

**File:** `src/lib/api/cartClient.ts`

#### **Update createOrderIntent() Method (lines 473-508)**

```typescript
interface CreateOrderIntentRequest {
  payment_method: 'esewa' | 'khalti';
  shipping_address?: {
    name: string;
    phone: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country?: string;
  };
  metadata?: Record<string, any>;
}

interface CreateOrderIntentResponse {
  success: boolean;
  payment_intent_id?: string;
  payment_method?: 'esewa' | 'khalti';
  payment_url?: string;
  form_fields?: Record<string, string>; // eSewa only
  amount_cents?: number;
  expires_at?: string;
  error?: string;
  details?: any;
}

async createOrderIntent(
  request: CreateOrderIntentRequest
): Promise<CreateOrderIntentResponse> {
  const session = await this.supabase.auth.getSession();
  
  if (!session.data.session?.access_token) {
    return {
      success: false,
      error: 'Authentication required'
    };
  }

  const response = await fetch(
    `${this.supabaseUrl}/functions/v1/create-order-intent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session.access_token}`,
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error || 'Failed to create order intent'
    };
  }

  return await response.json();
}
```

---

## **🧪 TESTING CHECKLIST**

### **Before You Start:**
- [ ] Backend Edge Functions deployed (verify in Supabase dashboard)
- [ ] Test environment variables configured
- [ ] You have test user credentials

### **Test Flow:**
1. [ ] Add items to cart
2. [ ] Navigate to checkout
3. [ ] Fill in shipping address
4. [ ] Select payment method (eSewa or Khalti)
5. [ ] Click "Place Order"
6. [ ] **eSewa**: Form auto-submits → redirected to eSewa test page
7. [ ] **Khalti**: Redirected to Khalti payment page
8. [ ] Complete payment on gateway (use test credentials)
9. [ ] Gateway redirects to `/payment/callback?provider=esewa&transaction_uuid=...`
10. [ ] Verify loading spinner appears
11. [ ] Verify success message appears
12. [ ] Verify redirect to order confirmation

### **Database Verification:**
```sql
-- Check payment_intent was created
SELECT * FROM payment_intents 
WHERE external_transaction_id IS NOT NULL
ORDER BY created_at DESC LIMIT 1;

-- Check verification was recorded
SELECT * FROM private.payment_gateway_verifications
ORDER BY verified_at DESC LIMIT 1;

-- Check job was enqueued
SELECT * FROM job_queue
WHERE job_type = 'finalize_order'
ORDER BY created_at DESC LIMIT 1;
```

---

## **🔑 TEST CREDENTIALS**

### **eSewa Test:**
```
Login: 9806800001 (or 002, 003, 004, 005)
Password: Nepal@123
MPIN: 1122
Token: 123456
```

### **Khalti Test:**
```
Use Khalti test credentials from their dashboard
(Register at https://test-admin.khalti.com/)
```

---

## **🐛 TROUBLESHOOTING**

### **"Authentication required" error:**
```typescript
// Check: User is logged in before checkout
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  router.push('/login');
  return;
}
```

### **"Cart is empty" error:**
```typescript
// Check: Cart has items
const cart = useCartStore(state => state.items);
if (cart.length === 0) {
  alert('Your cart is empty');
  return;
}
```

### **"Payment intent not found" in callback:**
```
Possible causes:
1. User landed on callback page without going through payment
2. Transaction ID in URL is incorrect
3. Database issue

Check Supabase logs for verify-payment Edge Function
```

### **CORS errors:**
```typescript
// Ensure NEXT_PUBLIC_SUPABASE_URL is set correctly
// Ensure callback URL is whitelisted in Supabase Auth settings
```

---

## **📚 API REFERENCE**

### **create-order-intent Edge Function**

**Endpoint:** `POST /functions/v1/create-order-intent`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "payment_method": "esewa",
  "shipping_address": {
    "name": "John Doe",
    "phone": "9841234567",
    "address_line1": "Thamel",
    "city": "Kathmandu",
    "state": "Bagmati",
    "postal_code": "44600"
  }
}
```

**Response (eSewa):**
```json
{
  "success": true,
  "payment_intent_id": "pi_esewa_1727668800_abc12345",
  "payment_method": "esewa",
  "payment_url": "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
  "form_fields": {
    "amount": "1000.00",
    "total_amount": "1000.00",
    "transaction_uuid": "abc-123-def-456",
    "product_code": "EPAYTEST",
    "signature": "base64_signature",
    "success_url": "https://yourdomain.com/payment/callback?provider=esewa",
    "failure_url": "https://yourdomain.com/checkout"
  },
  "amount_cents": 100000,
  "expires_at": "2025-09-30T09:30:00Z"
}
```

**Response (Khalti):**
```json
{
  "success": true,
  "payment_intent_id": "pi_khalti_1727668800_HT6o6PEZ",
  "payment_method": "khalti",
  "payment_url": "https://pay.khalti.com/?pidx=HT6o6PEZRWFJ5ygavzHWd5",
  "amount_cents": 100000,
  "expires_at": "2025-09-30T09:30:00Z"
}
```

---

### **verify-payment Edge Function**

**Endpoint:** `POST /functions/v1/verify-payment`

**Headers:**
```
Content-Type: application/json
```

**Request Body (eSewa):**
```json
{
  "provider": "esewa",
  "transaction_uuid": "abc-123-def-456"
}
```

**Request Body (Khalti):**
```json
{
  "provider": "khalti",
  "pidx": "HT6o6PEZRWFJ5ygavzHWd5"
}
```

**Response (Success):**
```json
{
  "success": true,
  "payment_intent_id": "pi_esewa_1727668800_abc12345",
  "amount_cents": 100000,
  "details": {
    "provider": "esewa",
    "external_transaction_id": "abc-123-def-456",
    "verified_amount": 100000,
    "gateway_response": { ... }
  }
}
```

**Response (Already Verified - Idempotent):**
```json
{
  "success": true,
  "payment_intent_id": "pi_esewa_1727668800_abc12345",
  "amount_cents": 100000,
  "already_verified": true,
  "details": { ... }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Payment amount mismatch - possible fraud attempt"
}
```

---

## **⚡ QUICK TIPS**

1. **Always check `response.success` before proceeding**
2. **eSewa requires form POST, Khalti requires redirect**
3. **Callback page should work even if user refreshes** (idempotent)
4. **Show loading state during verification** (takes 1-2 seconds)
5. **Handle errors gracefully** (network issues, gateway downtime)
6. **Test with multiple payment methods** (don't hardcode eSewa only)

---

## **📞 SUPPORT**

**Backend Architecture:** See `PHASE_3_IMPLEMENTATION_REPORT.md`  
**Security Audit:** See `PHASE_3_TEST_VERIFICATION_REPORT.md`  
**Payment Blueprint:** See `NEPAL_PAYMENT_GATEWAY_BLUEPRINT_V3.1.md`  

**Edge Function Logs:** Supabase Dashboard → Edge Functions → Logs  
**Database Queries:** Use Supabase Dashboard → SQL Editor  

---

**Good luck with the integration! The backend is rock-solid. Now make it shine! ✨**
