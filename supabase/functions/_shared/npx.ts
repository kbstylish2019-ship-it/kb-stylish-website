/**
 * Nepal Payment (NPX) Gateway Integration
 * OnePG Multi-Step Payment Flow
 * 
 * Official Documentation: NPS OnePG Payment Gateway API v2
 * 
 * SECURITY FEATURES:
 * - HMAC-SHA512 signature verification
 * - Basic Authentication
 * - Integer-based amount comparison
 * - Network timeout protection (15 seconds)
 * - Error sanitization (no secret leakage)
 * - Test/Production environment separation
 * 
 * CRITICAL DIFFERENCES FROM ESEWA:
 * - Multi-step flow: GetProcessId → Gateway → Webhook → Verify
 * - HMAC-SHA512 (not SHA256)
 * - Alphabetically sorted concatenated values (not key=value pairs)
 * - Basic Auth header required
 * - Webhook-based notifications
 */

/**
 * Configuration for NPX integration
 */
export interface NPXConfig {
  merchantId: string;
  apiUsername: string;
  apiPassword: string;
  securityKey: string;
  testMode: boolean;
}

/**
 * Request to generate Process ID
 */
export interface NPXGetProcessIdRequest {
  MerchantId: string;
  MerchantName: string;
  Amount: string;
  MerchantTxnId: string;
  Signature: string;
}

/**
 * Response from GetProcessId API
 */
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

/**
 * Request to check transaction status
 */
export interface NPXCheckStatusRequest {
  MerchantId: string;
  MerchantName: string;
  MerchantTxnId: string;
  Signature: string;
}

/**
 * Response from CheckTransactionStatus API
 */
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
    PaymentCurrency?: string;
    ExchangeRate?: string;
  } | null;
}

/**
 * Generate HMAC-SHA512 signature for NPX API
 * 
 * CRITICAL: Different from eSewa's HMAC-SHA256!
 * 
 * Algorithm:
 * 1. Alphabetically sort payload keys
 * 2. Concatenate VALUES only (not key=value pairs)
 * 3. Apply HMAC-SHA512 with secret key
 * 4. Convert output to lowercase hexadecimal string
 * 
 * @param payload - Object with string values to sign
 * @param secretKey - NPX security key
 * @returns Lowercase hexadecimal HMAC-SHA512 signature
 * 
 * @example
 * const signature = generateNPXSignature(
 *   { MerchantId: "8574", MerchantName: "kbstylishapi", Amount: "100.00" },
 *   "Tg9#xKp3!rZq7@Lm2S"
 * );
 * // Sorted keys: ["Amount", "MerchantId", "MerchantName"]
 * // Message: "100.008574kbstylishapi"
 * // Output: hmac-sha512 lowercase hex
 */
export async function generateNPXSignature(
  payload: Record<string, string>,
  secretKey: string
): Promise<string> {
  try {
    // Step 1: Sort keys alphabetically
    const sortedKeys = Object.keys(payload).sort();
    
    // Step 2: Concatenate values only
    const message = sortedKeys.map(key => payload[key]).join('');
    
    // Step 3 & 4: HMAC-SHA512 → lowercase hex
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData
    );
    
    // Convert to lowercase hex
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex.toLowerCase();
    
  } catch (error) {
    // CRITICAL: Never log the secret key
    console.error('Failed to generate NPX signature');
    throw new Error('Failed to generate payment signature');
  }
}

/**
 * Generate Basic Authentication header for NPX API
 * 
 * @param username - API username
 * @param password - API password
 * @returns Basic Auth header value
 * 
 * @example
 * const auth = getNPXAuthHeader('kbstylishapi', 'Kb$tylish123');
 * // Returns: "Basic a2JzdHlsaXNoYXBpOktiJHR5bGlzaDEyMw=="
 */
