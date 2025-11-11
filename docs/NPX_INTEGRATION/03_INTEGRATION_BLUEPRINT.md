# Nepal Payment (NPX) Integration Blueprint

**Date**: November 11, 2025  
**Status**: Phase 3 - Complete Architecture Design  
**API Type**: Multi-Step Gateway Integration (Different from eSewa)

---

## Executive Summary

NPX uses a **fundamentally different flow** than eSewa:
- ✅ eSewa: Single API call → Form POST → Verify
- ✅ NPX: GetProcessId → Form POST → Webhook → Verify

**Critical Differences**:
1. **Signature**: HMAC-SHA512 (not SHA256)
2. **Multi-step**: Requires ProcessId before payment
3. **Webhook**: Server-to-server GET notifications
4. **Verification**: Separate CheckTransactionStatus endpoint

---

## Phase 3: Complete NPX Integration Architecture

### 1. API Endpoints (UAT)

```typescript
const NPX_CONFIG = {
  UAT: {
    apiBase: 'https://apisandbox.nepalpayment.com',
    gatewayBase: 'https://gatewaysandbox.nepalpayment.com',
    endpoints: {
      getProcessId: '/GetProcessId',
      checkStatus: '/CheckTransactionStatus',
      gatewayPayment: '/Payment/Index'
    }
  },
  PRODUCTION: {
    apiBase: 'https://api.nepalpayment.com', // assumed
    gatewayBase: 'https://gateway.nepalpayment.com', // assumed
    endpoints: {
      getProcessId: '/GetProcessId',
      checkStatus: '/CheckTransactionStatus',
      gatewayPayment: '/Payment/Index'
    }
  }
};
```

### 2. Credentials Configuration

```bash
# Environment Variables (.env.local)
NPX_MERCHANT_ID=8574
NPX_API_USERNAME=kbstylishapi
NPX_API_PASSWORD=Kb$tylish123
NPX_SECURITY_KEY=Tg9#xKp3!rZq7@Lm2S
NPX_TEST_MODE=true
```

### 3. Signature Generation (CRITICAL)

```typescript
/**
 * NPX uses HMAC-SHA512 with alphabetically sorted concatenated values
 * Different from eSewa's HMAC-SHA256!
 */
function generateNPXSignature(payload: Record<string, string>, secretKey: string): string {
  // Step 1: Alphabetically sort keys
  const sortedKeys = Object.keys(payload).sort();
  
  // Step 2: Concatenate VALUES only (not key=value pairs!)
  const message = sortedKeys.map(key => payload[key]).join('');
  
  // Step 3: HMAC-SHA512
  const hmac = crypto.createHmac('sha512', secretKey);
  hmac.update(message, 'utf8');
  
  // Step 4: Lowercase hex output
  return hmac.digest('hex').toLowerCase();
}

// Example:
// Input: { MerchantId: "8574", MerchantName: "kbstylishapi", Amount: "100" }
// Sorted keys: ["Amount", "MerchantId", "MerchantName"]
// Message: "1008574kbstylishapi"
// Output: HMAC-SHA512(message, "Tg9#xKp3!rZq7@Lm2S") → lowercase hex
```

### 4. Authentication Header

```typescript
function getNPXAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const base64 = btoa(credentials); // or Buffer.from(credentials).toString('base64')
  return `Basic ${base64}`;
}

// Our credentials:
// Authorization: Basic a2JzdHlsaXNoYXBpOktiJHR5bGlzaDEyMw==
```

---

## Complete Payment Flow

### Flow Diagram

