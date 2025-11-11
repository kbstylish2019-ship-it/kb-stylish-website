# Nepal Payment (NPX) API Documentation Review

**Date**: November 11, 2025  
**Status**: Phase 2 - Expert Consultation  
**API Version**: V2 (Payment Link API)

---

## NPX API Overview

### Base URLs
- **UAT/Sandbox**: `https://apisandbox.nepalpayment.com/`
- **Production**: `https://api.nepalpayment.com/` (assumed)
- **Merchant Panel (UAT)**: `https://eg-uat.nepalpayment.com/`

### Authentication
- **Merchant ID**: 8574
- **API Username (MerchantName)**: kbstylishapi
- **API Password**: Kb$tylish123
- **Security Key**: Tg9#xKp3!rZq7@Lm2S

---

## API Endpoints Discovered

### 1. Generate Payment Link
**Endpoint**: `POST /V2/GeneratePaymentLink`

**Purpose**: Create a payment session and get payment URL

**Request Payload**:
```json
{
  "MerchantId": "8574",
  "MerchantName": "kbstylishapi",
  "Signature": "HMAC_SIGNATURE_HERE",
  "CustomerName": "Customer Full Name",
  "CustomerEmail": "customer@example.com",
  "CustomerMobile": "9841234567",
  "TransactionAmount": "1000.00",
  "ValidityTime": "30",
  "PaymentType": "ALL",
  "ChargeCategory": "MERCHANT",
  "TransactionRemarks": "Order #ORD-20251111-12345",
  "FurtherCreditEnabled": "false",
  "FurtherCreditBank": "",
  "FurtherCreditAccName": "",
  "FurtherCreditAccNumber": ""
}
```

**Response Format**:
```json
{
  "code": "200",
  "message": "Success",
  "errors": [],
  "data": {
    "payment_url": "https://eg-uat.nepalpayment.com/payment/xyz123",
    "transaction_id": "NPX-123456789",
    "reference_id": "REF-123456"
  }
}
```

---

## Critical Questions Requiring Answers

### 🔴 HIGH PRIORITY

1. **Signature Generation Algorithm**
   - ❓ What hashing algorithm? (HMAC-SHA256, MD5, SHA1?)
   - ❓ What fields are included in signature message?
   - ❓ What is the field concatenation format?
   - ❓ Is it Base64 or Hex encoded?
   
   **Example for eSewa**: 
   ```
   Message: "total_amount=1000.00,transaction_uuid=abc-123,product_code=MERCHANT_CODE"
   Algorithm: HMAC-SHA256
   Key: Secret Key
   Output: Base64
   ```

2. **Payment Verification API**
   - ❓ Endpoint for server-to-server verification?
   - ❓ Request parameters (transaction_id, amount, merchant_id)?
   - ❓ Response format?
   - ❓ Status codes (COMPLETE, FAILED, PENDING)?

3. **Callback/Redirect Parameters**
   - ❓ What parameters are sent to success_url?
   - ❓ What parameters are sent to failure_url?
   - ❓ Is there a data parameter or query strings?
   - ❓ How to extract transaction_id from callback?

4. **Webhook Structure**
   - ❓ Webhook endpoint authentication (signature header)?
   - ❓ Webhook payload format?
   - ❓ Retry logic for failed webhooks?
   - ❓ Event types (payment.success, payment.failed)?

### 🟡 MEDIUM PRIORITY

5. **Amount Format**
   - ❓ Decimal places (2 decimals like "1000.00")?
   - ❓ Currency (always NPR)?
   - ❓ Minimum/maximum transaction limits?

6. **Transaction Validity**
   - ❓ ValidityTime unit (minutes, hours)?
   - ❓ Default validity if not specified?
   - ❓ Maximum validity period?

7. **Payment Types**
   - ❓ Available PaymentType values?
   - ❓ Does "ALL" enable all methods?
   - ❓ Specific values (CARD, WALLET, BANK, etc.)?

8. **Error Handling**
   - ❓ Complete list of error codes?
   - ❓ Retry-able vs non-retry-able errors?
   - ❓ Rate limiting policies?

---

## Integration Flow (Proposed)

