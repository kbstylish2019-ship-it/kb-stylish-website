/**
 * Khalti Payment Gateway Integration
 * Security-Hardened Implementation for KB Stylish Marketplace
 * 
 * Official Documentation: https://docs.khalti.com/
 * 
 * SECURITY FEATURES:
 * - Amount overflow protection (max safe integer check)
 * - Network timeout protection (10 seconds)
 * - Response validation (Content-Type checking)
 * - Integer-based paisa conversion (prevents floating-point errors)
 * - Error sanitization (no secret leakage)
 */ /**
 * Khalti payment initiation request
 */ /**
 * Maximum amount supported (to prevent integer overflow)
 * JavaScript's MAX_SAFE_INTEGER = 9,007,199,254,740,991
 * In NPR: 90,071,992,547,409.91
 */ const MAX_SUPPORTED_AMOUNT_NPR = 90_000_000_000_000; // 90 trillion NPR
/**
 * Initiate Khalti payment (server-to-server)
 * 
 * This function calls Khalti's initiation API to get a payment URL.
 * The user will be redirected to this URL to complete payment.
 * 
 * @param secretKey - Khalti secret key (starts with "Key ")
 * @param request - Payment details
 * @returns Payment URL and pidx for tracking
 * 
 * @example
 * const result = await initiateKhaltiPayment('your-secret-key', {
 *   amount: 1000.00,
 *   purchase_order_id: 'ORDER-123',
 *   purchase_order_name: 'Product Purchase',
 *   return_url: 'https://yoursite.com/payment/callback',
 *   website_url: 'https://yoursite.com'
 * });
 * if (result.success) {
 *   // Redirect user to result.payment_url
 * }
 */ export async function initiateKhaltiPayment(secretKey, request) {
  // Amount overflow protection
  if (request.amount > MAX_SUPPORTED_AMOUNT_NPR) {
    return {
      success: false,
      error: 'Amount exceeds maximum supported value'
    };
  }
  // Amount must be positive
  if (request.amount <= 0) {
    return {
      success: false,
      error: 'Amount must be greater than zero'
    };
  }
  // Convert NPR to paisa (1 NPR = 100 paisa)
  // Use Math.round to handle floating-point precision
  const amountPaisa = Math.round(request.amount * 100);
  // Network timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 10000); // 10 seconds
  try {
    const response = await fetch('https://a.khalti.com/api/v2/epayment/initiate/', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${secretKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        return_url: request.return_url,
        website_url: request.website_url,
        amount: amountPaisa,
        purchase_order_id: request.purchase_order_id,
        purchase_order_name: request.purchase_order_name,
        customer_info: request.customer_info
      }),
      signal: controller.signal
    });
    // HTTP error handling
    if (!response.ok) {
      // Khalti returns 400 for validation errors
      if (response.status === 400) {
        try {
          const errorData = await response.json();
          return {
            success: false,
            error: errorData.detail || errorData.message || 'Invalid payment request'
          };
        } catch  {
          return {
            success: false,
            error: 'Invalid payment request'
          };
        }
      }
      return {
        success: false,
        error: `Gateway returned status ${response.status}`
      };
    }
    // Content-Type validation
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        error: 'Invalid response format from gateway'
      };
    }
    // Parse response
    const data = await response.json();
    // Validate required fields
    if (!data.pidx || !data.payment_url) {
      return {
        success: false,
        error: 'Gateway response missing required fields'
      };
    }
    return {
      success: true,
      pidx: data.pidx,
      payment_url: data.payment_url,
      expires_at: data.expires_at,
      expires_in: data.expires_in
    };
  } catch (error) {
    // Network timeout or fetch error
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Gateway initiation timeout (10 seconds)'
        };
      }
      return {
        success: false,
        error: 'Network error during gateway initiation'
      };
    }
    return {
      success: false,
      error: 'Unknown error during gateway initiation'
    };
  } finally{
    clearTimeout(timeoutId);
  }
}
/**
 * Verify Khalti transaction with their API
 * 
 * This function performs server-to-server verification to ensure:
 * 1. The transaction actually completed on Khalti's servers
 * 2. The payment status is "Completed"
 * 3. The transaction hasn't been cancelled or refunded
 * 
 * @param secretKey - Khalti secret key
 * @param pidx - Payment index (unique transaction identifier from Khalti)
 * @returns Verification result with gateway response data
 * 
 * @example
 * const result = await verifyKhaltiTransaction('your-secret-key', 'HT6o6PEZRWFJ5ygavzHWd5');
 * if (result.success && result.data.status === 'Completed') {
 *   console.log('Payment verified:', result.data.transaction_id);
 *   console.log('Amount:', result.data.total_amount / 100, 'NPR');
 * }
 */ export async function verifyKhaltiTransaction(secretKey, pidx) {
  // pidx validation
  if (!pidx || pidx.trim().length === 0) {
    return {
      success: false,
      error: 'Invalid transaction identifier'
    };
  }
  // Network timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 10000); // 10 seconds
  try {
    const response = await fetch('https://khalti.com/api/v2/epayment/lookup/', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${secretKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        pidx
      }),
      signal: controller.signal
    });
    // HTTP error handling
    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }
      return {
        success: false,
        error: `Gateway returned status ${response.status}`
      };
    }
    // Content-Type validation
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        error: 'Invalid response format from gateway'
      };
    }
    // Parse response
    const data = await response.json();
    // Status validation
    const validStatuses = [
      'Completed',
      'Pending',
      'User canceled',
      'Expired',
      'Refunded'
    ];
    if (!validStatuses.includes(data.status)) {
      return {
        success: false,
        error: `Unknown transaction status: ${data.status}`
      };
    }
    // For non-completed transactions, return as failed with status
    if (data.status !== 'Completed') {
      return {
        success: false,
        error: `Transaction status: ${data.status}`
      };
    }
    // Success - return full gateway response for audit trail
    return {
      success: true,
      data: {
        pidx: data.pidx,
        total_amount: data.total_amount,
        status: data.status,
        transaction_id: data.transaction_id,
        fee: data.fee || 0,
        refunded: data.refunded || false
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
    clearTimeout(timeoutId);
  }
}
/**
 * Compare Khalti amount with expected amount
 * 
 * @param khaltiAmountPaisa - Amount from Khalti response (in paisa)
 * @param expectedAmountNPR - Expected amount in NPR
 * @returns True if amounts match exactly
 * 
 * @example
 * const matches = compareKhaltiAmount(100000, 1000.00); // true
 * const matches = compareKhaltiAmount(100001, 1000.00); // false
 */ export function compareKhaltiAmount(khaltiAmountPaisa, expectedAmountNPR) {
  const expectedPaisa = Math.round(expectedAmountNPR * 100);
  return khaltiAmountPaisa === expectedPaisa;
}
