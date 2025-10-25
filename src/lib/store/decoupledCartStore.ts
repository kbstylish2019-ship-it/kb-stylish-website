'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { cartAPI, type CartItem as APICartItem, type CartResponse } from '@/lib/api/cartClient';
import { useBookingPersistStore } from './bookingPersistStore';

/**
 * THE GREAT DECOUPLING - Separated Cart Store v2.0
 * 
 * Architecture:
 * - Products and Bookings are now completely separate entities
 * - Each has its own state, actions, and lifecycle
 * - No more fake product variants for bookings
 * - Clean, type-safe, maintainable
 */

// ============ Product Types ============
export interface CartProductItem {
  id: string; // cart_items.id
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name?: string;
  variant_data?: {  // ⭐ NEW: Structured variant attributes for UI
    size?: string;
    color?: string;
    colorHex?: string;
  };
  sku: string;
  price: number;
  quantity: number;
  image_url?: string;
  subtotal: number;
}

// ============ Booking Types ============
export interface CartBookingItem {
  id: string; // reservation_id
  reservation_id: string;
  service_id: string;
  service_name: string;
  stylist_id: string;
  stylist_name: string;
  start_time: string;
  end_time: string;
  price: number;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_notes?: string;
  expires_at: string;
}

// ============ Store State Interface ============
interface DecoupledCartState {
  // ============ Product State ============
  cartId: string | null;
  productItems: CartProductItem[];
  productTotal: number;
  productCount: number;
  
  // ============ Booking State ============
  bookingItems: CartBookingItem[];
  bookingTotal: number;
  bookingCount: number;
  
  // ============ Combined Totals ============
  grandTotal: number;
  totalItems: number;
  
  // ============ UI State ============
  isLoading: boolean;
  isGuest: boolean;
  isAddingProduct: boolean;
  isAddingBooking: boolean;
  isUpdatingItem: Record<string, boolean>;
  isRemovingItem: Record<string, boolean>;
  error: string | null;
  lastError: Error | null;
  
  // ============ Product Actions ============
  addProductItem: (
    variantId: string, 
    quantity: number, 
    productDetails?: Partial<CartProductItem>
  ) => Promise<boolean>;
  
  removeProductItem: (itemId: string) => Promise<boolean>;
  
  updateProductQuantity: (itemId: string, quantity: number) => Promise<boolean>;
  
  // ============ Booking Actions ============
  addBookingItem: (booking: Omit<CartBookingItem, 'id'>) => Promise<boolean>;
  
  removeBookingItem: (reservationId: string) => Promise<boolean>;
  
  // ============ Cart Management ============
  initializeCart: (initialData?: any) => Promise<void>;
  clearCart: () => Promise<void>;
  syncWithServer: () => Promise<void>;
  mergeCartAfterLogin: () => Promise<void>;
  
  // ============ Utility Actions ============
  clearError: () => void;
  setError: (error: string | Error) => void;
  updateGrandTotals: () => void;
  cleanupExpiredBookings: () => void;
  
  // ============ Computed Getters ============
  getProductById: (itemId: string) => CartProductItem | undefined;
  getBookingById: (reservationId: string) => CartBookingItem | undefined;
  hasProducts: () => boolean;
  hasBookings: () => boolean;
  isEmpty: () => boolean;
}

