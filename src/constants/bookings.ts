/**
 * Booking-related constants
 * Centralized configuration for the booking management system
 */

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
} as const;

export type BookingStatus = typeof BOOKING_STATUS[keyof typeof BOOKING_STATUS];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pending',
  [BOOKING_STATUS.CONFIRMED]: 'Confirmed',
  [BOOKING_STATUS.IN_PROGRESS]: 'In Progress',
  [BOOKING_STATUS.COMPLETED]: 'Completed',
  [BOOKING_STATUS.CANCELLED]: 'Cancelled',
  [BOOKING_STATUS.NO_SHOW]: 'No-Show'
};

export const FILTER_TYPES = {
  ALL: 'all',
  UPCOMING: 'upcoming',
  PAST: 'past',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export type FilterType = typeof FILTER_TYPES[keyof typeof FILTER_TYPES];

export const FILTER_LABELS: Record<FilterType, string> = {
  [FILTER_TYPES.ALL]: 'All Bookings',
  [FILTER_TYPES.UPCOMING]: 'Upcoming',
  [FILTER_TYPES.PAST]: 'Past',
  [FILTER_TYPES.COMPLETED]: 'Completed',
  [FILTER_TYPES.CANCELLED]: 'Cancelled'
};

export const SORT_OPTIONS = {
  DATE_DESC: 'date_desc',
  DATE_ASC: 'date_asc',
  CUSTOMER_NAME: 'customer_name',
  PRICE_DESC: 'price_desc',
  PRICE_ASC: 'price_asc',
  STATUS: 'status'
} as const;

export type SortOption = typeof SORT_OPTIONS[keyof typeof SORT_OPTIONS];

export const SORT_LABELS: Record<SortOption, string> = {
  [SORT_OPTIONS.DATE_DESC]: 'Newest First',
  [SORT_OPTIONS.DATE_ASC]: 'Oldest First',
  [SORT_OPTIONS.CUSTOMER_NAME]: 'Customer Name',
  [SORT_OPTIONS.PRICE_DESC]: 'Highest Price',
  [SORT_OPTIONS.PRICE_ASC]: 'Lowest Price',
  [SORT_OPTIONS.STATUS]: 'Status'
};

export const KEYBOARD_SHORTCUTS = {
  NEXT: 'j',
  PREVIOUS: 'k',
  OPEN: 'Enter',
  SEARCH: '/',
  COMPLETE: 'c',
  FILTERS: 'f',
  EXPORT: 'e',
  HELP: '?',
  ESCAPE: 'Escape'
} as const;

export const KEYBOARD_SHORTCUTS_HELP = [
  { key: 'j', description: 'Select next booking' },
  { key: 'k', description: 'Select previous booking' },
  { key: 'Enter', description: 'Open selected booking' },
  { key: '/', description: 'Focus search' },
  { key: 'c', description: 'Mark as completed' },
  { key: 'f', description: 'Toggle filters' },
  { key: 'e', description: 'Export bookings' },
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'Esc', description: 'Clear selection' }
];

export const DEBOUNCE_DELAY = {
  SEARCH: 300,
  FILTER: 100
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 1000
} as const;

export const STATUS_COLORS = {
  [BOOKING_STATUS.PENDING]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  [BOOKING_STATUS.CONFIRMED]: 'bg-green-500/20 text-green-400 border-green-500/30',
  [BOOKING_STATUS.IN_PROGRESS]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [BOOKING_STATUS.COMPLETED]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  [BOOKING_STATUS.CANCELLED]: 'bg-red-500/20 text-red-400 border-red-500/30',
  [BOOKING_STATUS.NO_SHOW]: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
} as const;