### Flow Diagram
```
1. USER → Checkout Page
   ↓
2. FRONTEND → POST /api/create-order-intent
   ↓
3. EDGE FUNCTION → Generate NPX Signature
   ↓
4. EDGE FUNCTION → POST to NPX /V2/GeneratePaymentLink
   ↓
5. NPX → Returns payment_url
   ↓
6. FRONTEND → Redirect user to payment_url
   ↓
7. USER → Completes payment on NPX gateway
   ↓
8. NPX → Redirects to success_url with transaction data
   ↓
9. FRONTEND → Calls /api/verify-payment
   ↓
10. EDGE FUNCTION → POST to NPX verification endpoint
    ↓
11. NPX → Returns verification result
    ↓
12. EDGE FUNCTION → Enqueue finalize_order job
    ↓
13. ORDER WORKER → Process job, create order
    ↓
14. SYSTEM → Send confirmation emails
```

### Parallel: Webhook Processing
```
NPX → POST to /api/npx/webhook
  ↓
WEBHOOK HANDLER → Verify signature
  ↓
WEBHOOK HANDLER → Process payment update
  ↓
WEBHOOK HANDLER → Trigger order finalization (if needed)
```

---

## Security Considerations

### 1. Signature Validation (Must Implement)
```typescript
// Pseudo-code for signature verification
function verifyNPXSignature(payload: any, receivedSignature: string): boolean {
  const message = constructSignatureMessage(payload);
  const expectedSignature = generateHMAC(NPX_SECURITY_KEY, message);
  return timingSafeEqual(expectedSignature, receivedSignature);
}
```

### 2. Amount Validation (Integer Comparison)
```typescript
// Prevent floating-point errors
const expectedPaisa = Math.round(amountNPR * 100);
const receivedPaisa = Math.round(parseFloat(gatewayAmount) * 100);
if (expectedPaisa !== receivedPaisa) {
  throw new Error('Amount mismatch detected');
}
```

### 3. Idempotency Protection
```typescript
// Use payment_intent_id + npx_transaction_id as idempotency key
const idempotencyKey = `payment_npx_${npxTransactionId}`;
await db.from('job_queue').insert({
  job_type: 'finalize_order',
  payload: {...},
  idempotency_key: idempotencyKey
}).onConflict('idempotency_key').ignore();
```

### 4. Webhook Security
```typescript
// Verify webhook authenticity
const webhookSignature = req.headers['x-npx-signature'];
if (!verifyNPXWebhookSignature(req.body, webhookSignature)) {
  return res.status(401).json({ error: 'Invalid webhook signature' });
}
```

---

## Comparison: eSewa vs NPX (Estimated)

| Feature | eSewa | NPX (Estimated) |
|---------|-------|-----------------|
| Payment Initiation | Form POST | API + Redirect |
| Signature Algorithm | HMAC-SHA256 | ❓ (Need docs) |
| Verification API | ✅ Yes | ❓ (Need docs) |
| Webhook Support | ❌ No | ✅ Yes (assumed) |
| Test Environment | rc-epay.esewa.com.np | apisandbox.nepalpayment.com |
| Amount Format | 1000.00 (2 decimals) | ❓ (Need docs) |
| Transaction UUID | Client-generated | Server-generated? |

---

## Required Information from NPX Team

**EMAIL TO NPX SUPPORT**:

```
Subject: API Integration Clarifications for KB Stylish (Merchant ID: 8574)

Dear NPX Integration Team,

We are integrating the NPX payment gateway for KB Stylish and need clarification on the following API details:

1. **Signature Generation**:
   - Which hashing algorithm should we use for the Signature field?
   - Which fields should be included in the signature message?
   - What is the exact concatenation format?
   - Should the output be Base64 or Hex encoded?

2. **Payment Verification**:
   - What is the API endpoint for server-to-server payment verification?
   - What are the required request parameters?
   - What status codes do you return (e.g., COMPLETE, FAILED, PENDING)?

3. **Callback/Redirect**:
   - What parameters are sent to our success_url?
   - How do we extract the transaction_id from the callback?

4. **Webhook Notifications**:
   - What is the webhook payload format?
   - How should we verify webhook authenticity (signature header)?
   - What event types do you send?

5. **Technical Specifications**:
   - Amount format (decimal places)?
   - ValidityTime unit (minutes/hours)?
   - Available PaymentType values?

We have reviewed the Payment Link API docs but need these additional details for a secure, production-ready integration.

UAT Merchant ID: 8574
Developer: shishirbhusal333@gmail.com

Thank you!
```

---

## Next Steps

1. ✅ Document current findings
2. ⏳ **REQUEST API DOCS FROM USER** - Ask them to share specific sections
3. ⏳ Create NPX module blueprint
4. ⏳ Design database schema updates
5. ⏳ Plan Edge Function modifications

---

**Next Document**: `03_INTEGRATION_BLUEPRINT.md`