// ============ Store Implementation ============
export const useDecoupledCartStore = create<DecoupledCartState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ============ Initial State ============
      cartId: null,
      productItems: [],
      productTotal: 0,
      productCount: 0,
      
      bookingItems: [],
      bookingTotal: 0,
      bookingCount: 0,
      
      grandTotal: 0,
      totalItems: 0,
      
      isLoading: false,
      isGuest: true,
      isAddingProduct: false,
      isAddingBooking: false,
      isUpdatingItem: {},
      isRemovingItem: {},
      error: null,
      lastError: null,
      
      // ============ Product Actions ============
      addProductItem: async (variantId, quantity, productDetails) => {
        console.log('[DecoupledStore] Adding product:', { variantId, quantity });
        
        set({ isAddingProduct: true, error: null });
        
        try {
          // RESTORATION: Single API call returns full cart with contract alignment
          const response = await cartAPI.addToCart(variantId, quantity);
          
          console.log('[DecoupledStore] Received response from cartAPI:', response);
          
          if (response.success && response.cart) {
            // Accept both cart_items and items for compatibility
            const apiItems = response.cart.cart_items || response.cart.items || [];
            const newProductItems = transformApiItemsToProducts(apiItems);
            
            set({
              cartId: response.cart.id,
              productItems: newProductItems,
              productTotal: calculateProductTotal(newProductItems),
              productCount: newProductItems.reduce((sum, item) => sum + item.quantity, 0),
              isAddingProduct: false
            });
            
            // Update grand totals
            get().updateGrandTotals();
            
            // Handle any warnings (e.g., price changes)
            if (response.warnings && response.warnings.length > 0) {
              console.warn('[DecoupledStore] Cart warnings:', response.warnings);
            }
            
            return true;
          } else {
            throw new Error(response.error || response.message || 'Failed to add product to cart');
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to add product:', error);
          set({ 
            isAddingProduct: false, 
            error: error instanceof Error ? error.message : 'Failed to add product',
            lastError: error instanceof Error ? error : null
          });
          return false;
        }
      },
      
      removeProductItem: async (itemId) => {
        console.log('[DecoupledStore] Removing product:', itemId);
        
        set(state => ({ 
          isRemovingItem: { ...state.isRemovingItem, [itemId]: true },
          error: null 
        }));
        
        try {
          // RESTORATION: Single API call returns full cart with contract alignment
          const response = await cartAPI.removeFromCart(itemId);
          
          if (response.success && response.cart) {
            // Accept both cart_items and items for compatibility
            const apiItems = response.cart.cart_items || response.cart.items || [];
            const newProductItems = transformApiItemsToProducts(apiItems);
            
            set(state => ({
              productItems: newProductItems,
              productTotal: calculateProductTotal(newProductItems),
              productCount: newProductItems.reduce((sum, item) => sum + item.quantity, 0),
              isRemovingItem: { ...state.isRemovingItem, [itemId]: false }
            }));
            
            get().updateGrandTotals();
            
            // Handle any warnings
            if (response.warnings && response.warnings.length > 0) {
              console.warn('[DecoupledStore] Cart warnings:', response.warnings);
            }
            
            return true;
          } else {
            throw new Error(response.error || response.message || 'Failed to remove product');
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to remove product:', error);
          set(state => ({ 
            isRemovingItem: { ...state.isRemovingItem, [itemId]: false },
            error: error instanceof Error ? error.message : 'Failed to remove product',
            lastError: error instanceof Error ? error : null
          }));
          return false;
        }
      },
      
      updateProductQuantity: async (itemId, quantity) => {
        console.log('[DecoupledStore] Updating product quantity:', { itemId, quantity });
        
        if (quantity < 1) {
          return get().removeProductItem(itemId);
        }
        
        set(state => ({ 
          isUpdatingItem: { ...state.isUpdatingItem, [ itemId]: true },
          error: null 
        }));
        
        try {
          // RESTORATION: Single API call returns full cart with contract alignment
          const response = await cartAPI.updateCartItem(itemId, quantity);
          
          if (response.success && response.cart) {
            // Accept both cart_items and items
            const apiItems = response.cart.cart_items || response.cart.items || [];
            const newProductItems = transformApiItemsToProducts(apiItems);
            
            set(state => ({
              productItems: newProductItems,
              productTotal: calculateProductTotal(newProductItems),
              productCount: newProductItems.reduce((sum, item) => sum + item.quantity, 0),
              isUpdatingItem: { ...state.isUpdatingItem, [ itemId]: false }
            }));
            
            get().updateGrandTotals();
            
            // Handle any warnings
            if (response.warnings && response.warnings.length > 0) {
              console.warn('[DecoupledStore] Cart warnings:', response.warnings);
            }
            
            return true;
          } else {
            throw new Error(response.error || response.message || 'Failed to update quantity');
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to update quantity:', error);
          set(state => ({ 
            isUpdatingItem: { ...state.isUpdatingItem, [itemId]: false },
            error: error instanceof Error ? error.message : 'Failed to update quantity',
            lastError: error instanceof Error ? error : null
          }));
          return false;
        }
      },
      
      // ============ Booking Actions ============
      addBookingItem: async (booking) => {
        console.log('[DecoupledStore] Adding booking reservation:', booking);
        
        set({ isAddingBooking: true, error: null });
        
        try {
          // First, clean up any expired bookings
          get().cleanupExpiredBookings();
          
          // Bookings are stored locally until checkout
          // They don't go through the cart API
          const newBooking: CartBookingItem = {
            ...booking,
            id: booking.reservation_id
          };
          
          const updatedBookings = [...get().bookingItems, newBooking];
          
          set(state => ({
            bookingItems: updatedBookings,
            bookingTotal: state.bookingTotal + newBooking.price,
            bookingCount: state.bookingCount + 1,
            isAddingBooking: false
          }));
          
          // Persist bookings separately
          useBookingPersistStore.getState().saveBookings(updatedBookings);
          
          get().updateGrandTotals();
          return true;
        } catch (error) {
          console.error('[DecoupledStore] Failed to add booking:', error);
          set({ 
            isAddingBooking: false, 
            error: error instanceof Error ? error.message : 'Failed to add booking',
            lastError: error instanceof Error ? error : null
          });
          return false;
        }
      },
      
      removeBookingItem: async (reservationId) => {
        console.log('[DecoupledStore] Removing booking:', reservationId);
        
        set(state => ({ 
          isRemovingItem: { ...state.isRemovingItem, [reservationId]: true },
          error: null 
        }));
        
        try {
          // CRITICAL: Cancel the reservation in backend FIRST
          const response = await fetch('/api/bookings/cancel-reservation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservationId })
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            
            // 404 is acceptable - means already cancelled/removed
            if (response.status === 404) {
              console.warn('[DecoupledStore] Reservation already cancelled:', reservationId);
              // Continue to remove from UI
            } else {
              // Other errors should stop the removal
              throw new Error(errorData.error || `Server returned ${response.status}`);
            }
          } else {
            console.log('[DecoupledStore] Successfully cancelled reservation in backend');
          }
          
          // Remove booking locally
          const bookingToRemove = get().bookingItems.find(b => b.reservation_id === reservationId);
          
          if (bookingToRemove) {
            const updatedBookings = get().bookingItems.filter(b => b.reservation_id !== reservationId);
            
            set(state => ({
              bookingItems: updatedBookings,
              bookingTotal: state.bookingTotal - bookingToRemove.price,
              bookingCount: state.bookingCount - 1,
              isRemovingItem: { ...state.isRemovingItem, [reservationId]: false }
            }));
            
            // Update persist store
            useBookingPersistStore.getState().saveBookings(updatedBookings);
            
            get().updateGrandTotals();
          }
          
          return true;
        } catch (error) {
          console.error('[DecoupledStore] Failed to remove booking:', error);
          set(state => ({ 
            isRemovingItem: { ...state.isRemovingItem, [reservationId]: false },
            error: error instanceof Error ? error.message : 'Failed to remove booking',
            lastError: error instanceof Error ? error : null
          }));
          return false;
        }
      },
      
      // ============ Cart Management ============
      initializeCart: async (initialData) => {
        console.log('[DecoupledStore] Initializing cart with data:', initialData);
        set({ isLoading: true, error: null });
        
        try {
          // CRITICAL FIX: Always trust server as source of truth for bookings
          // Server filters expired/confirmed bookings correctly
          let bookingItems: CartBookingItem[] = [];
          
          // CRITICAL: If we have server data, ALWAYS trust it over localStorage
          if (initialData) {
            // CRITICAL FIX: Bookings are localStorage-only, NEVER stored on server
          // Server will NEVER have a bookings field in cart response
          // ALWAYS load from localStorage and filter expired ones
          if (initialData.bookings && Array.isArray(initialData.bookings) && initialData.bookings.length > 0) {
            // This branch should NEVER execute (server doesn't store bookings)
            // But keep it for backwards compatibility if we ever add server-side bookings
            bookingItems = initialData.bookings.map((b: any) => ({
              id: b.reservation_id,
              reservation_id: b.reservation_id,
              service_id: b.service_id,
              service_name: b.service_name,
              stylist_id: b.stylist_id,
              stylist_name: b.stylist_name,
              start_time: b.start_time,
              end_time: b.end_time,
              price: b.price_cents / 100,
              status: b.status,
              customer_name: b.customer_name,
              customer_phone: b.customer_phone,
              customer_email: b.customer_email,
              customer_notes: b.customer_notes,
              expires_at: b.expires_at
            }));
            console.log('[DecoupledStore] Loaded bookings from server:', bookingItems.length);
          } else {
            // Server has no bookings field (normal case) - load from localStorage
            // DO NOT clear localStorage - bookings are client-side only!
            console.log('[DecoupledStore] Loading bookings from localStorage (server does not store bookings)...');
            const persistedBookings = useBookingPersistStore.getState().loadBookings();
            const now = new Date();
            bookingItems = persistedBookings.filter(b => new Date(b.expires_at) >= now);
            console.log('[DecoupledStore] Loaded bookings from localStorage:', persistedBookings.length);
            console.log('[DecoupledStore] After expiry filter:', bookingItems.length);
            
            // Update localStorage if we filtered any expired bookings
            if (bookingItems.length !== persistedBookings.length) {
              console.log('[DecoupledStore] Updating localStorage after filtering expired bookings...');
              useBookingPersistStore.getState().saveBookings(bookingItems);
            }
          }
          } else {
            // CRITICAL FIX: Only use localStorage if we haven't fetched from server yet
            // This handles the initial load case, not post-checkout case
            const persistedBookings = useBookingPersistStore.getState().loadBookings();
            
            // But still verify they're not expired
            const now = new Date();
            bookingItems = persistedBookings.filter(b => new Date(b.expires_at) >= now);
            
            console.log('[DecoupledStore] Loaded persisted bookings from localStorage:', persistedBookings.length);
            console.log('[DecoupledStore] After expiry filter:', bookingItems.length);
            
            // If we filtered any out, update localStorage
            if (bookingItems.length !== persistedBookings.length) {
              console.log('[DecoupledStore] Updating localStorage with filtered bookings...');
              useBookingPersistStore.getState().saveBookings(bookingItems);
            }
          }
          
          // Set bookings (will be cleaned up by cleanup function if expired)
          const bookingTotal = bookingItems.reduce((sum, b) => sum + b.price, 0);
          set({
            bookingItems,
            bookingTotal,
            bookingCount: bookingItems.length
          });
          
          // Then handle products from server
          if (initialData) {
            // RESTORATION: Accept both cart_items and items for compatibility
            const apiItems = initialData.cart_items || initialData.items || [];
            const productItems = transformApiItemsToProducts(apiItems);
            
            set({
              cartId: initialData.id,
              productItems,
              productTotal: calculateProductTotal(productItems),
              productCount: productItems.reduce((sum, item) => sum + item.quantity, 0),
              isGuest: !initialData.user_id,
              isLoading: false
            });
          } else {
            // Fetch from API
            const response = await cartAPI.getCart();
            
            if (response.success && response.cart) {
              // RESTORATION: Accept both cart_items and items for compatibility
              const apiItems = response.cart.cart_items || response.cart.items || [];
              const productItems = transformApiItemsToProducts(apiItems);
              
              set({
                cartId: response.cart.id,
                productItems,
                productTotal: calculateProductTotal(productItems),
                productCount: productItems.reduce((sum, item) => sum + item.quantity, 0),
                isGuest: !response.cart.user_id,
                isLoading: false
              });
            } else {
              set({ isLoading: false, isGuest: true });
            }
          }
          
          get().updateGrandTotals();
        } catch (error) {
          console.error('[DecoupledStore] Failed to initialize cart:', error);
          set({ 
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize cart',
            lastError: error instanceof Error ? error : null
          });
        }
      },
      
      clearCart: async () => {
        console.log('[DecoupledStore] Clearing cart');
        
        try {
          // Clear products from server
          const response = await cartAPI.clearCart();
          
          if (response.success) {
            // Clear products
            set({
              productItems: [],
              productTotal: 0,
              productCount: 0,
              error: null
            });
          }
          
          // Always clear bookings locally
          set({
            bookingItems: [],
            bookingTotal: 0,
            bookingCount: 0,
            grandTotal: 0,
            totalItems: 0
          });
          
          // Clear persisted bookings
          useBookingPersistStore.getState().saveBookings([]);
          
        } catch (error) {
          console.error('[DecoupledStore] Failed to clear cart:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to clear cart',
            lastError: error instanceof Error ? error : null
          });
        }
      },
      
      syncWithServer: async () => {
        console.log('[DecoupledStore] Syncing with server');
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await cartAPI.getCart();
          
          if (response.success && response.cart) {
            const productItems = transformApiItemsToProducts(response.cart.cart_items || response.cart.items || []);
            
            // CRITICAL: Also sync bookings from server
            const bookingItems: CartBookingItem[] = (response.cart.bookings || []).map((b: any) => ({
              id: b.id,
              reservation_id: b.id,
              service_id: b.service_id,
              service_name: b.service_name,
              stylist_id: b.stylist_user_id,
              stylist_name: b.stylist_name,
              start_time: b.start_time,
              end_time: b.end_time,
              price: b.price_cents / 100,
              customer_name: b.customer_name,
              customer_phone: b.customer_phone,
              customer_email: b.customer_email,
              customer_notes: b.customer_notes,
              expires_at: b.expires_at
            }));
            
            console.log('[DecoupledStore] Synced bookings from server:', bookingItems.length);
            
            // Update persist store with server data
            useBookingPersistStore.getState().saveBookings(bookingItems);
            
            set({
              cartId: response.cart.id,
              productItems,
              bookingItems,
              productTotal: calculateProductTotal(productItems),
              bookingTotal: bookingItems.reduce((sum, b) => sum + b.price, 0),
              productCount: productItems.reduce((sum, item) => sum + item.quantity, 0),
              bookingCount: bookingItems.length,
              isGuest: !response.cart.user_id,
              isLoading: false
            });
            
            get().updateGrandTotals();
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to sync:', error);
          set({ 
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to sync with server',
            lastError: error instanceof Error ? error : null
          });
        }
      },
      
      mergeCartAfterLogin: async () => {
        console.log('[DecoupledStore] Merging cart after login');
        
        set({ isLoading: true, error: null });
        
        try {
          // Note: mergeCart might not exist in cartAPI
          // For now, just sync with server
          const response = await cartAPI.getCart();
          
          if (response.success && response.cart) {
            const productItems = transformApiItemsToProducts(response.cart.cart_items || response.cart.items || []);
            
            set({
              cartId: response.cart.id,
              productItems,
              productTotal: calculateProductTotal(productItems),
              productCount: productItems.reduce((sum, item) => sum + item.quantity, 0),
              isGuest: false,
              isLoading: false
            });
            
            get().updateGrandTotals();
          } else {
            set({ isLoading: false, isGuest: false });
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to merge cart:', error);
          set({ 
            isLoading: false,
            isGuest: false,
            error: error instanceof Error ? error.message : 'Failed to merge cart',
            lastError: error instanceof Error ? error : null
          });
        }
      },
      
      // ============ Utility Actions ============
      clearError: () => set({ error: null, lastError: null }),
      
      setError: (error) => set({ 
        error: error instanceof Error ? error.message : error,
        lastError: error instanceof Error ? error : null
      }),
      
      updateGrandTotals: () => {
        const state = get();
        set({
          grandTotal: state.productTotal + state.bookingTotal,
          totalItems: state.productCount + state.bookingCount
        });
      },
      
      cleanupExpiredBookings: () => {
        console.log('[DecoupledStore] Checking for expired/orphaned bookings...');
        const now = new Date();
        const currentBookings = get().bookingItems;
        
        if (currentBookings.length === 0) {
          console.log('[DecoupledStore] No bookings to clean up');
          return;
        }
        
        const expiredBookings = currentBookings.filter(booking => {
          const expiresAt = new Date(booking.expires_at);
          return expiresAt < now;
        });
        
        if (expiredBookings.length > 0) {
          console.log(`[DecoupledStore] Found ${expiredBookings.length} expired bookings, removing...`);
          const validBookings = currentBookings.filter(booking => {
            const expiresAt = new Date(booking.expires_at);
            return expiresAt >= now;
          });
          
          const newTotal = validBookings.reduce((sum, b) => sum + b.price, 0);
          
          set({
            bookingItems: validBookings,
            bookingTotal: newTotal,
            bookingCount: validBookings.length
          });
          
          // Update persist store
          useBookingPersistStore.getState().saveBookings(validBookings);
          
          get().updateGrandTotals();
          
          console.log(`[DecoupledStore] Cleanup complete: ${validBookings.length} valid bookings remain`);
        } else {
          console.log('[DecoupledStore] All bookings are valid (not expired)');
        }
      },
      
      // ============ Computed Getters ============
      getProductById: (itemId) => get().productItems.find(item => item.id === itemId),
      
      getBookingById: (reservationId) => get().bookingItems.find(b => b.reservation_id === reservationId),
      
      hasProducts: () => get().productItems.length > 0,
      
      hasBookings: () => get().bookingItems.length > 0,
      
      isEmpty: () => get().productItems.length === 0 && get().bookingItems.length === 0
    }))
  )
);

