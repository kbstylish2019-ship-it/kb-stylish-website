/**
 * Client-side booking API functions
 * These functions are safe to use in client components
 */

import type { AvailableSlot, BookingParams, BookingResponse } from '@/lib/apiClient';

// New types for booking reservations
export interface BookingReservationParams {
  stylistId: string;
  serviceId: string;
  startTime: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
}

export interface BookingReservationResponse {
  success: boolean;
  reservation_id?: string;
  service_name?: string;
  stylist_name?: string;
  start_time?: string;
  end_time?: string;
  price_cents?: number;
  expires_at?: string;
  error?: string;
  code?: string;
}

export interface UpdateBookingReservationParams {
  reservationId: string;
  serviceId?: string;
  startTime?: string;
}

/**
 * Fetch available time slots for a stylist and service
 * Calls the API route instead of directly accessing the database
 */
export async function fetchAvailableSlots(params: {
  stylistId: string;
  serviceId: string;
  targetDate: string;
  customerTimezone?: string;
}): Promise<AvailableSlot[]> {
  try {
    const queryParams = new URLSearchParams({
      stylistId: params.stylistId,
      serviceId: params.serviceId,
      targetDate: params.targetDate,
      customerTimezone: params.customerTimezone || 'Asia/Kathmandu'
    });

    const response = await fetch(`/api/bookings/available-slots?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch slots:', response.statusText);
      return [];
    }

    const slots = await response.json();
    return slots;
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return [];
  }
}

/**
 * Create a new booking
 * Calls the API route instead of directly accessing the database
 */
/**
 * Create a temporary booking reservation (not added to cart)
 * This is part of THE GREAT DECOUPLING - bookings are separate from products
 */
export async function createBookingReservation(params: BookingReservationParams): Promise<BookingReservationResponse> {
  try {
    const response = await fetch('/api/bookings/create-reservation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Failed to create reservation: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to create booking reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create reservation',
      code: 'NETWORK_ERROR'
    };
  }
}

/**
 * Update an existing booking reservation
 * This allows users to change their appointment time/service
 */
export async function updateBookingReservation(params: UpdateBookingReservationParams): Promise<BookingReservationResponse> {
  try {
    const response = await fetch('/api/bookings/update-reservation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Failed to update reservation: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to update booking reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update reservation',
      code: 'NETWORK_ERROR'
    };
  }
}

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use createBookingReservation instead
 */
export async function createBooking(params: BookingParams): Promise<BookingResponse> {
  try {
    const response = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to create booking',
        code: data.code || 'UNKNOWN_ERROR'
      };
    }

    return data;
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: 'Network error occurred',
      code: 'NETWORK_ERROR'
    };
  }
}
