import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { cartAPI, type CartItem as APICartItem, type CartResponse } from '@/lib/api/cartClient';

/**
 * Production-Grade Cart Store - Integration Blueprint v1.0
 * 
 * Architecture:
 * - Client-side cache of server state
 * - Optimistic updates with server reconciliation
 * - Loading states for async operations
 * - Snapshot-based rollback mechanism
 * - Type-safe with full TypeScript support
 */

// Re-export CartItem from API for consistency
export type CartItem = APICartItem;

/**
 * Product details for optimistic updates
 */
interface ProductDetails {
  name: string;
  slug: string;
  price: number;
  sku: string;
  image?: string;
}

/**
 * Complete cart state interface
 */
interface CartState {
  // ============ State ============
  cartId: string | null;
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  
  // ============ UI State ============
  isLoading: boolean;
  isGuest: boolean;
  isAddingItem: boolean;
  isUpdatingItem: Record<string, boolean>;
  isRemovingItem: Record<string, boolean>;
  error: string | null;
  lastError: Error | null;
  
  // ============ Snapshot for Rollback ============
  snapshot: Partial<CartState> | null;
  
  // ============ Core Actions ============
  initializeCart: (serverCart?: any) => Promise<void>;
  fetchCart: () => Promise<void>;
  addItem: (variantId: string, quantity?: number, productDetails?: ProductDetails) => Promise<boolean>;
  updateItem: (itemId: string, quantity: number) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  
  // ============ Legacy Actions (for backward compatibility) ============
  addProduct: (product: {
    id: string;
    name: string;
    variant?: string;
    variantId?: string;
    variantData?: any;
    imageUrl?: string;
    price: number;
    quantity?: number;
    sku?: string;
  }) => void;
  
  // ============ Optimistic Update Helpers ============
  optimisticAdd: (variantId: string, quantity: number, productDetails?: ProductDetails) => void;
  optimisticUpdate: (itemId: string, quantity: number) => void;
  optimisticRemove: (itemId: string) => void;
  rollbackOptimistic: () => void;
  
  // ============ Utility Functions ============
  getItemByVariant: (variantId: string) => CartItem | undefined;
  getItemById: (itemId: string) => CartItem | undefined;
  getTotalQuantity: () => number;
  getItemCount: () => number; // Legacy alias for getTotalQuantity
  clearError: () => void;
  reset: () => void;
}

/**
 * Create the cart store with Zustand
 * Implements optimistic updates and server synchronization
 */