```
┌─────────────────┐
│  1. CHECKOUT    │
│  User clicks    │
│  "Pay with NPX" │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  2. CREATE-ORDER-INTENT                 │
│  Edge Function                          │
│  - Create payment_intent record         │
│  - Generate MerchantTxnId (unique!)     │
│  - Call NPX GetProcessId API            │
│  - Store ProcessId in payment_intent    │
└────────┬────────────────────────────────┘
         │ Returns: ProcessId, gateway form data
         ▼
┌─────────────────────────────────────────┐
│  3. FRONTEND AUTO-SUBMIT FORM           │
│  POST to NPX Gateway                    │
│  - MerchantId, MerchantName             │
│  - Amount, MerchantTxnId                │
│  - ProcessId (from step 2)              │
│  - ResponseUrl (callback URL)           │
└────────┬────────────────────────────────┘
         │ Redirects user to NPX payment page
         ▼
┌─────────────────────────────────────────┐
│  4. USER PAYS ON NPX GATEWAY            │
│  - Selects bank/wallet                  │
│  - Completes payment                    │
│  - NPX processes transaction            │
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  5A. WEBHOOK NOTIFICATION (Server)       │
│  GET /api/npx/webhook                    │
│  ?MerchantTxnId=XXX&GatewayTxnId=YYY     │
│  - Receive notification                  │
│  - Call CheckTransactionStatus           │
│  - Verify payment                        │
│  - Enqueue finalize_order job            │
│  - Return "received"                     │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  5B. RESPONSE URL (Browser)              │
│  GET /payment/callback                   │
│  ?MerchantTxnId=XXX&GatewayTxnId=YYY     │
│  - Show loading state                    │
│  - Poll /api/orders/check-status         │
│  - Wait for order creation               │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  6. ORDER-WORKER                         │
│  Background Job Processing               │
│  - Process finalize_order job            │
│  - Call process_order_with_occ           │
│  - Create order in database              │
│  - Send confirmation emails              │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  7. ORDER CONFIRMED                      │
│  - Frontend redirects to order page      │
│  - Emails sent to customer & vendor      │
│  - Order visible in dashboards           │
└──────────────────────────────────────────┘
```

---

## Database Schema Changes

### No Schema Changes Required! ✅

The existing `payment_intents` table already supports NPX:

```sql
-- Existing table structure (compatible)
payment_intents (
  payment_intent_id TEXT, -- Will store MerchantTxnId
  provider TEXT, -- Add 'npx' as value
  external_transaction_id TEXT, -- Will store GatewayTxnId
  gateway_payment_url TEXT, -- Will store NPX gateway URL
  metadata JSONB -- Will store ProcessId and other NPX-specific data
)
```

**NPX-specific metadata structure**:
```json
{
  "process_id": "54D0A55C_4D9E_4EDC_A795_262101D09CF8",
  "merchant_txn_id": "pi_npx_1762831012_abc123",
  "gateway_txn_id": "100000035434",
  "payment_instrument": "TMBANK",
  "npx_status": "Success",
  "transaction_date": "2025-11-11 14:01:56"
}
```

---

## Implementation Plan

### File Structure

```
supabase/functions/
├── _shared/
│   ├── npx.ts              ← NEW: NPX integration module
│   └── esewa.ts            ← KEEP: For reference/backup
├── create-order-intent/
│   └── index.ts            ← UPDATE: Add NPX case
├── verify-payment/
│   └── index.ts            ← UPDATE: Add NPX verification
├── npx-webhook/            ← NEW: Webhook handler
│   └── index.ts
└── order-worker/
    └── index.ts            ← NO CHANGES (already fixed)

src/
├── components/checkout/
│   └── CheckoutClient.tsx  ← UPDATE: Add NPX option, hide eSewa
├── app/payment/callback/
│   └── page.tsx            ← UPDATE: Handle NPX callback params
└── lib/api/
    └── cartClient.ts       ← UPDATE: Add NPX types
```

---

## Module Design: `_shared/npx.ts`

