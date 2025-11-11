// ============================================================================
// EMAIL TEMPLATES
// Purpose: Render HTML and plain text email templates
// Priority: P0 templates (critical for launch)
// ============================================================================

import {
  EmailType,
  EmailTemplate,
  OrderConfirmationData,
  OrderShippedData,
  BookingConfirmationData,
  VendorApprovedData,
  VendorRejectedData,
  VendorNewOrderData,
  BookingReminderData,
  OrderCancelledData,
  ReviewRequestData,
  VendorNewOrderAlertData,
} from './types.ts';
import {
  sanitizeEmailInput,
  formatCurrency,
  formatDate,
  wrapEmailTemplate,
} from './utils.ts';

/**
 * Main router function - renders email template based on type
 */
export async function renderEmailTemplate(
  type: EmailType,
  data: Record<string, any>,
  recipientUserId?: string
): Promise<EmailTemplate> {
  switch (type) {
    // P0 - Critical Templates
    case 'order_confirmation':
      return renderOrderConfirmation(data as OrderConfirmationData, recipientUserId);
    case 'order_shipped':
      return renderOrderShipped(data as OrderShippedData, recipientUserId);
    case 'booking_confirmation':
      return renderBookingConfirmation(data as BookingConfirmationData, recipientUserId);
    case 'vendor_approved':
      return renderVendorApproved(data as VendorApprovedData, recipientUserId);
    case 'vendor_rejected':
      return renderVendorRejected(data as VendorRejectedData, recipientUserId);
    case 'vendor_new_order':
      return renderVendorNewOrder(data as VendorNewOrderData, recipientUserId);
    
    // P1 - Important Templates
    case 'booking_reminder':
      return renderBookingReminder(data as BookingReminderData, recipientUserId);
    case 'order_cancelled':
      return renderOrderCancelled(data as OrderCancelledData, recipientUserId);
    case 'review_request':
      return renderReviewRequest(data as ReviewRequestData, recipientUserId);
    
    default:
      throw new Error(`Email template not implemented: ${type}`);
  }
}

// ============================================================================
// P0 TEMPLATE 1: ORDER CONFIRMATION
// ============================================================================