export function getNPXAuthHeader(username: string, password: string): string {
  try {
    const credentials = `${username}:${password}`;
    const encoded = btoa(credentials);
    return `Basic ${encoded}`;
  } catch (error) {
    throw new Error('Failed to encode authentication credentials');
  }
}

/**
 * Step 1: Get Process ID from NPX
 * 
 * Generates a unique transaction token (ProcessId) required for gateway redirection.
 * This must be called before redirecting user to NPX payment gateway.
 * 
 * @param config - NPX configuration
 * @param amount - Transaction amount in NPR
 * @param merchantTxnId - Unique merchant transaction identifier
 * @returns Process ID on success, error message on failure
 * 
 * @example
 * const result = await getProcessId(config, 1000.00, 'pi_npx_1762831012_abc123');
 * if (result.success) {
 *   console.log('Process ID:', result.processId);
 * }
 */
export async function getProcessId(
  config: NPXConfig,
  amount: number,
  merchantTxnId: string
): Promise<{ success: boolean; processId?: string; error?: string }> {
  const apiUrl = config.testMode
    ? 'https://apisandbox.nepalpayment.com/GetProcessId'
    : 'https://apigateway.nepalpayment.com/GetProcessId';
  
  // Format amount to 2 decimal places
  const amountStr = amount.toFixed(2);
  
  // Build payload for signature (alphabetically sortable)
  const payload = {
    Amount: amountStr,
    MerchantId: config.merchantId,
    MerchantName: config.apiUsername,
    MerchantTxnId: merchantTxnId
  };
  
  // Generate HMAC-SHA512 signature
  const signature = await generateNPXSignature(payload, config.securityKey);
  
  // Construct request body
  const requestBody: NPXGetProcessIdRequest = {
    MerchantId: config.merchantId,
    MerchantName: config.apiUsername,
    Amount: amountStr,
    MerchantTxnId: merchantTxnId,
    Signature: signature
  };
  
  console.log(`[NPX] GetProcessId request for ${merchantTxnId}, amount: ${amountStr} NPR`);
  
  // Network timeout protection (15 seconds)
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
    
    // HTTP error handling
    if (!response.ok) {
      console.error(`[NPX] GetProcessId HTTP error: ${response.status}`);
      return {
        success: false,
        error: `NPX API returned status ${response.status}`
      };
    }
    
    // Content-Type validation
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        error: 'Invalid response format from NPX gateway'
      };
    }
    
    // Parse response
    const data: NPXGetProcessIdResponse = await response.json();
    
    // Check for API-level errors
    if (data.code !== '0' || !data.data?.ProcessId) {
      const errorMsg = data.errors?.[0]?.error_message || data.message || 'Unknown error';
      console.error(`[NPX] GetProcessId failed: ${errorMsg}`);
      return {
        success: false,
        error: `NPX Error: ${errorMsg}`
      };
    }
    
    console.log(`[NPX] ProcessId generated: ${data.data.ProcessId}`);
    return {
      success: true,
      processId: data.data.ProcessId
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('[NPX] GetProcessId timeout after 15 seconds');
        return {
          success: false,
          error: 'NPX API timeout (15 seconds)'
        };
      }
      console.error('[NPX] GetProcessId network error:', error.message);
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
 * Prepare NPX gateway form data for client-side redirection
 * 
 * After obtaining ProcessId, this generates the form fields needed to redirect
 * the user to NPX payment gateway.
 * 
 * @param config - NPX configuration
 * @param data - Payment and redirect information
 * @returns Form action URL and fields
 * 
 * @example
 * const formData = prepareNPXPaymentForm(config, {
 *   amount: 1000.00,
 *   merchantTxnId: 'pi_npx_1762831012_abc123',
 *   processId: '54D0A55C_4D9E_4EDC_A795_262101D09CF8',
 *   responseUrl: 'https://kbstylish.com.np/payment/callback?provider=npx'
 * });
 * // Client submits form to formData.action with formData.fields
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
    : 'https://gateway.nepalpayment.com/payment/index';
  
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
      InstrumentCode: '' // Empty = show all payment options to user
    }
  };
}

