import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, CartProductItem, CartBookingItem, Booking } from "@/lib/types";

interface CartState {
  items: CartItem[];
  
  // Selectors
  getItemCount: () => number;
  getProductCount: () => number;
  getBookingCount: () => number;
  getProductSubtotal: () => number;
  getServiceSubtotal: () => number;
  getTotal: () => number;
  findProductItem: (productId: string, variant?: string) => CartProductItem | undefined;
  findBookingItem: (bookingId: string) => CartBookingItem | undefined;
  
  // Actions
  addProduct: (product: {
    id: string;
    name: string;
    variant?: string;
    imageUrl?: string;
    price: number;
    quantity?: number;
  }) => void;
  
  addBooking: (booking: Booking) => void;
  
  updateProductQuantity: (productId: string, quantity: number, variant?: string) => void;
  
  removeItem: (itemId: string, variant?: string) => void;
  
  clearCart: () => void;
  
  // Utility actions
  incrementProductQuantity: (productId: string, variant?: string) => void;
  decrementProductQuantity: (productId: string, variant?: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      // Selectors
      getItemCount: () => {
        const items = get().items;
        return items.reduce((count, item) => {
          if (item.type === "product") {
            return count + item.quantity;
          }
          return count + 1; // Bookings count as 1
        }, 0);
      },
      
      getProductCount: () => {
        const items = get().items;
        return items
          .filter((item): item is CartProductItem => item.type === "product")
          .reduce((count, item) => count + item.quantity, 0);
      },
      
      getBookingCount: () => {
        const items = get().items;
        return items.filter((item) => item.type === "booking").length;
      },
      
      getProductSubtotal: () => {
        const items = get().items;
        return items
          .filter((item): item is CartProductItem => item.type === "product")
          .reduce((total, item) => total + item.price * item.quantity, 0);
      },
      
      getServiceSubtotal: () => {
        const items = get().items;
        return items
          .filter((item): item is CartBookingItem => item.type === "booking")
          .reduce((total, item) => total + item.booking.price, 0);
      },
      
      getTotal: () => {
        return get().getProductSubtotal() + get().getServiceSubtotal();
      },
      
      findProductItem: (productId: string, variant?: string) => {
        const items = get().items;
        return items.find(
          (item): item is CartProductItem =>
            item.type === "product" && 
            item.id === productId && 
            item.variant === variant
        );
      },
      
      findBookingItem: (bookingId: string) => {
        const items = get().items;
        const found = items.find(
          (item): item is CartBookingItem =>
            item.type === "booking" && item.booking.id === bookingId
        );
        return found;
      },
      
      // Actions
      addProduct: (product) => {
        set((state) => {
          const existingItem = state.findProductItem(product.id, product.variant);
          
          if (existingItem) {
            // Update quantity if item already exists
            return {
              items: state.items.map((item) =>
                item.type === "product" && 
                item.id === product.id && 
                item.variant === product.variant
                  ? { ...item, quantity: item.quantity + (product.quantity || 1) }
                  : item
              ),
            };
          }
          
          // Add new product item
          const newItem: CartProductItem = {
            type: "product",
            id: product.id,
            name: product.name,
            variant: product.variant,
            imageUrl: product.imageUrl,
            price: product.price,
            quantity: product.quantity || 1,
          };
          
          return { items: [...state.items, newItem] };
        });
      },
      
      addBooking: (booking) => {
        set((state) => {
          // Check if booking already exists
          const existingBooking = state.findBookingItem(booking.id);
          if (existingBooking) {
            return state; // Don't add duplicate bookings
          }
          
          const newItem: CartBookingItem = {
            type: "booking",
            booking,
          };
          
          return { items: [...state.items, newItem] };
        });
      },
      
      updateProductQuantity: (productId, quantity, variant) => {
        if (quantity <= 0) {
          get().removeItem(productId, variant);
          return;
        }
        
        set((state) => ({
          items: state.items.map((item) =>
            item.type === "product" && 
            item.id === productId && 
            item.variant === variant
              ? { ...item, quantity }
              : item
          ),
        }));
      },
      
      removeItem: (itemId, variant) => {
        set((state) => ({
          items: state.items.filter((item) => {
            if (item.type === "product") {
              return !(item.id === itemId && item.variant === variant);
            }
            if (item.type === "booking") {
              return item.booking.id !== itemId;
            }
            return true;
          }),
        }));
      },
      
      clearCart: () => {
        set({ items: [] });
      },
      
      incrementProductQuantity: (productId, variant) => {
        const item = get().findProductItem(productId, variant);
        if (item) {
          get().updateProductQuantity(productId, item.quantity + 1, variant);
        }
      },
      
      decrementProductQuantity: (productId, variant) => {
        const item = get().findProductItem(productId, variant);
        if (item && item.quantity > 1) {
          get().updateProductQuantity(productId, item.quantity - 1, variant);
        }
      },
    }),
    {
      name: "kb-stylish-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }), // Only persist items
    }
  )
);