// ============ Helper Functions ============

function transformApiItemsToProducts(apiItems: any[]): CartProductItem[] {
  return apiItems.map(item => {
    // Parse variant from SKU using the correct field name (variant_sku)
    const sku = item.variant_sku || item.sku || '';
    let variantName = '';
    
    // Old SKU-based parsing (fallback)
    if (sku && sku.includes('-')) {
      const parts = sku.split('-');
      if (parts.length >= 3) {
        const size = parts[1]?.toUpperCase();
        const colorCode = parts[2];
        const colorMap: Record<string, string> = {
          'BL': 'Black',
          'GR': 'Gray', 
          'NV': 'Navy Blue',
          'WH': 'White',
          'RD': 'Red',
          'BLU': 'Blue',
          'GRN': 'Green'
        };
        const color = colorMap[colorCode] || colorCode;
        variantName = `${size} / ${color}`;
      }
    }
    
    // ⭐ NEW: Extract structured variant attributes from API
    const variantAttrs = item.variant_attributes || [];
    const sizeAttr = variantAttrs.find((a: any) => a.name === 'Size' || a.name === 'size');
    const colorAttr = variantAttrs.find((a: any) => a.name === 'Color' || a.name === 'color');
    
    // Build display name from attributes if available
    if (sizeAttr || colorAttr) {
      const parts = [];
      if (sizeAttr?.value) parts.push(sizeAttr.value);
      if (colorAttr?.value) parts.push(colorAttr.value);
      if (parts.length > 0) variantName = parts.join(' / ');
    }
    
    const price = parseFloat(item.price_snapshot || item.current_price || item.price || '0');
    
    return {
      id: item.id,
      variant_id: item.variant_id,
      product_id: item.product?.id || '',
      product_name: item.product_name || item.product?.name || 'Product',
      variant_name: variantName,
      variant_data: {  // ⭐ NEW: Structured variant data for UI
        size: sizeAttr?.value,
        color: colorAttr?.value,
        colorHex: colorAttr?.color_hex  // ⭐ FIXED: Use color_hex from API
      },
      sku: sku,
      price: price,
      quantity: item.quantity || 1,
      image_url: item.product_image,  // ⭐ FIXED: Use product_image from API
      subtotal: price * (item.quantity || 1)
    };
  });
}

function calculateProductTotal(items: CartProductItem[]): number {
  return items.reduce((total, item) => total + item.subtotal, 0);
}

// ============ Public API ============
export default useDecoupledCartStore;
