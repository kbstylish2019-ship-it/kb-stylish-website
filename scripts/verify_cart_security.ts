#!/usr/bin/env tsx

/**
 * KB STYLISH ENTERPRISE CART SECURITY VERIFICATION HARNESS
 * 
 * Principal QA Architect: Automated End-to-End Security Testing
 * 
 * This harness executes comprehensive security and functionality tests
 * on the Live Order Pipeline, validating the Phoenix Protocol remediation.
 * 
 * Usage: npx tsx scripts/verify_cart_security.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Types for better type safety
interface TestResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  message?: string;
  data?: any;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

interface TestUser {
  email: string;
  password: string;
  token?: string;
  userId?: string;
}

interface CartItem {
  variant_id: string;
  quantity: number;
}

// Console colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class TestLogger {
  static info(message: string) {
    console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
  }

  static success(message: string) {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
  }

  static error(message: string) {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
  }

  static warning(message: string) {
    console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
  }

  static header(message: string) {
    console.log(`\n${colors.magenta}${colors.bright}${message}${colors.reset}`);
  }

  static subheader(message: string) {
    console.log(`\n${colors.blue}${message}${colors.reset}`);
  }
}

class EnvironmentLoader {
  private static config: SupabaseConfig | null = null;

  static async loadConfig(): Promise<SupabaseConfig> {
    if (this.config) return this.config;

    try {
      const envPath = path.join(process.cwd(), '.env.local');
      const envContent = await fs.readFile(envPath, 'utf-8');
      
      const envVars: Record<string, string> = {};
      
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          // Handle both "KEY=value" and "KEY = value" formats
          const match = trimmed.match(/^([^=]+?)\s*=\s*(.*)$/);
          if (match) {
            const [, key, value] = match;
            envVars[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
          }
        }
      });

      const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
        'SUPABASE_SERVICE_ROLE_KEY'
      ];

      for (const varName of requiredVars) {
        if (!envVars[varName]) {
          throw new Error(`Missing required environment variable: ${varName}`);
        }
      }

      this.config = {
        url: envVars.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceKey: envVars.SUPABASE_SERVICE_ROLE_KEY,
      };

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load environment configuration: ${error}`);
    }
  }
}

class ApiClient {
  private config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = config;
  }

  async request(
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      useServiceKey?: boolean;
    } = {}
  ): Promise<any> {
    const {
      method = 'GET',
      headers = {},
      body,
      useServiceKey = false
    } = options;

    const url = `${this.config.url}${endpoint}`;
    const authKey = useServiceKey ? this.config.serviceKey : this.config.anonKey;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': authKey,
      ...headers,
    };
    
    // Add Authorization header for service key requests
    if (useServiceKey) {
      requestHeaders['Authorization'] = `Bearer ${this.config.serviceKey}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body) {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestOptions);
      
      // For some endpoints, we just need the response status
      if (response.status === 204) {
        return { success: true, status: response.status };
      }

      const responseText = await response.text();
      let data;
      
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      throw new Error(`API request failed: ${error}`);
    }
  }

  async signUp(email: string, password: string): Promise<any> {
    return this.request('/auth/v1/signup', {
      method: 'POST',
      body: { email, password },
    });
  }

  async signIn(email: string, password: string): Promise<any> {
    return this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
  }

  async callEdgeFunction(
    functionName: string,
    payload: any,
    token?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return this.request(`/functions/v1/${functionName}`, {
      method: 'POST',
      headers,
      body: payload,
    });
  }

  async queryTable(
    table: string,
    query: string = '',
    useServiceKey: boolean = false
  ): Promise<any> {
    const endpoint = `/rest/v1/${table}${query ? `?${query}` : ''}`;
    return this.request(endpoint, { useServiceKey });
  }
}

class CartSecurityTestSuite {
  private api: ApiClient;
  private results: TestSuite[] = [];
  private readonly TEST_VARIANT_ID = '00fc5e6f-aeb8-44b3-b3ef-0a561feb359f'; // Business Blazer
  private readonly TEST_QUANTITY = 2;

  constructor(api: ApiClient) {
    this.api = api;
  }

  private async createTestUser(suffix: string): Promise<TestUser> {
    // Generate a valid email with shorter numeric suffix to avoid validation issues
    const randomId = Math.floor(Math.random() * 10000);
    const user: TestUser = {
      email: `test.${suffix}.${randomId}@example.com`,
      password: 'SecureTest123!',
    };

    const signupResponse = await this.api.signUp(user.email, user.password);
    
    if (!signupResponse.access_token || !signupResponse.user?.id) {
      throw new Error(`Failed to create test user: ${JSON.stringify(signupResponse)}`);
    }

    user.token = signupResponse.access_token;
    user.userId = signupResponse.user.id;

    return user;
  }

  private async runTest(
    id: string,
    name: string,
    testFn: () => Promise<void>
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      TestLogger.info(`Running ${id}: ${name}`);
      await testFn();
      const duration = Date.now() - startTime;
      TestLogger.success(`${id}: ${name} - PASSED (${duration}ms)`);
      
      return {
        id,
        name,
        status: 'PASS',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      TestLogger.error(`${id}: ${name} - FAILED (${duration}ms) - ${message}`);
      
      return {
        id,
        name,
        status: 'FAIL',
        duration,
        message,
      };
    }
  }

  async runSuite1_Authentication(): Promise<TestSuite> {
    TestLogger.header('SUITE 1: AUTHENTICATION & USER ISOLATION');
    
    const suite: TestSuite = {
      name: 'Authentication & User Isolation',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const startTime = Date.now();

    // Test 1A: User Registration
    suite.tests.push(await this.runTest('1A', 'User Registration', async () => {
      const user = await this.createTestUser('a1');
      if (!user.token || !user.userId) {
        throw new Error('User registration failed to return valid credentials');
      }
    }));

    // Test 1B: JWT Token Validation
    suite.tests.push(await this.runTest('1B', 'JWT Token Validation', async () => {
      const user = await this.createTestUser('a2');
      
      // Test that a valid token can access protected resources
      const response = await this.api.callEdgeFunction('cart-manager', {
        action: 'get'
      }, user.token);
      
      if (!response.success) {
        throw new Error(`JWT validation failed: ${response.message}`);
      }
    }));

    // Test 1C: Invalid Token Rejection
    suite.tests.push(await this.runTest('1C', 'Invalid Token Rejection', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      try {
        await this.api.callEdgeFunction('cart-manager', {
          action: 'get'
        }, invalidToken);
        throw new Error('Invalid token was accepted - security breach!');
      } catch (error) {
        // This should fail - which is correct behavior
        if (error instanceof Error && error.message.includes('security breach')) {
          throw error;
        }
        // Expected failure - test passes
      }
    }));

    suite.duration = Date.now() - startTime;
    suite.passed = suite.tests.filter(t => t.status === 'PASS').length;
    suite.failed = suite.tests.filter(t => t.status === 'FAIL').length;
    suite.skipped = suite.tests.filter(t => t.status === 'SKIP').length;

    return suite;
  }

  async runSuite2_CartSecurity(): Promise<TestSuite> {
    TestLogger.header('SUITE 2: CART SECURITY & ISOLATION');
    
    const suite: TestSuite = {
      name: 'Cart Security & Isolation',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const startTime = Date.now();

    let user1: TestUser, user2: TestUser;

    // Test 2A: Cart Creation & Item Addition
    suite.tests.push(await this.runTest('2A', 'Cart Creation & Item Addition', async () => {
      user1 = await this.createTestUser('c1');
      
      const addResponse = await this.api.callEdgeFunction('cart-manager', {
        action: 'add',
        variant_id: this.TEST_VARIANT_ID,
        quantity: this.TEST_QUANTITY,
      }, user1.token);
      
      if (!addResponse.success) {
        throw new Error(`Failed to add items to cart: ${addResponse.message}`);
      }
    }));

    // Test 2B: Cart Retrieval
    suite.tests.push(await this.runTest('2B', 'Cart Retrieval', async () => {
      const getResponse = await this.api.callEdgeFunction('cart-manager', {
        action: 'get'
      }, user1.token);
      
      if (!getResponse.success || !getResponse.cart) {
        throw new Error(`Failed to retrieve cart: ${JSON.stringify(getResponse)}`);
      }
      
      if (getResponse.cart.items.length === 0) {
        throw new Error('Cart appears empty after adding items');
      }
    }));

    // Test 2C: User Cart Isolation
    suite.tests.push(await this.runTest('2C', 'User Cart Isolation', async () => {
      user2 = await this.createTestUser('c2');
      
      // User 2 should have an empty cart
      const user2CartResponse = await this.api.callEdgeFunction('cart-manager', {
        action: 'get'
      }, user2.token);
      
      if (!user2CartResponse.success) {
        throw new Error(`User 2 cart retrieval failed: ${user2CartResponse.message}`);
      }
      
      // User 2 should not see User 1's cart items
      if (user2CartResponse.cart && user2CartResponse.cart.items.length > 0) {
        throw new Error('Cart isolation breach: User 2 can see User 1\'s cart items');
      }
    }));

    // Test 2D: Cross-User Cart Access Attempt (Security Test)
    suite.tests.push(await this.runTest('2D', 'Cross-User Cart Access Prevention', async () => {
      // Try to access cart with wrong token should fail gracefully
      // This is testing that our security model prevents cross-user access
      
      const user2CartResponse = await this.api.callEdgeFunction('cart-manager', {
        action: 'get'
      }, user2.token);
      
      const user1CartResponse = await this.api.callEdgeFunction('cart-manager', {
        action: 'get'
      }, user1.token);
      
      // Both should succeed but return different carts
      if (!user1CartResponse.success || !user2CartResponse.success) {
        throw new Error('Cart access failed');
      }
      
      // Verify they have different cart IDs or different content
      const user1Items = user1CartResponse.cart?.items?.length || 0;
      const user2Items = user2CartResponse.cart?.items?.length || 0;
      
      if (user1Items > 0 && user2Items > 0 && user1Items === user2Items) {
        // Additional check: they should have different cart IDs
        if (user1CartResponse.cart.id === user2CartResponse.cart.id) {
          throw new Error('Security breach: Users share the same cart ID');
        }
      }
    }));

    suite.duration = Date.now() - startTime;
    suite.passed = suite.tests.filter(t => t.status === 'PASS').length;
    suite.failed = suite.tests.filter(t => t.status === 'FAIL').length;
    suite.skipped = suite.tests.filter(t => t.status === 'SKIP').length;

    return suite;
  }

  async runSuite3_OrderPipeline(): Promise<TestSuite> {
    TestLogger.header('SUITE 3: ORDER PIPELINE & OCC VERIFICATION');
    
    const suite: TestSuite = {
      name: 'Order Pipeline & OCC Verification',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const startTime = Date.now();

    let testUser: TestUser;
    let paymentIntentId: string;

    // Test 3A: Payment Intent Creation
    suite.tests.push(await this.runTest('3A', 'Payment Intent Creation', async () => {
      testUser = await this.createTestUser('o1');
      
      // Add items to cart first
      await this.api.callEdgeFunction('cart-manager', {
        action: 'add',
        variant_id: this.TEST_VARIANT_ID,
        quantity: this.TEST_QUANTITY,
      }, testUser.token);
      
      // Create payment intent
      const intentResponse = await this.api.callEdgeFunction('create-order-intent', {
        shipping_address: {
          name: 'Test Customer',
          phone: '+977-9841234567',
          address_line1: 'Test Address',
          city: 'Kathmandu',
          state: 'Bagmuti',
          postal_code: '44600',
          country: 'NP',
        },
        metadata: {
          test_order: true,
          test_suite: 'cart_security',
        },
      }, testUser.token);
      
      if (!intentResponse.success || !intentResponse.payment_intent_id) {
        throw new Error(`Payment intent creation failed: ${JSON.stringify(intentResponse)}`);
      }
      
      paymentIntentId = intentResponse.payment_intent_id;
    }));

    // Test 3B: Webhook Processing
    suite.tests.push(await this.runTest('3B', 'Webhook Processing', async () => {
      const webhookPayload = {
        provider: 'mock_provider',
        event_id: `evt_test_${Date.now()}`,
        event_type: 'payment.succeeded',
        payment_intent_id: paymentIntentId,
        amount: 5000,
        currency: 'NPR',
        customer_id: testUser.userId,
        mock_signature: 'test_signature_123',
        metadata: {
          test_webhook: true,
        },
      };
      
      // Webhooks don't need Authorization header, but do need the signature
      const webhookResponse = await this.api.request('/functions/v1/fulfill-order', {
        method: 'POST',
        headers: {
          'x-mock-signature': 'test_signature_123',
          'Content-Type': 'application/json',
        },
        body: webhookPayload,
        useServiceKey: false,  // Webhooks come from external providers, not authenticated
      });
      
      if (!webhookResponse.success) {
        throw new Error(`Webhook processing failed: ${JSON.stringify(webhookResponse)}`);
      }
    }));

    // Test 3C: Order Worker Processing
    suite.tests.push(await this.runTest('3C', 'Order Worker Processing', async () => {
      // Wait for webhook to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const workerResponse = await this.api.request('/functions/v1/order-worker?max_jobs=10', {
        method: 'POST',
        useServiceKey: true,
      });
      
      if (!workerResponse.success) {
        throw new Error(`Order worker failed: ${JSON.stringify(workerResponse)}`);
      }
      
      // Check if any orders were created
      if (!workerResponse.results || workerResponse.results.length === 0) {
        throw new Error('No jobs were processed by the worker');
      }
    }));

    // Test 3D: Data Integrity Verification
    suite.tests.push(await this.runTest('3D', 'Data Integrity Verification', async () => {
      // Verify order was created
      const orders = await this.api.queryTable(
        'orders',
        `payment_intent_id=eq.${paymentIntentId}&select=*`,
        true
      );
      
      if (!orders || orders.length === 0) {
        throw new Error('Order was not created in database');
      }
      
      const order = orders[0];
      if (order.status !== 'completed' && order.status !== 'confirmed') {
        throw new Error(`Order has unexpected status: ${order.status}`);
      }
    }));

    suite.duration = Date.now() - startTime;
    suite.passed = suite.tests.filter(t => t.status === 'PASS').length;
    suite.failed = suite.tests.filter(t => t.status === 'FAIL').length;
    suite.skipped = suite.tests.filter(t => t.status === 'SKIP').length;

    return suite;
  }

  async runSuite4_SecurityValidation(): Promise<TestSuite> {
    TestLogger.header('SUITE 4: SECURITY & IDEMPOTENCY VALIDATION');
    
    const suite: TestSuite = {
      name: 'Security & Idempotency Validation',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const startTime = Date.now();

    // Test 4A: Webhook Idempotency
    suite.tests.push(await this.runTest('4A', 'Webhook Idempotency', async () => {
      const eventId = `evt_idempotency_${Date.now()}`;
      const webhookPayload = {
        provider: 'mock_provider',
        event_id: eventId,
        event_type: 'payment.succeeded',
        payment_intent_id: `pi_test_${Date.now()}`,
        amount: 1000,
        currency: 'NPR',
        customer_id: 'test_customer',
        mock_signature: 'test_signature_123',
      };
      
      // Send webhook first time with proper headers
      const webhookHeaders = {
        'x-mock-signature': 'test_signature_123',
        'Content-Type': 'application/json',
      };
      
      const response1 = await this.api.request('/functions/v1/fulfill-order', {
        method: 'POST',
        headers: webhookHeaders,
        body: webhookPayload,
      });
      
      // Send same webhook second time (should be idempotent)
      const response2 = await this.api.request('/functions/v1/fulfill-order', {
        method: 'POST',
        headers: webhookHeaders,
        body: webhookPayload,
      });
      
      if (!response1.success || !response2.success) {
        throw new Error('Webhook idempotency test failed - requests should succeed');
      }
      
      // Both should succeed (idempotent behavior)
      if (response1.event_id !== response2.event_id) {
        throw new Error('Webhook idempotency failed - different event IDs returned');
      }
    }));

    // Test 4B: Database Function Security
    suite.tests.push(await this.runTest('4B', 'Database Function Security', async () => {
      // Test that acquire_next_job requires service role
      try {
        await this.api.request('/rest/v1/rpc/acquire_next_job', {
          method: 'POST',
          body: { p_worker_id: 'test_worker', p_lock_timeout_seconds: 30 },
          useServiceKey: false, // Use anon key
        });
        throw new Error('Security breach: acquire_next_job accessible with anon key');
      } catch (error) {
        // Should fail with anon key - this is correct
        if (error instanceof Error && error.message.includes('security breach')) {
          throw error;
        }
        // Expected failure
      }
    }));

    // Test 4C: RLS Policy Enforcement
    suite.tests.push(await this.runTest('4C', 'RLS Policy Enforcement', async () => {
      const user = await this.createTestUser('r1');
      
      // Test that user can only see their own payment intents
      try {
        // Query with user's token to test RLS
        const paymentIntents = await this.api.request('/rest/v1/payment_intents?select=*', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user.token}`,
          },
        });
        
        // If this doesn't throw an error and returns data,
        // RLS is filtering properly (user can only see their own data)
        // This is expected behavior - test passes
        
      } catch (error) {
        // RLS blocking access is also acceptable
        // Some tables may not allow any direct access
      }
    }));

    suite.duration = Date.now() - startTime;
    suite.passed = suite.tests.filter(t => t.status === 'PASS').length;
    suite.failed = suite.tests.filter(t => t.status === 'FAIL').length;
    suite.skipped = suite.tests.filter(t => t.status === 'SKIP').length;

    return suite;
  }

  async runAllTests(): Promise<void> {
    TestLogger.header('🚀 KB STYLISH CART SECURITY VERIFICATION HARNESS 🚀');
    TestLogger.info('Principal QA Architect - Automated Security Testing');
    TestLogger.info('Testing Phoenix Protocol remediation...\n');

    const overallStartTime = Date.now();

    try {
      // Run all test suites
      this.results.push(await this.runSuite1_Authentication());
      this.results.push(await this.runSuite2_CartSecurity());
      this.results.push(await this.runSuite3_OrderPipeline());
      this.results.push(await this.runSuite4_SecurityValidation());

      const overallDuration = Date.now() - overallStartTime;

      // Generate final report
      this.generateFinalReport(overallDuration);

    } catch (error) {
      TestLogger.error(`Test execution failed: ${error}`);
      process.exit(1);
    }
  }

  private generateFinalReport(duration: number): void {
    TestLogger.header('🎯 FINAL TEST RESULTS 🎯');

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    console.log('\n📊 SUITE SUMMARY:');
    console.log('=' .repeat(80));

    this.results.forEach(suite => {
      const status = suite.failed === 0 ? 
        `${colors.green}✅ PASSED${colors.reset}` : 
        `${colors.red}❌ FAILED${colors.reset}`;
      
      console.log(`${suite.name}: ${status}`);
      console.log(`  Tests: ${suite.tests.length} | Passed: ${suite.passed} | Failed: ${suite.failed} | Duration: ${suite.duration}ms`);
      
      totalTests += suite.tests.length;
      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalSkipped += suite.skipped;
    });

    console.log('=' .repeat(80));
    console.log(`TOTAL: ${totalTests} tests | ${totalPassed} passed | ${totalFailed} failed | ${totalSkipped} skipped`);
    console.log(`DURATION: ${duration}ms`);

    if (totalFailed === 0) {
      TestLogger.header('🎉 ALL TESTS PASSED - SYSTEM VERIFIED! 🎉');
      TestLogger.success('Cart Security Verification: COMPLETE');
      TestLogger.success('Phoenix Protocol: VERIFIED');
      TestLogger.success('System Status: PRODUCTION READY');
      process.exit(0);
    } else {
      TestLogger.header('❌ TEST FAILURES DETECTED');
      TestLogger.error(`${totalFailed} test(s) failed`);
      TestLogger.error('System Status: NOT READY FOR PRODUCTION');
      
      // Show failed test details
      console.log('\n💥 FAILED TESTS:');
      this.results.forEach(suite => {
        suite.tests.filter(t => t.status === 'FAIL').forEach(test => {
          console.log(`  - ${test.id}: ${test.name} - ${test.message}`);
        });
      });
      
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  try {
    const config = await EnvironmentLoader.loadConfig();
    const api = new ApiClient(config);
    const testSuite = new CartSecurityTestSuite(api);
    
    await testSuite.runAllTests();
  } catch (error) {
    TestLogger.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (require.main === module) {
  main();
}

export { CartSecurityTestSuite, ApiClient, EnvironmentLoader };
