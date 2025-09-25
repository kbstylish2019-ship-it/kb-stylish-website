/**
 * Cart Store Test Suite - Complete Architectural Realignment v3.0
 * 
 * This is the definitive test suite for the KB Stylish cart system.
 * It tests both products and bookings (which are just product variants).
 * 
 * Architecture:
 * - Fully asynchronous with proper act() and waitFor()
 * - Correct mock structure matching Edge Function responses
 * - Tests optimistic updates and rollback mechanisms
 * - Covers all success and failure scenarios
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useCartStore } from '../cartStore';
import { cartAPI } from '@/lib/api/cartClient';
import type { CartResponse } from '@/lib/api/cartClient';

// Mock the cart API client
jest.mock('@/lib/api/cartClient', () => ({
  cartAPI: {
    getCart: jest.fn(),
    addToCart: jest.fn(),
    updateCartItem: jest.fn(),
    removeFromCart: jest.fn(),
    clearCart: jest.fn(),
    clearSession: jest.fn(),
    mergeCart: jest.fn(),
    createOrderIntent: jest.fn(),
  }
}));

describe('Cart Store - Complete Integration Tests', () => {
  // Helper to get mocked cartAPI
  const mockedCartAPI = cartAPI as jest.Mocked<typeof cartAPI>;
  
  // Helper to create a cart response matching Edge Function structure
  const createCartResponse = (items: any[] = [], userId: string | null = null): CartResponse => ({
    success: true,
    cart: {
      id: 'cart_123',
      user_id: userId,
      guest_session: userId ? undefined : 'guest_123',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      // Edge Function returns cart_items, not items
      cart_items: items,
      // Edge Function returns item_count, not total_items
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
      // Edge Function returns subtotal, not total_amount
      subtotal: items.reduce((sum, item) => sum + (item.price_snapshot * item.quantity), 0),
    },
  });
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset store to initial state
    act(() => {
      useCartStore.setState({
        cartId: null,
        items: [],
        totalItems: 0,
        totalAmount: 0,
        isGuest: true,
        isLoading: false,
        isAddingItem: false,
        isUpdatingItem: {},
        isRemovingItem: {},
        // isMerging: false, // Property removed from interface
        error: null,
        lastError: null,
        snapshot: null,
      });
    });
  });

  describe('Cart Initialization', () => {
    it('should initialize empty cart', async () => {
      const { result } = renderHook(() => useCartStore());
      
      expect(result.current.items).toHaveLength(0);
      expect(result.current.totalItems).toBe(0);
      expect(result.current.totalAmount).toBe(0);
      expect(result.current.isGuest).toBe(true);
    });

    it('should fetch cart from server', async () => {
      const mockItems = [{
        id: 'item_1',
        cart_id: 'cart_123',
        variant_id: 'variant_1',
        quantity: 2,
        price_snapshot: 1500,
        added_at: '2024-01-01T00:00:00Z',
        product_name: 'Test Product',
        product_slug: 'test-product',
        variant_sku: 'SKU001',
        product_image: '/test.jpg',
      }];
      
      mockedCartAPI.getCart.mockResolvedValue(createCartResponse(mockItems));
      
      const { result } = renderHook(() => useCartStore());
      
      await act(async () => {
        await result.current.fetchCart();
      });
      
      expect(mockedCartAPI.getCart).toHaveBeenCalledTimes(1);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.totalItems).toBe(2);
      expect(result.current.totalAmount).toBe(3000);
    });

    it('should handle fetch cart error', async () => {
      mockedCartAPI.getCart.mockResolvedValue({
        success: false,
        error: 'Network error',
      });
      
      const { result } = renderHook(() => useCartStore());
      
      await act(async () => {
        await result.current.fetchCart();
      });
      
      expect(result.current.error).toBe('Network error');
      expect(result.current.items).toHaveLength(0);
    });
  });

  describe('Adding Items', () => {
    it('should add product to cart with optimistic update', async () => {
      const { result } = renderHook(() => useCartStore());
      
      // Mock successful add response with a delay to observe optimistic update
      mockedCartAPI.addToCart.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve(createCartResponse([{
              id: 'item_1',
              cart_id: 'cart_123',
              variant_id: 'variant_123',
              quantity: 1,
              price_snapshot: 2999,
              added_at: '2024-01-01T00:00:00Z',
              product_name: 'Classic Denim Jacket',
              product_slug: 'classic-denim-jacket',
              variant_sku: 'DENIM-M-BLUE',
              product_image: '/denim.jpg',
            }]));
          }, 10);
        })
      );
      
      let addPromise: Promise<boolean>;
      
      act(() => {
        addPromise = result.current.addItem('variant_123', 1, {
          name: 'Classic Denim Jacket',
          slug: 'classic-denim-jacket',
          price: 2999,
          sku: 'DENIM-M-BLUE',
          image: '/denim.jpg',
        });
      });
      
      // Check optimistic update happened immediately
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].variant_id).toBe('variant_123');
      expect(result.current.items[0].id).toContain('temp_'); // Temporary ID
      expect(result.current.totalItems).toBe(1);
      expect(result.current.totalAmount).toBe(2999);
      
      // Wait for async operation to complete
      await act(async () => {
        const success = await addPromise!;
        expect(success).toBe(true);
      });
      
      // Check final state after server response
      expect(mockedCartAPI.addToCart).toHaveBeenCalledWith('variant_123', 1);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe('item_1'); // Real ID from server
      expect(result.current.totalItems).toBe(1);
      expect(result.current.totalAmount).toBe(2999);
    });

    it('should add booking as cart item', async () => {
      const { result } = renderHook(() => useCartStore());
      
      // Bookings are just product variants with special IDs
      mockedCartAPI.addToCart.mockResolvedValue(createCartResponse([{
        id: 'item_booking_1',
        cart_id: 'cart_123',
        variant_id: 'booking_stylist1_haircut_20240310_1000',
        quantity: 1,
        price_snapshot: 1500,
        added_at: '2024-01-01T00:00:00Z',
        product_name: 'Haircut - Stylist A - March 10, 10:00 AM',
        product_slug: 'booking-haircut',
        variant_sku: 'BOOK_HAIRCUT_20240310_1000',
        product_image: null,
      }]));
      
      await act(async () => {
        const success = await result.current.addItem(
          'booking_stylist1_haircut_20240310_1000',
          1,
          {
            name: 'Haircut - Stylist A - March 10, 10:00 AM',
            slug: 'booking-haircut',
            price: 1500,
            sku: 'BOOK_HAIRCUT_20240310_1000',
          }
        );
        expect(success).toBe(true);
      });
      
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].variant_id).toContain('booking_');
      expect(result.current.totalAmount).toBe(1500);
    });

    it('should rollback optimistic update on error', async () => {
      const { result } = renderHook(() => useCartStore());
      
      // Mock failed add
      mockedCartAPI.addToCart.mockResolvedValue({
        success: false,
        error: 'Out of stock',
      });
      
      const initialState = {
        items: [],
        totalItems: 0,
        totalAmount: 0,
      };
      
      await act(async () => {
        const success = await result.current.addItem('variant_123', 1, {
          name: 'Test Product',
          slug: 'test-product',
          price: 1000,
          sku: 'SKU001',
        });
        expect(success).toBe(false);
      });
      
      // Should have rolled back to initial state
      expect(result.current.items).toEqual(initialState.items);
      expect(result.current.totalItems).toBe(initialState.totalItems);
      expect(result.current.totalAmount).toBe(initialState.totalAmount);
      expect(result.current.error).toBe('Out of stock');
    });
  });

  describe('Updating Items', () => {
    it('should update item quantity', async () => {
      const { result } = renderHook(() => useCartStore());
      
      // Initialize with item
      act(() => {
        useCartStore.setState({
          cartId: 'cart_123',
          items: [{
            id: 'item_1',
            cart_id: 'cart_123',
            variant_id: 'variant_123',
            quantity: 2,
            price_snapshot: 1000,
            added_at: '2024-01-01T00:00:00Z',
            product_name: 'Test Product',
            product_slug: 'test-product',
            variant_sku: 'SKU001',
          }],
          totalItems: 2,
          totalAmount: 2000,
        });
      });
      
      // Mock update response with Edge Function field names
      mockedCartAPI.updateCartItem.mockResolvedValue({
        success: true,
        cart: {
          id: 'cart_123',
          user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          // Note: Edge Function might return different field names
          items: [{
            id: 'item_1',
            cart_id: 'cart_123',
            variant_id: 'variant_123',
            quantity: 5,
            price_snapshot: 1000,
            added_at: '2024-01-01T00:00:00Z',
            product_name: 'Test Product',
            product_slug: 'test-product',
            variant_sku: 'SKU001',
          }],
          total_items: 5,
          total_amount: 5000,
        },
      });
      
      await act(async () => {
        const success = await result.current.updateItem('item_1', 5);
        expect(success).toBe(true);
      });
      
      expect(mockedCartAPI.updateCartItem).toHaveBeenCalledWith('item_1', 5);
      expect(result.current.items[0].quantity).toBe(5);
      expect(result.current.totalItems).toBe(5);
      expect(result.current.totalAmount).toBe(5000);
    });
  });

  describe('Legacy Compatibility', () => {
    it('should support legacy addProduct method', async () => {
      const { result } = renderHook(() => useCartStore());
      
      // Mock successful add
      mockedCartAPI.addToCart.mockResolvedValue(createCartResponse([{
        id: 'item_1',
        cart_id: 'cart_123',
        variant_id: 'product_123',
        quantity: 2,
        price_snapshot: 999,
        added_at: '2024-01-01T00:00:00Z',
        product_name: 'Legacy Product',
        product_slug: 'legacy-product',
        variant_sku: 'LEGACY001',
        product_image: '/legacy.jpg',
      }]));
      
      // Use legacy addProduct (fire and forget)
      act(() => {
        result.current.addProduct({
          id: 'product_123',
          name: 'Legacy Product',
          variant: 'M / Blue',
          variantId: 'product_123',
          imageUrl: '/legacy.jpg',
          price: 999,
          quantity: 2,
          sku: 'LEGACY001',
        });
      });
      
      // Wait for async operation to complete
      await waitFor(() => {
        expect(mockedCartAPI.addToCart).toHaveBeenCalledWith('product_123', 2);
      });
      
      // Eventually the cart should be updated
      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].variant_id).toBe('product_123');
        expect(result.current.totalItems).toBe(2);
      });
    });
  });

  describe('Utility Functions', () => {
    it('should calculate total quantity correctly', () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        useCartStore.setState({
          items: [
            {
              id: 'item_1',
              cart_id: 'cart_123',
              variant_id: 'variant_1',
              quantity: 2,
              price_snapshot: 1000,
              added_at: '2024-01-01T00:00:00Z',
              product_name: 'Product 1',
              product_slug: 'product-1',
              variant_sku: 'SKU001',
            },
            {
              id: 'item_2',
              cart_id: 'cart_123',
              variant_id: 'variant_2',
              quantity: 3,
              price_snapshot: 500,
              added_at: '2024-01-01T00:00:00Z',
              product_name: 'Product 2',
              product_slug: 'product-2',
              variant_sku: 'SKU002',
            },
          ],
        });
      });
      
      expect(result.current.getTotalQuantity()).toBe(5);
      expect(result.current.getItemCount()).toBe(5); // Legacy alias
    });

    it('should reset store to initial state', () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        useCartStore.setState({
          cartId: 'cart_123',
          items: [{
            id: 'item_1',
            cart_id: 'cart_123',
            variant_id: 'variant_1',
            quantity: 1,
            price_snapshot: 1000,
            added_at: '2024-01-01T00:00:00Z',
            product_name: 'Test',
            product_slug: 'test',
            variant_sku: 'SKU001',
          }],
          totalItems: 1,
          totalAmount: 1000,
          isGuest: false,
          error: 'Some error',
        });
      });
      
      act(() => {
        result.current.reset();
      });
      
      expect(result.current.cartId).toBeNull();
      expect(result.current.items).toHaveLength(0);
      expect(result.current.totalItems).toBe(0);
      expect(result.current.totalAmount).toBe(0);
      expect(result.current.isGuest).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });
});