function renderOrderConfirmation(
  data: OrderConfirmationData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const orderNumber = sanitizeEmailInput(data.orderNumber);
  const orderDate = sanitizeEmailInput(data.orderDate);
  const shippingAddress = sanitizeEmailInput(data.shippingAddress);
  
  const htmlContent = `
    <h1>Order Confirmed! 🎉</h1>
    <p>Hi ${customerName},</p>
    <p>Thank you for your order! We're preparing your items for shipment.</p>
    
    <div class="details-box">
      <p class="label">Order Number</p>
      <p class="value">${orderNumber}</p>
      <p class="label">Order Date</p>
      <p class="value">${orderDate}</p>
    </div>
    
    <h2>Order Items</h2>
    ${data.items.map(item => `
      <div class="item">
        <p style="margin: 0; font-weight: 500;">${sanitizeEmailInput(item.name)}</p>
        <p style="margin: 4px 0 0 0; color: #666;">Qty: ${item.quantity} × ${formatCurrency(item.price)}</p>
      </div>
    `).join('')}
    
    <div class="total">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>Subtotal:</span>
        <span>${formatCurrency(data.subtotal)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>Shipping:</span>
        <span>${formatCurrency(data.shipping)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>Tax:</span>
        <span>${formatCurrency(data.tax)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: bold; margin-top: 12px;">
        <span>Total:</span>
        <span>${formatCurrency(data.total)}</span>
      </div>
    </div>
    
    <div style="margin-top: 24px;">
      <p class="label">Shipping Address</p>
      <p style="margin: 4px 0 0 0; white-space: pre-line;">${shippingAddress}</p>
    </div>
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="${data.trackingUrl || `https://kbstylish.com.np/orders/${orderNumber}`}" class="button">
        Track Your Order
      </a>
    </div>
    
    <p style="margin-top: 32px; text-align: center; color: #666; font-size: 14px;">
      Need help? Reply to this email or contact our support team.
    </p>
  `;
  
  const plainText = `
Hi ${customerName},

Thank you for your order! We're preparing your items for shipment.

ORDER DETAILS
-------------
Order Number: ${orderNumber}
Order Date: ${orderDate}

ITEMS
-----
${data.items.map(item => `
${sanitizeEmailInput(item.name)}
Qty: ${item.quantity} × ${formatCurrency(item.price)}
`).join('\n')}

TOTAL BREAKDOWN
---------------
Subtotal: ${formatCurrency(data.subtotal)}
Shipping: ${formatCurrency(data.shipping)}
Tax: ${formatCurrency(data.tax)}
-----------------------------------
Total: ${formatCurrency(data.total)}

SHIPPING ADDRESS
----------------
${shippingAddress}

Track your order: ${data.trackingUrl || `https://kbstylish.com.np/orders/${orderNumber}`}

Need help? Reply to this email or contact our support team.

---
© 2025 KB Stylish
Kathmandu, Nepal

Manage email preferences: https://kbstylish.com.np/account/email-preferences
  `.trim();
  
  return {
    subject: `Order Confirmed - #${orderNumber}`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P0 TEMPLATE 2: ORDER SHIPPED
// ============================================================================

function renderOrderShipped(
  data: OrderShippedData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const orderNumber = sanitizeEmailInput(data.orderNumber);
  const trackingNumber = data.trackingNumber ? sanitizeEmailInput(data.trackingNumber) : null;
  const shippingCarrier = data.shippingCarrier ? sanitizeEmailInput(data.shippingCarrier) : null;
  
  const htmlContent = `
    <h1>Your Order Has Been Shipped! 📦</h1>
    <p>Hi ${customerName},</p>
    <p>Great news! Your order <strong>#${orderNumber}</strong> has been shipped and is on its way to you.</p>
    
    ${trackingNumber ? `
    <div class="details-box">
      ${shippingCarrier ? `<p class="label">Carrier</p><p class="value">${shippingCarrier}</p>` : ''}
      <p class="label">Tracking Number</p>
      <p class="value" style="font-family: monospace; font-size: 18px;">${trackingNumber}</p>
      ${data.estimatedDelivery ? `<p class="label">Estimated Delivery</p><p class="value">${sanitizeEmailInput(data.estimatedDelivery)}</p>` : ''}
    </div>
    ` : ''}
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="${data.trackingUrl || `https://kbstylish.com.np/orders/${orderNumber}`}" class="button">
        ${trackingNumber ? 'Track Shipment' : 'View Order'}
      </a>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 14px;">
      You'll receive an email notification when your order is delivered.
    </p>
  `;
  
  const plainText = `
Hi ${customerName},

Great news! Your order #${orderNumber} has been shipped and is on its way to you.

${trackingNumber ? `
SHIPPING DETAILS
----------------
${shippingCarrier ? `Carrier: ${shippingCarrier}` : ''}
Tracking Number: ${trackingNumber}
${data.estimatedDelivery ? `Estimated Delivery: ${sanitizeEmailInput(data.estimatedDelivery)}` : ''}
` : ''}

Track your shipment: ${data.trackingUrl || `https://kbstylish.com.np/orders/${orderNumber}`}

You'll receive an email notification when your order is delivered.

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Order Shipped - #${orderNumber}`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P0 TEMPLATE 3: BOOKING CONFIRMATION
// ============================================================================

function renderBookingConfirmation(
  data: BookingConfirmationData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const serviceName = sanitizeEmailInput(data.serviceName);
  const stylistName = sanitizeEmailInput(data.stylistName);
  const appointmentDate = sanitizeEmailInput(data.appointmentDate);
  const appointmentTime = sanitizeEmailInput(data.appointmentTime);
  const duration = sanitizeEmailInput(data.duration);
  
  const htmlContent = `
    <h1>Booking Confirmed! ✨</h1>
    <p>Hi ${customerName},</p>
    <p>Your styling appointment has been confirmed!</p>
    
    <div class="details-box">
      <p class="label">Service</p>
      <p class="value">${serviceName}</p>
      
      <p class="label">Stylist</p>
      <p class="value">${stylistName}</p>
      
      <p class="label">Date & Time</p>
      <p class="value">${appointmentDate} at ${appointmentTime}</p>
      
      <p class="label">Duration</p>
      <p class="value">${duration}</p>
      
      <p class="label">Price</p>
      <p class="value" style="font-size: 20px; font-weight: bold; color: #D4AF37;">${formatCurrency(data.price)}</p>
      
      ${data.location ? `<p class="label">Location</p><p class="value">${sanitizeEmailInput(data.location)}</p>` : ''}
    </div>
    
    ${data.notes ? `
    <div style="background: #fff9e6; border-left: 4px solid #D4AF37; padding: 12px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">Special Notes:</p>
      <p style="margin: 8px 0 0 0;">${sanitizeEmailInput(data.notes)}</p>
    </div>
    ` : ''}
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="https://kbstylish.com.np/bookings" class="button">
        View Booking Details
      </a>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 14px; text-align: center;">
      We'll send you a reminder 24 hours before your appointment.
    </p>
  `;
  
  const plainText = `
Hi ${customerName},

Your styling appointment has been confirmed!

APPOINTMENT DETAILS
-------------------
Service: ${serviceName}
Stylist: ${stylistName}
Date & Time: ${appointmentDate} at ${appointmentTime}
Duration: ${duration}
Price: ${formatCurrency(data.price)}
${data.location ? `Location: ${sanitizeEmailInput(data.location)}` : ''}

${data.notes ? `Special Notes: ${sanitizeEmailInput(data.notes)}` : ''}

View booking details: https://kbstylish.com.np/bookings

We'll send you a reminder 24 hours before your appointment.

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Booking Confirmed - ${serviceName} with ${stylistName}`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P0 TEMPLATE 4: VENDOR APPROVED
// ============================================================================

function renderVendorApproved(
  data: VendorApprovedData,
  recipientUserId?: string
): EmailTemplate {
  const vendorName = sanitizeEmailInput(data.vendorName);
  const businessName = sanitizeEmailInput(data.businessName);
  const dashboardUrl = data.dashboardUrl || 'https://kbstylish.com.np/vendor/dashboard';
  
  const htmlContent = `
    <h1>Welcome to KB Stylish! 🎉</h1>
    <p>Hi ${vendorName},</p>
    <p>Congratulations! Your vendor application for <strong>${businessName}</strong> has been approved.</p>
    
    <p style="margin-top: 24px;">You can now:</p>
    <ul style="color: #333; line-height: 1.8;">
      <li>Add your products to the marketplace</li>
      <li>Manage orders and fulfillment</li>
      <li>Track your sales and earnings</li>
      <li>Access vendor analytics and reports</li>
    </ul>
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="${dashboardUrl}" class="button">
        Go to Vendor Dashboard
      </a>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 14px;">
      Need help getting started? Check out our <a href="https://kbstylish.com.np/vendor/guides" style="color: #D4AF37;">vendor guide</a> or reply to this email.
    </p>
    
    <p style="margin-top: 24px;">
      Welcome aboard! 🚀<br/>
      <em>The KB Stylish Team</em>
    </p>
  `;
  
  const plainText = `
Hi ${vendorName},

Congratulations! Your vendor application for ${businessName} has been approved.

You can now:
- Add your products to the marketplace
- Manage orders and fulfillment
- Track your sales and earnings
- Access vendor analytics and reports

Go to your dashboard: ${dashboardUrl}

Need help getting started? Check out our vendor guide or reply to this email.

Welcome aboard!
The KB Stylish Team

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Welcome to KB Stylish - Your Vendor Account is Active!`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P0 TEMPLATE 5: VENDOR NEW ORDER
// ============================================================================

function renderVendorNewOrder(
  data: VendorNewOrderData,
  recipientUserId?: string
): EmailTemplate {
  const vendorName = sanitizeEmailInput(data.vendorName);
  const orderNumber = sanitizeEmailInput(data.orderNumber);
  const customerName = sanitizeEmailInput(data.customerName);
  const shippingAddress = sanitizeEmailInput(data.shippingAddress);
  const dashboardUrl = data.dashboardUrl || `https://kbstylish.com.np/vendor/orders`;
  
  const htmlContent = `
    <h1>New Order Received! 🛍️</h1>
    <p>Hi ${vendorName},</p>
    <p>You have a new order that needs to be fulfilled.</p>
    
    <div class="details-box">
      <p class="label">Order Number</p>
      <p class="value">${orderNumber}</p>
      <p class="label">Customer</p>
      <p class="value">${customerName}</p>
    </div>
    
    <h2>Items to Fulfill</h2>
    ${data.items.map(item => `
      <div class="item">
        <p style="margin: 0; font-weight: 500;">${sanitizeEmailInput(item.name)}</p>
        <p style="margin: 4px 0 0 0; color: #666;">Qty: ${item.quantity} × ${formatCurrency(item.price)}</p>
      </div>
    `).join('')}
    
    <div class="total">
      <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
        <span>Your Earnings:</span>
        <span style="color: #D4AF37;">${formatCurrency(data.total)}</span>
      </div>
    </div>
    
    <div style="margin-top: 24px;">
      <p class="label">Shipping Address</p>
      <p style="margin: 4px 0 0 0; white-space: pre-line;">${shippingAddress}</p>
    </div>
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="${dashboardUrl}" class="button">
        View Order & Print Label
      </a>
    </div>
    
    <div style="background: #fff9e6; border-left: 4px solid #D4AF37; padding: 12px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">⏰ Action Required</p>
      <p style="margin: 8px 0 0 0;">Please ship this order within 2 business days to maintain your seller rating.</p>
    </div>
  `;
  
  const plainText = `
Hi ${vendorName},

You have a new order that needs to be fulfilled.

ORDER DETAILS
-------------
Order Number: ${orderNumber}
Customer: ${customerName}

ITEMS TO FULFILL
----------------
${data.items.map(item => `
${sanitizeEmailInput(item.name)}
Qty: ${item.quantity} × ${formatCurrency(item.price)}
`).join('\n')}

Your Earnings: ${formatCurrency(data.total)}

SHIPPING ADDRESS
----------------
${shippingAddress}

⏰ Action Required
Please ship this order within 2 business days to maintain your seller rating.

View order and print label: ${dashboardUrl}

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `New Order #${orderNumber} - Action Required`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P0 TEMPLATE 6: VENDOR REJECTED
// ============================================================================

function renderVendorRejected(
  data: VendorRejectedData,
  recipientUserId?: string
): EmailTemplate {
  const vendorName = sanitizeEmailInput(data.vendorName);
  const businessName = sanitizeEmailInput(data.businessName);
  const reason = data.reason ? sanitizeEmailInput(data.reason) : null;
  const canReapply = data.canReapply !== false; // Default true
  
  const htmlContent = `
    <h1>Vendor Application Update</h1>
    <p>Hi ${vendorName},</p>
    <p>Thank you for your interest in joining KB Stylish as a vendor.</p>
    
    <p>After careful review, we're unable to approve your application for <strong>${businessName}</strong> at this time.</p>
    
    ${reason ? `
    <div style="background: #fff3e6; border-left: 4px solid #ff9800; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">Reason:</p>
      <p style="margin: 8px 0 0 0;">${reason}</p>
    </div>
    ` : ''}
    
    ${canReapply ? `
    <p style="margin-top: 24px;">
      <strong>You can reapply:</strong><br/>
      If you believe this was an error or you've addressed the concerns, you're welcome to submit a new application.
    </p>
    
    <div style="text-align: center; margin-top: 32px;">
      <a href="https://kbstylish.com.np/vendor/apply" class="button">
        Submit New Application
      </a>
    </div>
    ` : `
    <p style="margin-top: 24px;">
      Unfortunately, you are not eligible to reapply at this time.
    </p>
    `}
    
    <p style="margin-top: 32px; color: #666; font-size: 14px;">
      Have questions? Reply to this email and we'll be happy to provide more details.
    </p>
    
    <p style="margin-top: 24px;">
      Best regards,<br/>
      <em>The KB Stylish Team</em>
    </p>
  `;
  
  const plainText = `
Hi ${vendorName},

Thank you for your interest in joining KB Stylish as a vendor.

After careful review, we're unable to approve your application for ${businessName} at this time.

${reason ? `Reason: ${reason}\n` : ''}

${canReapply ? `
You can reapply:
If you believe this was an error or you've addressed the concerns, you're welcome to submit a new application.

Submit new application: https://kbstylish.com.np/vendor/apply
` : `Unfortunately, you are not eligible to reapply at this time.`}

Have questions? Reply to this email and we'll be happy to provide more details.

Best regards,
The KB Stylish Team

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Vendor Application Update - ${businessName}`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P1 TEMPLATE 1: BOOKING REMINDER
// ============================================================================

function renderBookingReminder(
  data: BookingReminderData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const stylistName = sanitizeEmailInput(data.stylistName);
  const serviceName = sanitizeEmailInput(data.serviceName);
  const appointmentDate = sanitizeEmailInput(data.appointmentDate);
  const appointmentTime = sanitizeEmailInput(data.appointmentTime);
  const duration = sanitizeEmailInput(data.duration);
  const location = data.location ? sanitizeEmailInput(data.location) : null;
  const rescheduleUrl = data.rescheduleUrl || 'https://kbstylish.com.np/bookings';
  const viewDetailsUrl = data.viewDetailsUrl || rescheduleUrl;
  
  const htmlContent = `
    <h1>📅 Reminder: Tomorrow's Appointment</h1>
    <p>Hi ${customerName},</p>
    <p>This is a friendly reminder about your appointment tomorrow!</p>
    
    <div style="background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 24px; border-radius: 8px; margin: 24px 0;">
      <p style="font-size: 20px; font-weight: bold; margin: 0; color: #111;">
        ${appointmentTime}
      </p>
      <p style="font-size: 16px; margin: 8px 0 0 0; color: #111;">
        with <strong>${stylistName}</strong>
      </p>
    </div>
    
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${serviceName}</p>
      <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${appointmentDate}</p>
      <p style="margin: 0 0 8px 0;"><strong>Duration:</strong> ${duration}</p>
      ${location ? `<p style="margin: 0;"><strong>Location:</strong> ${location}</p>` : ''}
    </div>
    
    <div style="display: flex; gap: 12px; margin: 24px 0;">
      ${data.addToCalendarUrl ? `
      <a href="${data.addToCalendarUrl}" style="flex: 1; background: #fff; color: #D4AF37; border: 2px solid #D4AF37; padding: 12px 24px; text-align: center; text-decoration: none; border-radius: 4px; font-weight: bold;">
        📅 Add to Calendar
      </a>
      ` : ''}
      <a href="${viewDetailsUrl}" class="button" style="flex: 1;">
        View Details
      </a>
    </div>
    
    ${data.preparationTips ? `
    <div style="background: #fff9e6; border-left: 4px solid #D4AF37; padding: 12px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">💡 Preparation Tips</p>
      <p style="margin: 8px 0 0 0;">${sanitizeEmailInput(data.preparationTips)}</p>
    </div>
    ` : ''}
    
    <p style="margin-top: 32px; text-align: center;">
      Need to reschedule? <a href="${rescheduleUrl}">Click here</a>
    </p>
  `;
  
  const plainText = `
Reminder: Tomorrow's Appointment

Hi ${customerName},

This is a friendly reminder about your appointment tomorrow!

APPOINTMENT DETAILS
-------------------
Time: ${appointmentTime}
Stylist: ${stylistName}
Service: ${serviceName}
Date: ${appointmentDate}
Duration: ${duration}
${location ? `Location: ${location}` : ''}

${data.preparationTips ? `
PREPARATION TIPS
${data.preparationTips}
` : ''}

View details: ${viewDetailsUrl}
Need to reschedule? ${rescheduleUrl}

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Tomorrow: ${stylistName} at ${appointmentTime}`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P1 TEMPLATE 2: ORDER CANCELLED
// ============================================================================

function renderOrderCancelled(
  data: OrderCancelledData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const orderNumber = sanitizeEmailInput(data.orderNumber);
  const cancelledDate = sanitizeEmailInput(data.cancelledDate);
  const cancelledTime = sanitizeEmailInput(data.cancelledTime);
  const reason = data.reason ? sanitizeEmailInput(data.reason) : null;
  const supportEmail = data.supportEmail || 'support@kbstylish.com.np';
  
  const htmlContent = `
    <h1>Order Cancelled</h1>
    <p>Hi ${customerName},</p>
    
    <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">✅ Your order has been cancelled</p>
      <p style="margin: 8px 0 0 0; font-size: 14px;">Order #${orderNumber}</p>
      <p style="margin: 4px 0 0 0; font-size: 14px; color: #666;">Cancelled on ${cancelledDate} at ${cancelledTime}</p>
    </div>
    
    ${reason ? `
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold;">Reason:</p>
      <p style="margin: 8px 0 0 0;">${reason}</p>
    </div>
    ` : ''}
    
    ${data.refundAmount ? `
    <div style="background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 24px; border-radius: 8px; margin: 24px 0;">
      <h2 style="margin: 0 0 16px 0; color: #111;">Refund Information</h2>
      <div style="display: grid; gap: 12px;">
        <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.1);">
          <span>Amount:</span>
          <span style="font-weight: bold;">${formatCurrency(data.refundAmount)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.1);">
          <span>Method:</span>
          <span>${data.refundMethod || 'Original payment method'}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Timeline:</span>
          <span>${data.refundETA || '3-5 business days'}</span>
        </div>
      </div>
    </div>
    ` : ''}
    
    <details style="margin: 24px 0;">
      <summary style="cursor: pointer; font-weight: bold; padding: 12px; background: #f5f5f5; border-radius: 4px;">
        View cancelled items
      </summary>
      <div style="padding: 16px 0;">
        ${data.items.map(item => `
          <div style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <p style="margin: 0; font-weight: bold;">${sanitizeEmailInput(item.name)}</p>
            <p style="margin: 4px 0 0 0; color: #666;">Qty: ${item.quantity} × ${formatCurrency(item.price)}</p>
          </div>
        `).join('')}
        <div style="padding: 12px 0; margin-top: 8px; font-weight: bold;">
          <span>Subtotal:</span> ${formatCurrency(data.subtotal)}
        </div>
      </div>
    </details>
    
    <div style="background: #f0f7ff; border-left: 4px solid #2196f3; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; font-weight: bold; color: #111;">Need Help?</p>
      <p style="margin: 8px 0 0 0;">Questions about your cancellation or refund?</p>
      <p style="margin: 8px 0 0 0;">
        <a href="mailto:${supportEmail}">${supportEmail}</a>
      </p>
    </div>
    
    <p style="margin-top: 32px;">We hope to see you again soon!</p>
  `;
  
  const plainText = `
Order Cancelled

Hi ${customerName},

✅ Your order #${orderNumber} has been cancelled.
Cancelled on ${cancelledDate} at ${cancelledTime}

${reason ? `Reason: ${reason}\n` : ''}

${data.refundAmount ? `
REFUND INFORMATION
------------------
Amount: ${formatCurrency(data.refundAmount)}
Method: ${data.refundMethod || 'Original payment method'}
Timeline: ${data.refundETA || '3-5 business days'}
` : ''}

CANCELLED ITEMS
---------------
${data.items.map(item => `
${item.name}
Qty: ${item.quantity} × ${formatCurrency(item.price)}
`).join('\n')}

Subtotal: ${formatCurrency(data.subtotal)}

NEED HELP?
Questions about your cancellation or refund?
Contact us: ${supportEmail}

We hope to see you again soon!

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `Order #${orderNumber} Cancelled - Refund Processing`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}

// ============================================================================
// P1 TEMPLATE 3: REVIEW REQUEST
// ============================================================================

function renderReviewRequest(
  data: ReviewRequestData,
  recipientUserId?: string
): EmailTemplate {
  const customerName = sanitizeEmailInput(data.customerName);
  const orderNumber = sanitizeEmailInput(data.orderNumber);
  const deliveredDate = sanitizeEmailInput(data.deliveredDate);
  const firstItem = data.items[0];
  const preferencesUrl = data.preferencesUrl || 'https://kbstylish.com.np/account/email-preferences';
  
  const htmlContent = `
    <h1>How was your ${sanitizeEmailInput(firstItem.name)}?</h1>
    <p>Hi ${customerName},</p>
    <p>You received your order a week ago. We'd love to hear what you think!</p>
    
    ${data.items.map(item => `
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <div style="display: flex; gap: 16px; align-items: center;">
          ${item.image_url ? `
            <img src="${item.image_url}" alt="${sanitizeEmailInput(item.name)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;">
          ` : ''}
          <div style="flex: 1;">
            <p style="margin: 0; font-weight: bold;">${sanitizeEmailInput(item.name)}</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #666;">From order #${orderNumber}</p>
          </div>
        </div>
        
        <div style="margin-top: 16px; text-align: center;">
          <p style="margin: 0 0 8px 0; font-weight: bold;">Quick rating:</p>
          <div style="font-size: 24px; letter-spacing: 4px;">
            <a href="${item.review_url}&rating=5" style="text-decoration: none;">⭐⭐⭐⭐⭐</a><br/>
            <a href="${item.review_url}&rating=4" style="text-decoration: none;">⭐⭐⭐⭐</a><br/>
            <a href="${item.review_url}&rating=3" style="text-decoration: none;">⭐⭐⭐</a><br/>
            <a href="${item.review_url}&rating=2" style="text-decoration: none;">⭐⭐</a><br/>
            <a href="${item.review_url}&rating=1" style="text-decoration: none;">⭐</a>
          </div>
          <p style="margin: 12px 0 0 0; font-size: 14px; color: #666;">Click a star to leave your review</p>
        </div>
      </div>
    `).join('')}
    
    <div style="background: #fff9e6; border-left: 4px solid #D4AF37; padding: 12px; margin: 24px 0;">
      <p style="margin: 0;">💡 Your review helps other shoppers and supports local vendors</p>
    </div>
    
    ${data.incentiveMessage ? `
    <div style="background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 16px; border-radius: 8px; margin: 24px 0; text-align: center;">
      <p style="margin: 0; font-weight: bold; color: #111;">🎁 ${sanitizeEmailInput(data.incentiveMessage)}</p>
    </div>
    ` : ''}
    
    <p style="margin-top: 32px; text-align: center; font-size: 14px; color: #666;">
      <a href="${preferencesUrl}">Don't want review requests?</a>
    </p>
  `;
  
  const plainText = `
How was your ${firstItem.name}?

Hi ${customerName},

You received your order a week ago. We'd love to hear what you think!

${data.items.map(item => `
${item.name}
From order #${orderNumber}

Leave a review: ${item.review_url}

Quick rating links:
5 stars: ${item.review_url}&rating=5
4 stars: ${item.review_url}&rating=4
3 stars: ${item.review_url}&rating=3
2 stars: ${item.review_url}&rating=2
1 star: ${item.review_url}&rating=1
`).join('\n---\n')}

💡 Your review helps other shoppers and supports local vendors

${data.incentiveMessage ? `🎁 ${data.incentiveMessage}\n` : ''}

Don't want review requests? ${preferencesUrl}

---
© 2025 KB Stylish
Kathmandu, Nepal
  `.trim();
  
  return {
    subject: `How was your ${firstItem.name}?`,
    html: wrapEmailTemplate(htmlContent, recipientUserId),
    text: plainText,
  };
}
