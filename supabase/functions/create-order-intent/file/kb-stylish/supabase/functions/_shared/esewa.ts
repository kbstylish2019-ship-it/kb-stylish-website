/**
 * eSewa Payment Gateway Integration
 * Security-Hardened Implementation for KB Stylish Marketplace
 * 
 * Official Documentation: https://developer.esewa.com.np/pages/Epay
 * 
 * SECURITY FEATURES:
 * - Integer-based amount comparison (prevents floating-point errors)
 * - Network timeout protection (10 seconds)
 * - Response validation (Content-Type checking)
 * - Error sanitization (no secret leakage)
 * - Test/Production environment separation
 */ import CryptoJS from 'https://esm.sh/crypto-js@4.2.0';
/**
 * Generate HMAC-SHA256 signature for eSewa payment
 * 
 * @param secretKey - eSewa secret key (Test: 8gBm/:&EnhH.1/q)
 * @param message - Signature message format: "total_amount=X,transaction_uuid=Y,product_code=Z"
 * @returns Base64-encoded HMAC signature
 * 
 * @example
 * const signature = generateEsewaSignature(
 *   '8gBm/:&EnhH.1/q',
 *   'total_amount=1000.00,transaction_uuid=abc-123,product_code=EPAYTEST'
 * );
 */ export function generateEsewaSignature(secretKey, message) {
  try {
    const hash = CryptoJS.HmacSHA256(message, secretKey);
    return CryptoJS.enc.Base64.stringify(hash);
  } catch (error) {
    // CRITICAL: Never log the secret key
    throw new Error('Failed to generate payment signature');
  }
}
/**
 * Verify eSewa transaction with their API
 * 
 * This function performs server-to-server verification to ensure:
 * 1. The transaction actually completed on eSewa's servers
 * 2. The amount matches exactly (prevents tampering)
 * 3. The transaction hasn't been cancelled or refunded
 * 
 * @param config - eSewa configuration
 * @param transactionUuid - Unique transaction identifier from eSewa
 * @param amountNPR - Expected amount in NPR (e.g., 1000.50)
 * @returns Verification result with gateway response data
 * 
 * @example
 * const result = await verifyEsewaTransaction(
 *   { merchantCode: 'EPAYTEST', secretKey: '8gBm/:&EnhH.1/q', testMode: true },
 *   'abc-123-def-456',
 *   1000.00
 * );
 * if (result.success) {
 *   console.log('Payment verified:', result.data.ref_id);
 * }
 */ export async function verifyEsewaTransaction(config, transactionUuid, amountNPR) {
  // URL selection based on environment
  const apiUrl = config.testMode ? 'https://rc-epay.esewa.com.np/api/epay/transaction/status/' : 'https://epay.esewa.com.np/api/epay/transaction/status/';
  // Format amount to 2 decimal places (eSewa requirement)
  const formattedAmount = amountNPR.toFixed(2);
  // Prepare Basic Auth header (never log this)
  let authHeader;
  try {
    authHeader = `Basic ${btoa(`${config.merchantCode}:${config.secretKey}`)}`;
  } catch (error) {
    // btoa() can fail if credentials contain non-Latin1 characters
    return {
      success: false,
      error: 'Invalid merchant credentials format'
    };
  }
  // Network timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 10000); // 10 seconds
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        product_code: config.merchantCode,
        total_amount: formattedAmount,
        transaction_uuid: transactionUuid
      }),
      signal: controller.signal
    });
    // HTTP error handling
    if (!response.ok) {
      // Don't expose internal API error details
      return {
        success: false,
        error: `Gateway returned status ${response.status}`
      };
    }
    // Content-Type validation (prevent MITM attacks)
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        error: 'Invalid response format from gateway'
      };
    }
    // Parse response
    const data = await response.json();
    // Transaction status validation
    if (data.status !== 'COMPLETE') {
      return {
        success: false,
        error: `Transaction status is ${data.status || 'unknown'}`
      };
    }
    // CRITICAL: Amount verification using integer comparison (prevents floating-point errors)
    // Convert both amounts to paisa (smallest unit) for exact comparison
    const expectedPaisa = Math.round(amountNPR * 100);
    const receivedPaisa = Math.round(parseFloat(data.total_amount) * 100);
    if (expectedPaisa !== receivedPaisa) {
      return {
        success: false,
        error: `Amount mismatch: expected ${amountNPR} NPR, gateway returned ${data.total_amount} NPR`
      };
    }
    // Success - return full gateway response for audit trail
    return {
      success: true,
      data: {
        status: data.status,
        ref_id: data.ref_id,
        total_amount: data.total_amount,
        transaction_uuid: data.transaction_uuid,
        product_code: data.product_code
      }
    };
  } catch (error) {
    // Network timeout or fetch error
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Gateway verification timeout (10 seconds)'
        };
      }
      // Generic network error (don't leak internal details)
      return {
        success: false,
        error: 'Network error during gateway verification'
      };
    }
    return {
      success: false,
      error: 'Unknown error during gateway verification'
    };
  } finally{
    // Always clear timeout
    clearTimeout(timeoutId);
  }
}
/**
 * Prepare eSewa payment form data for client-side submission
 * 
 * @param config - eSewa configuration
 * @param data - Payment details
 * @returns Form URL and fields for HTML form submission
 * 
 * @example
 * const formData = prepareEsewaPaymentForm(config, {
 *   amount: 1000.00,
 *   transactionUuid: crypto.randomUUID(),
 *   successUrl: 'https://yoursite.com/payment/success',
 *   failureUrl: 'https://yoursite.com/checkout'
 * });
 * // Client renders form and auto-submits to formData.action with formData.fields
 */ export function prepareEsewaPaymentForm(config, data) {
  const formattedAmount = data.amount.toFixed(2);
  const signedFieldNames = 'total_amount,transaction_uuid,product_code';
  // Generate signature
  const signatureMessage = `total_amount=${formattedAmount},transaction_uuid=${data.transactionUuid},product_code=${config.merchantCode}`;
  const signature = generateEsewaSignature(config.secretKey, signatureMessage);
  const formUrl = config.testMode ? 'https://rc-epay.esewa.com.np/api/epay/main/v2/form' : 'https://epay.esewa.com.np/api/epay/main/v2/form';
  return {
    action: formUrl,
    fields: {
      amount: formattedAmount,
      tax_amount: '0',
      total_amount: formattedAmount,
      transaction_uuid: data.transactionUuid,
      product_code: config.merchantCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: data.successUrl,
      failure_url: data.failureUrl,
      signed_field_names: signedFieldNames,
      signature
    }
  };
}