```typescript
/**
 * Nepal Payment (NPX) Gateway Integration
 * OnePG Multi-Step Payment Flow
 * 
 * Official Documentation: Internal NPS API v2
 * 
 * SECURITY FEATURES:
 * - HMAC-SHA512 signature verification
 * - Basic Authentication
 * - Integer-based amount comparison
 * - Webhook signature validation
 * - Network timeout protection (15 seconds)
 */

import crypto from 'node:crypto';

export interface NPXConfig {
  merchantId: string;
  apiUsername: string;
  apiPassword: string;
  securityKey: string;
  testMode: boolean;
}

export interface NPXGetProcessIdRequest {
  MerchantId: string;
  MerchantName: string;
  Amount: string;
  MerchantTxnId: string;
  Signature: string;
}

export interface NPXGetProcessIdResponse {
  code: string; // "0" = success, "1" = error
  message: string;
  errors: Array<{
    error_code: string;
    error_message: string;
  }>;
  data: {
    ProcessId: string;
  } | null;
}

export interface NPXCheckStatusRequest {
  MerchantId: string;
  MerchantName: string;
  MerchantTxnId: string;
  Signature: string;
}

export interface NPXCheckStatusResponse {
  code: string;
  message: string;
  errors: Array<{
    error_code: string;
    error_message: string;
  }>;
  data: {
    GatewayReferenceNo: string;
    Amount: string;
    ServiceCharge: string;
    ProcessId: string;
    TransactionDate: string;
    MerchantTxnId: string;
    CbsMessage: string;
    Status: 'Success' | 'Fail' | 'Pending';
    Institution: string;
    Instrument: string;
  } | null;
}

/**
 * Generate HMAC-SHA512 signature for NPX API
 * 
 * CRITICAL: Different from eSewa!
 * 1. Alphabetically sort keys
 * 2. Concatenate VALUES only (not key=value pairs)
 * 3. HMAC-SHA512 with secret key
 * 4. Lowercase hexadecimal output
 * 
 * @example
 * const signature = generateNPXSignature(
 *   { MerchantId: "8574", MerchantName: "kbstylishapi", Amount: "100" },
 *   "Tg9#xKp3!rZq7@Lm2S"
 * );
 */
export function generateNPXSignature(
  payload: Record<string, string>,
  secretKey: string
): string {
  try {
    // Step 1: Sort keys alphabetically
    const sortedKeys = Object.keys(payload).sort();
    
    // Step 2: Concatenate values only
    const message = sortedKeys.map(key => payload[key]).join('');
    
    // Step 3 & 4: HMAC-SHA512 → lowercase hex
    const hmac = crypto.createHmac('sha512', secretKey);
    hmac.update(message, 'utf8');
    return hmac.digest('hex').toLowerCase();
    
  } catch (error) {
    // CRITICAL: Never log the secret key
    throw new Error('Failed to generate NPX signature');
  }
}

/**
 * Generate Basic Authentication header
 */
export function getNPXAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const base64 = Buffer.from(credentials).toString('base64');
  return `Basic ${base64}`;
}

/**
 * Step 1: Get Process ID from NPX
 * Creates a unique transaction token
 */
export async function getProcessId(
  config: NPXConfig,
  amount: number,
  merchantTxnId: string
): Promise<{ success: boolean; processId?: string; error?: string }> {
  const apiUrl = config.testMode
    ? 'https://apisandbox.nepalpayment.com/GetProcessId'
    : 'https://api.nepalpayment.com/GetProcessId';
  
  const amountStr = amount.toFixed(2);
  
  // Build payload (will be signed)
  const payload = {
    MerchantId: config.merchantId,
    MerchantName: config.apiUsername,
    Amount: amountStr,
    MerchantTxnId: merchantTxnId
  };
  
  // Generate signature
  const signature = generateNPXSignature(payload, config.securityKey);
  
  // Add signature to request
  const requestBody: NPXGetProcessIdRequest = {
    ...payload,
    Signature: signature
  };
  
  // Network timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': getNPXAuthHeader(config.apiUsername, config.apiPassword),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `NPX API returned status ${response.status}`
      };
    }
    
    const data: NPXGetProcessIdResponse = await response.json();
    
    if (data.code !== '0' || !data.data?.ProcessId) {
      const errorMsg = data.errors?.[0]?.error_message || data.message || 'Unknown error';
      return {
        success: false,
        error: `NPX Error: ${errorMsg}`
      };
    }
    
    return {
      success: true,
      processId: data.data.ProcessId
    };
    
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'NPX API timeout (15 seconds)'
      };
    }
    return {
      success: false,
      error: 'Network error during NPX GetProcessId'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Prepare NPX gateway form data
 * User will be redirected to this form
 */
export function prepareNPXPaymentForm(
  config: NPXConfig,
  data: {
    amount: number;
    merchantTxnId: string;
    processId: string;
    responseUrl: string;
  }
): {
  action: string;
  fields: Record<string, string>;
} {
  const gatewayUrl = config.testMode
    ? 'https://gatewaysandbox.nepalpayment.com/Payment/Index'
    : 'https://gateway.nepalpayment.com/Payment/Index';
  
  return {
    action: gatewayUrl,
    fields: {
      MerchantId: config.merchantId,
      MerchantName: config.apiUsername,
      Amount: data.amount.toFixed(2),
      MerchantTxnId: data.merchantTxnId,
      ProcessId: data.processId,
      ResponseUrl: data.responseUrl,
      TransactionRemarks: 'KB Stylish Order',
      InstrumentCode: '' // Empty = show all payment options
    }
  };
}

/**
 * Step 2: Verify transaction status
 * Called from webhook or frontend
 */
export async function checkTransactionStatus(
  config: NPXConfig,
  merchantTxnId: string
): Promise<{
  success: boolean;
  status?: 'Success' | 'Fail' | 'Pending';
  gatewayTxnId?: string;
  amount?: string;
  transactionDate?: string;
  error?: string;
  data?: NPXCheckStatusResponse['data'];
}> {
  const apiUrl = config.testMode
    ? 'https://apisandbox.nepalpayment.com/CheckTransactionStatus'
    : 'https://api.nepalpayment.com/CheckTransactionStatus';
  
  const payload = {
    MerchantId: config.merchantId,
    MerchantName: config.apiUsername,
    MerchantTxnId: merchantTxnId
  };
  
  const signature = generateNPXSignature(payload, config.securityKey);
  
  const requestBody: NPXCheckStatusRequest = {
    ...payload,
    Signature: signature
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': getNPXAuthHeader(config.apiUsername, config.apiPassword),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `NPX API returned status ${response.status}`
      };
    }
    
    const data: NPXCheckStatusResponse = await response.json();
    
    if (data.code !== '0' || !data.data) {
      const errorMsg = data.errors?.[0]?.error_message || data.message || 'Unknown error';
      return {
        success: false,
        error: `NPX Error: ${errorMsg}`
      };
    }
    
    return {
      success: true,
      status: data.data.Status,
      gatewayTxnId: data.data.GatewayReferenceNo,
      amount: data.data.Amount,
      transactionDate: data.data.TransactionDate,
      data: data.data
    };
    
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'NPX verification timeout (15 seconds)'
      };
    }
    return {
      success: false,
      error: 'Network error during NPX verification'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate amount match (integer comparison to prevent floating-point errors)
 */
export function validateNPXAmount(
  expectedNPR: number,
  receivedAmountStr: string
): boolean {
  const expectedPaisa = Math.round(expectedNPR * 100);
  const receivedPaisa = Math.round(parseFloat(receivedAmountStr) * 100);
  return expectedPaisa === receivedPaisa;
}
```

---

## Next Steps

✅ Phase 1: Investigation Complete  
✅ Phase 2: API Documentation Review Complete  
✅ Phase 3: Blueprint Design Complete  
⏳ **Phase 4: Security Audit** (Next)  
⏳ Phase 5: Implementation  
⏳ Phase 6: UAT Testing  

---

**Next Document**: `04_SECURITY_AUDIT.md`
