'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartBookingItem } from './decoupledCartStore';

/**
 * Booking Persistence Store
 * 
 * This store ONLY handles local persistence of booking reservations.
 * Bookings don't go through the cart API - they're stored locally
 * until checkout when they're converted to actual bookings.
 * 
 * This separation ensures:
 * - Products always come from server (single source of truth)
 * - Bookings persist locally (with TTL management)
 * - No conflict between server and client state
 */

interface BookingPersistState {
  bookingItems: CartBookingItem[];
  
  // Actions
  loadBookings: () => CartBookingItem[];
  saveBookings: (bookings: CartBookingItem[]) => void;
  clearExpiredBookings: () => CartBookingItem[];
}

export const useBookingPersistStore = create<BookingPersistState>()(
  persist(
    (set, get) => ({
      bookingItems: [],
      
      loadBookings: () => {
        // Clean expired bookings on load
        const cleaned = get().clearExpiredBookings();
        return cleaned;
      },
      
      saveBookings: (bookings) => {
        set({ bookingItems: bookings });
      },
      
      clearExpiredBookings: () => {
        const now = new Date();
        const validBookings = get().bookingItems.filter(booking => {
          const expiresAt = new Date(booking.expires_at);
          return expiresAt >= now;
        });
        
        if (validBookings.length !== get().bookingItems.length) {
          set({ bookingItems: validBookings });
        }
        
        return validBookings;
      }
    }),
    {
      name: 'kb-stylish-bookings',
      // Only persist bookings, not UI state
      partialize: (state) => ({
        bookingItems: state.bookingItems
      })
    }
  )
);
