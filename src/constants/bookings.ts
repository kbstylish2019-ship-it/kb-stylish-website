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

// Light-first with explicit dark: pairs. These badges render inside the stylist
// dashboard, which is light. The previous values used `-400` text on `bg-*-500/20`
// -- neither shade appears in the globals.css override list, so five of the six
// states rendered at roughly 1.5:1 and were unreadable. Only CANCELLED worked,
// because `text-red-400` happens to be one of the patched classes.
export const STATUS_COLORS = {
  [BOOKING_STATUS.PENDING]: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30',
  [BOOKING_STATUS.CONFIRMED]: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30',
  [BOOKING_STATUS.IN_PROGRESS]: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  [BOOKING_STATUS.COMPLETED]: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
  [BOOKING_STATUS.CANCELLED]: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
  [BOOKING_STATUS.NO_SHOW]: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30'
} as const;
