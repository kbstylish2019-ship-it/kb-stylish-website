// ============================================================================
// EMAIL TYPES
// Purpose: TypeScript types for email system
// ============================================================================

export type EmailType =
  // P0 - Critical (Order & Booking)
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'booking_confirmation'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'vendor_new_order'
  
  // P1 - Important
  | 'order_processing'
  | 'order_cancelled'
  | 'booking_reminder'
  | 'vendor_application_received'
  | 'admin_new_vendor_application'
  | 'vendor_payout_processed'
  
  // P2 - Nice to Have
  | 'welcome'
  | 'review_request'
  | 'low_stock_alert'
  | 'vendor_weekly_report'
  | 'admin_weekly_report';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;  // Plain text version for accessibility
}

export interface EmailRequest {
  email_type: EmailType;
  recipient_email: string;
  recipient_user_id?: string;
  recipient_name?: string;
  template_data: Record<string, any>;
  reference_id?: string;  // For idempotency (order_id, booking_id, etc.)
  reference_type?: string;  // 'order', 'booking', 'vendor_application'
}

export interface EmailResponse {
  success: boolean;
  resend_email_id?: string;
  message?: string;
  error?: string;
  skipped?: boolean;
  mode?: 'production' | 'development' | 'disabled';
}

export interface OrderConfirmationData {
  customerName: string;
  orderNumber: string;
  orderDate: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    image_url?: string;
  }>;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  shippingAddress: string;
  trackingUrl?: string;
}

export interface OrderShippedData {
  customerName: string;
  orderNumber: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  estimatedDelivery?: string;
  trackingUrl?: string;
}

export interface BookingConfirmationData {
  customerName: string;
  serviceName: string;
  stylistName: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: string;
  price: number;
  location?: string;
  notes?: string;
}

export interface VendorApprovedData {
  vendorName: string;
  businessName: string;
  dashboardUrl?: string;
}

export interface VendorRejectedData {
  vendorName: string;
  businessName: string;
  reason?: string;
  canReapply: boolean;
}

export interface VendorNewOrderData {
  vendorName: string;
  orderNumber: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  shippingAddress: string;
  dashboardUrl?: string;
}

// ============================================================================
// P1 EMAIL DATA INTERFACES
// ============================================================================

export interface BookingReminderData {
  customerName: string;
  stylistName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: string;
  location?: string;
  salonAddress?: string;
  stylistPhone?: string;
  preparationTips?: string;
  rescheduleUrl?: string;
  addToCalendarUrl?: string;
  viewDetailsUrl?: string;
}

export interface OrderCancelledData {
  customerName: string;
  orderNumber: string;
  cancelledDate: string;
  cancelledTime: string;
  reason?: string;
  refundAmount?: number;
  refundETA?: string;
  refundMethod?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  supportEmail?: string;
}

export interface ReviewRequestData {
  customerName: string;
  orderNumber: string;
  deliveredDate: string;
  items: Array<{
    product_id: string;
    name: string;
    image_url?: string;
    review_url: string;
  }>;
  incentiveMessage?: string;
  preferencesUrl?: string;
}

export interface VendorNewOrderAlertData {
  vendorName: string;
  orderNumber: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalEarnings: number;
  commissionRate: number;
  shippingCity: string;
  shippingState: string;
  shipByDate: string;
  dashboardUrl: string;
  printLabelUrl?: string;
}