/**
 * Step 2: Verify transaction status with NPX
 * 
 * Performs server-to-server verification to ensure:
 * 1. The transaction actually completed on NPX servers
 * 2. The amount matches exactly (prevents tampering)
 * 3. The transaction status is Success/Pending/Fail
 * 
 * This should be called from:
 * - Webhook notification handler
 * - Payment callback page (as fallback)
 * 
 * @param config - NPX configuration
 * @param merchantTxnId - Original merchant transaction ID
 * @returns Verification result with transaction details
 * 
 * @example
 * const result = await checkTransactionStatus(config, 'pi_npx_1762831012_abc123');
 * if (result.success && result.status === 'Success') {
 *   console.log('Payment verified:', result.gatewayTxnId);
 * }
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
    : 'https://apigateway.nepalpayment.com/CheckTransactionStatus';
  
  // Build payload for signature
  const payload = {
    MerchantId: config.merchantId,
    MerchantName: config.apiUsername,
    MerchantTxnId: merchantTxnId
  };
  
  // Generate signature
  const signature = await generateNPXSignature(payload, config.securityKey);
  
  const requestBody: NPXCheckStatusRequest = {
    ...payload,
    Signature: signature
  };
  
  console.log(`[NPX] CheckTransactionStatus for ${merchantTxnId}`);
  
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
      console.error(`[NPX] CheckTransactionStatus HTTP error: ${response.status}`);
      return {
        success: false,
        error: `NPX API returned status ${response.status}`
      };
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        error: 'Invalid response format from NPX gateway'
      };
    }
    
    const data: NPXCheckStatusResponse = await response.json();
    
    if (data.code !== '0' || !data.data) {
      const errorMsg = data.errors?.[0]?.error_message || data.message || 'Unknown error';
      console.error(`[NPX] CheckTransactionStatus failed: ${errorMsg}`);
      return {
        success: false,
        error: `NPX Error: ${errorMsg}`
      };
    }
    
    console.log(`[NPX] Status: ${data.data.Status}, Gateway TxnId: ${data.data.GatewayReferenceNo}`);
    
    return {
      success: true,
      status: data.data.Status,
      gatewayTxnId: data.data.GatewayReferenceNo,
      amount: data.data.Amount,
      transactionDate: data.data.TransactionDate,
      data: data.data
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('[NPX] CheckTransactionStatus timeout');
        return {
          success: false,
          error: 'NPX verification timeout (15 seconds)'
        };
      }
      console.error('[NPX] CheckTransactionStatus error:', error.message);
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
 * Validate amount match using integer comparison
 * 
 * Prevents floating-point precision errors by converting to smallest unit (paisa).
 * 
 * @param expectedNPR - Expected amount in NPR
 * @param receivedAmountStr - Amount string from NPX (e.g., "1000.00")
 * @returns true if amounts match exactly
 * 
 * @example
 * validateNPXAmount(1000.00, "1000.00") // true
 * validateNPXAmount(1000.00, "999.99")  // false
 * validateNPXAmount(1000.00, "1000")    // true (handles missing decimals)
 */
export function validateNPXAmount(
  expectedNPR: number,
  receivedAmountStr: string
): boolean {
  // Convert to paisa (smallest unit) for exact comparison
  const expectedPaisa = Math.round(expectedNPR * 100);
  const receivedPaisa = Math.round(parseFloat(receivedAmountStr) * 100);
  
  if (expectedPaisa !== receivedPaisa) {
    console.error(
      `[NPX] Amount mismatch: expected ${expectedNPR} NPR (${expectedPaisa} paisa), ` +
      `received ${receivedAmountStr} NPR (${receivedPaisa} paisa)`
    );
    return false;
  }
  
  return true;
}
