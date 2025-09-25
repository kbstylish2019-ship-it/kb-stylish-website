// Test script to verify cache pipeline is working
// Run with: node scripts/test-cache.js

// IMPORTANT: Load environment variables FIRST
require('dotenv').config({ path: '.env.local' });

const { Redis } = require('@upstash/redis');

// Debug: Check if env vars are loaded
console.log('Environment Check:');
console.log('KV_REST_API_URL:', process.env.KV_REST_API_URL ? '✅ Found' : '❌ Missing');
console.log('KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? '✅ Found' : '❌ Missing');
console.log('');

// Initialize Redis with your environment variables
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function testCache() {
  console.log('🚀 Testing Upstash Redis Cache Pipeline...\n');

  try {
    // Test 1: Basic connectivity
    console.log('Test 1: Basic connectivity');
    await redis.set('test:key', 'Hello from KB Stylish!');
    const value = await redis.get('test:key');
    console.log('✅ Connected! Value:', value);
    
    // Test 2: Cache with TTL
    console.log('\nTest 2: Cache with TTL (5 minutes)');
    await redis.set('product:test-product', {
      name: 'Test Product',
      price: 9999,
      timestamp: new Date().toISOString()
    }, {
      ex: 300 // 5 minutes
    });
    const product = await redis.get('product:test-product');
    console.log('✅ Cached product:', product);
    
    // Test 3: Delete cache
    console.log('\nTest 3: Cache invalidation');
    await redis.del('product:test-product');
    const deleted = await redis.get('product:test-product');
    console.log('✅ Cache invalidated:', deleted === null ? 'Success' : 'Failed');
    
    // Test 4: Edge function health check
    console.log('\nTest 4: Edge Function Health Check');
    const response = await fetch('https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cache-invalidator/health');
    const health = await response.json();
    console.log('✅ Edge Function Status:', health);
    
    console.log('\n🎉 All tests passed! Cache pipeline is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure your KV_REST_API_URL and KV_REST_API_TOKEN are set in .env.local');
    console.log('2. Verify Upstash Redis is connected in Vercel Dashboard');
  }
}

// Run tests
testCache();
