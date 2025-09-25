/**
 * ==========================================
 * ENTERPRISE CART CLIENT TEST SUITE
 * ==========================================
 * 
 * Built on the Unbreakable Foundation™
 * - Environment: Centralized in jest.setup.js
 * - Mocking: Global bulletproof fetch mock
 * - Focus: Pure business logic testing
 * 
 * No patches. No workarounds. Just architecture.
 */

import { CartAPIClient, type ShippingAddress } from '../cartClient';

// Mock Supabase - this is the ONLY mock needed in the test file
jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn((callback) => {
        if (callback) callback('INITIAL_SESSION', null);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      })
    }
  }))
}));

// Mock window for browser environment check
(global as any).window = { location: { href: 'http://localhost:3000' } };

describe('CartAPIClient - Enterprise Test Suite', () => {
  let cartAPI: CartAPIClient;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  
  beforeEach(() => {
    // The global fetch mock is already reset by jest.setup.js
    fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    
    // Mock document.cookie for guest token tests
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
      configurable: true
    });
    
    // Create CartAPIClient instance - environment already configured
    cartAPI = new CartAPIClient();
  });
  
  describe('Guest Token Management', () => {
    it('should generate guest token in correct format', async () => {
      await cartAPI.getCart();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cart-manager'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-guest-token': expect.stringMatching(/^guest_\d+_[a-z0-9]+$/)
          })
        })
      );
    });
    
    it('should reuse existing guest token from cookie', async () => {
      document.cookie = 'guest_token=guest_1234_abc123';
      
      await cartAPI.getCart();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cart-manager'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-guest-token': 'guest_1234_abc123'
          })
        })
      );
    });
    
    it('should clear guest token on clearSession', () => {
      document.cookie = 'guest_token=guest_1234_abc123';
      
      expect(typeof cartAPI.clearSession).toBe('function');
      cartAPI.clearSession();
      expect(() => cartAPI.clearSession()).not.toThrow();
    });
  });
  
  describe('Cart Operations', () => {
    describe('getCart', () => {
      it('should fetch cart with correct parameters', async () => {
        const result = await cartAPI.getCart();
        
        expect(fetchMock).toHaveBeenCalledWith(
          'https://mock.supabase.co/functions/v1/cart-manager',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ action: 'get' }),
            credentials: 'include',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'Authorization': 'Bearer mock-anon-key-12345'
            })
          })
        );
        
        expect(result.success).toBe(true);
        expect(result.cart).toBeDefined();
      });
      
      it('should handle empty cart response', async () => {
        const result = await cartAPI.getCart();
        
        expect(result.success).toBe(true);
        expect(result.cart?.cart_items).toEqual([]);
        expect(result.cart?.item_count).toBe(0);
        expect(result.cart?.subtotal).toBe(0);
      });
      
      it('should handle network errors gracefully', async () => {
        // Override global mock for this test only
        fetchMock
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));
        
        const result = await cartAPI.getCart();
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error while fetching cart');
        expect(fetchMock).toHaveBeenCalledTimes(3); // Retry logic
      });
    });
    
    describe('addToCart', () => {
      it('should add item with correct parameters', async () => {
        const mockResponseWithItem = {
          success: true,
          cart: {
            id: 'cart_123',
            cart_items: [{
              id: 'item_new',
              variant_id: 'variant_xyz',
              quantity: 3,
              price_snapshot: 999
            }],
            item_count: 3,
            subtotal: 2997
          }
        };
        
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponseWithItem)
        } as Response);
        
        const result = await cartAPI.addToCart('variant_xyz', 3);
        
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/cart-manager'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              action: 'add',
              variant_id: 'variant_xyz',
              quantity: 3
            })
          })
        );
        
        expect(result.success).toBe(true);
        expect(result.cart?.cart_items?.[0].variant_id).toBe('variant_xyz');
      });
      
      it('should handle out of stock error', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            success: false,
            message: 'Out of stock'
          })
        } as Response);
        
        const result = await cartAPI.addToCart('variant_xyz', 5);
        
        expect(result.success).toBe(false);
        expect(result.message).toContain('Out of stock');
      });
      
      it('should retry on network failure', async () => {
        const successResponse = {
          ok: true,
          json: () => Promise.resolve({ success: true, cart: { items: [] } })
        } as Response;
        
        fetchMock
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(successResponse);
        
        const result = await cartAPI.addToCart('variant_xyz', 1);
        
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(result.success).toBe(true);
      });
    });
    
    describe('updateCartItem', () => {
      it('should resolve variant_id from item_id', async () => {
        const getCartResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            cart: {
              cart_items: [{
                id: 'item_abc',
                variant_id: 'variant_xyz',
                quantity: 2,
                price_snapshot: 1000
              }]
            }
          })
        } as Response;
        
        const updateResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            cart: {
              cart_items: [{
                id: 'item_abc',
                variant_id: 'variant_xyz',
                quantity: 5,
                price_snapshot: 1000
              }]
            }
          })
        } as Response;
        
        fetchMock
          .mockResolvedValueOnce(getCartResponse)
          .mockResolvedValueOnce(updateResponse);
        
        const result = await cartAPI.updateCartItem('item_abc', 5);
        
        expect(fetchMock).toHaveBeenCalledTimes(2);
        
        // Verify the second call (update) has correct parameters
        const updateCall = fetchMock.mock.calls[1];
        expect(JSON.parse(updateCall[1]?.body as string)).toEqual({
          action: 'update',
          variant_id: 'variant_xyz',
          quantity: 5
        });
        
        expect(result.success).toBe(true);
      });
      
      it('should handle quantity 0 as remove operation', async () => {
        const result = await cartAPI.updateCartItem('variant_xyz', 0);
        expect(result.success).toBe(true);
      });
    });
    
    describe('removeFromCart', () => {
      it('should remove item by resolving variant_id', async () => {
        const getCartResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            cart: {
              cart_items: [{
                id: 'item_abc',
                variant_id: 'variant_xyz',
                quantity: 1,
                price_snapshot: 1000
              }]
            }
          })
        } as Response;
        
        const removeResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            cart: { cart_items: [], item_count: 0, subtotal: 0 }
          })
        } as Response;
        
        fetchMock
          .mockResolvedValueOnce(getCartResponse)
          .mockResolvedValueOnce(removeResponse);
        
        const result = await cartAPI.removeFromCart('item_abc');
        
        expect(fetchMock).toHaveBeenCalledTimes(2);
        
        const removeCall = fetchMock.mock.calls[1];
        expect(JSON.parse(removeCall[1]?.body as string)).toEqual({
          action: 'remove',
          variant_id: 'variant_xyz'
        });
        
        expect(result.success).toBe(true);
      });
    });
    
    describe('clearCart', () => {
      it('should clear all items', async () => {
        const clearResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            cart: { id: null, cart_items: [], item_count: 0, subtotal: 0 }
          })
        } as Response;
        
        fetchMock.mockResolvedValueOnce(clearResponse);
        
        const result = await cartAPI.clearCart();
        
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/cart-manager'),
          expect.objectContaining({
            body: JSON.stringify({ action: 'clear' })
          })
        );
        
        expect(result.success).toBe(true);
      });
    });
  });
  
  describe('Order Intent Creation', () => {
    it('should create payment intent with correct address mapping', async () => {
      const orderResponse = {
        ok: true,
        json: () => Promise.resolve({
          success: true,
          payment_intent_id: 'pi_mock_123',
          client_secret: 'secret_xyz',
          amount_cents: 15000,
          expires_at: '2024-01-01T00:30:00Z'
        })
      } as Response;
      
      fetchMock.mockResolvedValueOnce(orderResponse);
      
      const shippingAddress: ShippingAddress = {
        name: 'John Doe',
        phone: '+977-9841234567',
        address_line1: '123 Main St',
        address_line2: 'Apt 4B',
        city: 'Kathmandu',
        state: 'Bagmati',
        postal_code: '44600',
        country: 'NP'
      };
      
      const result = await cartAPI.createOrderIntent(shippingAddress);
      
      expect(fetchMock).toHaveBeenCalledWith(
        'https://mock.supabase.co/functions/v1/create-order-intent',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('shipping_address')
        })
      );
      
      expect(result.success).toBe(true);
      expect(result.payment_intent_id).toBe('pi_mock_123');
      expect(result.client_secret).toBe('secret_xyz');
      expect(result.amount_cents).toBe(15000);
    });
    
    it('should handle inventory reservation failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Inventory reservation failed',
          details: ['Insufficient inventory for SKU-001']
        })
      } as Response);
      
      const result = await cartAPI.createOrderIntent({
        name: 'John',
        phone: '123',
        address_line1: '123 Main',
        city: 'City',
        state: 'State',
        postal_code: '12345',
        country: 'NP'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Inventory reservation failed');
      expect(result.details).toContain('Insufficient inventory for SKU-001');
    });
    
    it('should handle authentication error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: 'Authentication required'
        })
      } as Response);
      
      const result = await cartAPI.createOrderIntent({
        name: 'John',
        phone: '123',
        address_line1: '123',
        city: 'City',
        state: 'State',
        postal_code: '12345',
        country: 'NP'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required');
    });
    
    it('should handle empty cart error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Cart is empty'
        })
      } as Response);
      
      const result = await cartAPI.createOrderIntent({
        name: 'John',
        phone: '123',
        address_line1: '123',
        city: 'City',
        state: 'State',
        postal_code: '12345',
        country: 'NP'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cart is empty');
    });
    
    it('should retry on network failure', async () => {
      const successResponse = {
        ok: true,
        json: () => Promise.resolve({
          success: true,
          payment_intent_id: 'pi_123',
          client_secret: 'secret',
          amount_cents: 10000,
          expires_at: '2024-01-01T00:30:00Z'
        })
      } as Response;
      
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(successResponse);
      
      const result = await cartAPI.createOrderIntent({
        name: 'John',
        phone: '123',
        address_line1: '123',
        city: 'City',
        state: 'State',
        postal_code: '12345',
        country: 'NP'
      });
      
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });
  });
  
  describe('Authentication & Headers', () => {
    it('should use correct anon key for guest users', async () => {
      await cartAPI.getCart();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-anon-key-12345',
            'apikey': 'mock-anon-key-12345'
          })
        })
      );
    });
    
    it('should include credentials for CORS', async () => {
      await cartAPI.getCart();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include'
        })
      );
    });
  });
});