export const useCartStore = create<CartState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ============ Initial State ============
      cartId: null,
      items: [],
      totalItems: 0,
      totalAmount: 0,
      isGuest: true,
      
      // ============ Loading States ============
      isLoading: false,
      isAddingItem: false,
      isUpdatingItem: {},
      isRemovingItem: {},
      
      // ============ Error State ============
      error: null,
      lastError: null,
      
      // ============ Snapshot ============
      snapshot: null,
      
      // ============ Core Actions ============
      
      /**
       * Initialize cart from server response or fetch if needed
       */
      initializeCart: async (serverCart) => {
        if (serverCart) {
          // Initialize from provided server data
          set({
            cartId: serverCart.id,
            items: serverCart.items || [],
            totalItems: serverCart.total_items || 0,
            totalAmount: serverCart.total_amount || 0,
            isGuest: !serverCart.user_id,
            isLoading: false,
            error: null,
          });
        } else {
          // Fetch from server
          await get().fetchCart();
        }
      },

      /**
       * Fetch cart from server
       */
      fetchCart: async () => {
        set({ isLoading: true, error: null });
        
        const response = await cartAPI.getCart();
        
        if (response.success && response.cart) {
          // Handle Edge Function field name differences
          const items = response.cart.cart_items || response.cart.items || [];
          const totalItems = response.cart.item_count ?? response.cart.total_items ?? 0;
          const totalAmount = response.cart.subtotal ?? response.cart.total_amount ?? 0;
          
          set({
            cartId: response.cart.id,
            items,
            totalItems,
            totalAmount,
            isGuest: !response.cart.user_id,
            isLoading: false,
          });
        } else {
          set({
            isLoading: false,
            error: response.error || 'Failed to load cart',
          });
        }
      },

      /**
       * Add item to cart with optimistic update
       */
      addItem: async (variantId, quantity = 1, productDetails) => {
        console.log('[Store] addItem called with:', { variantId, quantity, productDetails });
        const { items, snapshot } = get();
        
        // Check if item already exists
        const existingItem = items.find(item => item.variant_id === variantId);
        if (existingItem) {
          console.log('[Store] Item already exists, updating quantity');
          // Update quantity instead
          return get().updateItem(existingItem.id, existingItem.quantity + quantity);
        }
        
        // Set loading state
        set({ isAddingItem: true, error: null });
        
        // Apply optimistic update
        get().optimisticAdd(variantId, quantity, productDetails);
        
        try {
          // Call API
          console.log('[Store] Calling cartAPI.addToCart');
          const response = await cartAPI.addToCart(variantId, quantity);
        
          if (response.success && response.cart) {
            // Handle Edge Function field name differences consistently
            const items = response.cart.cart_items || response.cart.items || [];
            const totalItems = response.cart.item_count ?? response.cart.total_items ?? items.reduce((sum, item) => sum + item.quantity, 0);
            const totalAmount = response.cart.subtotal ?? response.cart.total_amount ?? 0;
            
            set({
              cartId: response.cart.id,
              items,
              totalItems,
              totalAmount,
              isGuest: !response.cart.user_id,
              isAddingItem: false,
              snapshot: null,
            });
            console.log('[Store] Cart updated with items:', items);
            return true;
          } else {
            // Rollback on error
            get().rollbackOptimistic();
            set({
              isAddingItem: false,
              error: response.error || 'Failed to add item',
            });
            return false;
          }
        } catch (error) {
          console.error('[Store] Error adding item:', error);
          // Rollback on error
          get().rollbackOptimistic();
          set({
            isAddingItem: false,
            error: error instanceof Error ? error.message : 'Failed to add item',
            lastError: error instanceof Error ? error : null,
          });
          return false;
        }
      },

      /**
       * Update item quantity with optimistic update
       */
      updateItem: async (itemId, quantity) => {
        const state = get();
        
        // Set loading state
        set({ isUpdatingItem: { ...state.isUpdatingItem, [itemId]: true }, error: null });
        
        // Apply optimistic update (which handles snapshot internally)
        get().optimisticUpdate(itemId, quantity);
        
        // Call API
        const response = await cartAPI.updateCartItem(itemId, quantity);
        
        if (response.success && response.cart) {
          // Handle Edge Function field name differences
          const items = response.cart.cart_items || response.cart.items || [];
          const totalItems = response.cart.item_count ?? response.cart.total_items ?? 0;
          const totalAmount = response.cart.subtotal ?? response.cart.total_amount ?? 0;
          
          set({
            items,
            totalItems,
            totalAmount,
            isUpdatingItem: { ...state.isUpdatingItem, [itemId]: false },
            snapshot: null,
          });
          return true;
        } else {
          // Rollback on error
          state.rollbackOptimistic();
          set({
            isUpdatingItem: { ...state.isUpdatingItem, [itemId]: false },
            error: response.error || 'Failed to update item',
          });
          return false;
        }
      },

      /**
       * Remove item from cart with optimistic update
       */
      removeItem: async (itemId) => {
        const state = get();
        
        // Set loading state
        set({
          isRemovingItem: { ...state.isRemovingItem, [itemId]: true },
        });
        
        // Optimistic update (which handles snapshot internally)
        state.optimisticRemove(itemId);
        
        // Call API
        const response = await cartAPI.removeFromCart(itemId);
        
        if (response.success && response.cart) {
          // Handle Edge Function field name differences
          const items = response.cart.cart_items || response.cart.items || [];
          const totalItems = response.cart.item_count ?? response.cart.total_items ?? 0;
          const totalAmount = response.cart.subtotal ?? response.cart.total_amount ?? 0;
          
          set({
            items,
            totalItems,
            totalAmount,
            isRemovingItem: { ...state.isRemovingItem, [itemId]: false },
            snapshot: null,
          });
          return true;
        } else {
          // Rollback on error
          state.rollbackOptimistic();
          set({
            isRemovingItem: { ...state.isRemovingItem, [itemId]: false },
            error: response.error || 'Failed to remove item',
          });
          return false;
        }
      },

      /**
       * Clear entire cart
       */
      clearCart: async () => {
        set({ isLoading: true });
        
        const response = await cartAPI.clearCart();
        
        if (response.success) {
          set({
            items: [],
            totalItems: 0,
            totalAmount: 0,
            isLoading: false,
          });
          return true;
        } else {
          set({
            isLoading: false,
            error: response.error || 'Failed to clear cart',
          });
          return false;
        }
      },


      // ============ Optimistic Update Helpers ============
      
      /**
       * Optimistic update: Add item
       */
      optimisticAdd: (variantId, quantity, productDetails) => {
        const state = get();
        const currentItems = state.items;
        const existingItem = currentItems.find(item => item.variant_id === variantId);
        
        // Store snapshot before optimistic update
        set({ snapshot: {
          items: currentItems,
          totalItems: state.totalItems,
          totalAmount: state.totalAmount,
        }});
        
        if (existingItem) {
          // Update existing item
          set({
            items: currentItems.map(item =>
              item.variant_id === variantId
                ? { ...item, quantity: item.quantity + quantity }
                : item
            ),
            totalItems: state.totalItems + quantity,
            totalAmount: state.totalAmount + (existingItem.price_snapshot * quantity),
          });
        } else if (productDetails) {
          // Add new item with temporary data
          const tempItem: CartItem = {
            id: `temp_${Date.now()}`,
            cart_id: state.cartId || 'temp',
            variant_id: variantId,
            quantity,
            price_snapshot: productDetails.price || 0,
            added_at: new Date().toISOString(),
            product_name: productDetails.name || 'Loading...',
            product_slug: productDetails.slug || '',
            variant_sku: productDetails.sku || '',
            product_image: productDetails.image,
          };
          
          set({
            items: [...currentItems, tempItem],
            totalItems: state.totalItems + quantity,
            totalAmount: state.totalAmount + (tempItem.price_snapshot * quantity),
          });
        }
      },

      /**
       * Optimistic update: Update quantity
       */
      optimisticUpdate: (itemId, quantity) => {
        const state = get();
        const currentItems = state.items;
        const item = currentItems.find(i => i.id === itemId);
        
        if (item) {
          const quantityDiff = quantity - item.quantity;
          
          // Store snapshot before optimistic update
          set({ snapshot: {
            items: currentItems,
            totalItems: state.totalItems,
            totalAmount: state.totalAmount,
          }});
          
          set({
            items: currentItems.map(i =>
              i.id === itemId ? { ...i, quantity } : i
            ),
            totalItems: get().totalItems + quantityDiff,
            totalAmount: get().totalAmount + (item.price_snapshot * quantityDiff),
          });
        }
      },

      /**
       * Optimistic update: Remove item
       */
      optimisticRemove: (itemId) => {
        const state = get();
        const currentItems = state.items;
        const item = currentItems.find(i => i.id === itemId);
        
        if (item) {
          // Store snapshot before optimistic update
          set({ snapshot: {
            items: currentItems,
            totalItems: state.totalItems,
            totalAmount: state.totalAmount,
          }});
          
          set({
            items: currentItems.filter(i => i.id !== itemId),
            totalItems: state.totalItems - item.quantity,
            totalAmount: state.totalAmount - (item.price_snapshot * item.quantity),
          });
        }
      },

      /**
       * Rollback to snapshot after failed operation
       */
      rollbackOptimistic: () => {
        const snapshot = get().snapshot;
        if (snapshot) {
          set({
            items: snapshot.items,
            totalItems: snapshot.totalItems,
            totalAmount: snapshot.totalAmount,
            snapshot: null,
          });
        }
      },

      // ============ Utility Functions ============
      
      /**
       * Get item by variant ID
       */
      getItemByVariant: (variantId) => {
        return get().items.find(item => item.variant_id === variantId);
      },

      /**
       * Get item by cart item ID
       */
      getItemById: (itemId) => {
        return get().items.find(item => item.id === itemId);
      },

      /**
       * Get total quantity of all items
       */
      getTotalQuantity: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      /**
       * Get item count (legacy alias for getTotalQuantity)
       */
      getItemCount: () => {
        return get().getTotalQuantity();
      },

      /**
       * Clear error state
       */
      clearError: () => {
        set({ error: null, lastError: null });
      },

      /**
       * Reset store to initial state (used on logout)
       */
      reset: () => {
        // Clear all cart state
        set({
          cartId: null,
          items: [],
          totalItems: 0,
          totalAmount: 0,
          isGuest: true,
          isLoading: false,
          isAddingItem: false,
          isUpdatingItem: {},
          isRemovingItem: {},
          error: null,
          lastError: null,
          snapshot: null,
        });
        
        // Clear cached session and guest token
        cartAPI.clearSession();
        console.log('[CartStore] Reset cart state and cleared session');
      },

      // ============ Legacy Actions for Backward Compatibility ============
      
      /**
       * Legacy addProduct method for backward compatibility
       * Maps to the new addItem method
       */
      addProduct: (product) => {
        // Fire and forget - don't await
        const state = get();
        const variantId = product.variantId || product.id;
        const quantity = product.quantity || 1;
        const productDetails: ProductDetails = {
          name: product.name,
          slug: product.name.toLowerCase().replace(/\s+/g, '-'),
          price: product.price,
          sku: product.sku || '',
          image: product.imageUrl,
        };
        
        // Call addItem asynchronously but don't await
        state.addItem(variantId, quantity, productDetails).catch(error => {
          console.error('[Cart] Failed to add product:', error);
        });
      },
    })),
    {
      name: 'cart-store',
      // Remove persist for now - cart is server-managed
      // We can add selective persistence later if needed
    }
  )
);

/**
 * Legacy selectors for backward compatibility
 * These map to the new store structure
 */
export const useCartSelectors = () => {
  const store = useCartStore();
  
  return {
    getItemCount: () => store.getTotalQuantity(),
    getTotal: () => store.totalAmount,
    hasItems: () => store.items.length > 0,
    isProcessing: () => store.isLoading || store.isAddingItem,
  };
};
