# 🏗️ PHASE 4: SOLUTION BLUEPRINT

**Protocol**: UNIVERSAL AI EXCELLENCE PROTOCOL v2.0  
**Phase**: 4 of 10 - Solution Blueprint  
**Status**: 🔄 IN PROGRESS

---

## 🎯 FINAL ARCHITECTURE

### Components Overview
```
┌──────────────────────────────────────────────────────────┐
│                   KB STYLISH PLATFORM                     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────┐         ┌──────────────┐               │
│  │   Triggers  │────────▶│ Edge Function│               │
│  │  (Events)   │         │ send-email   │               │
│  └─────────────┘         └──────┬───────┘               │
│       │                          │                        │
│       │                          ▼                        │
│       │                  ┌──────────────┐               │
│       │                  │  Resend API  │               │
│       │                  └──────┬───────┘               │
│       │                          │                        │
│       ▼                          ▼                        │
│  ┌──────────────┐         ┌──────────────┐             │
│  │  email_logs  │◀────────│   Customer   │             │
│  │   (Table)    │         │    Inbox     │             │
│  └──────────────┘         └──────────────┘             │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## COMPONENT 1: SEND-EMAIL EDGE FUNCTION

### File Structure
```
supabase/functions/
├── _shared/
│   ├── cors.ts (existing)
│   ├── email/
│   │   ├── templates.ts (NEW)
│   │   ├── types.ts (NEW)
│   │   └── utils.ts (NEW)
└── send-email/
    └── index.ts (NEW)
```

### Implementation: index.ts
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { renderEmailTemplate, EmailType } from '../_shared/email/templates.ts';

// Singleton Resend client
let resendInstance: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured - development mode');
    return null;
  }
  
  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }
  
  return resendInstance;
}

interface EmailRequest {
  email_type: EmailType;
  recipient_email: string;
  recipient_user_id?: string;
  template_data: Record<string, any>;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const payload: EmailRequest = await req.json();
    const { email_type, recipient_email, recipient_user_id, template_data } = payload;
    
    // Validate input
    if (!email_type || !recipient_email || !template_data) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields'
      }), { status: 400, headers: corsHeaders });
    }
    
    // Get Resend client
    const resend = getResendClient();
    
    if (!resend) {
      // Development mode - log instead of sending
      console.log('[Email] Would send:', {
        type: email_type,
        to: recipient_email,
        data: template_data
      });
      
      return new Response(JSON.stringify({
        success: true,
        mode: 'development',
        sent: false
      }), { headers: corsHeaders });
    }
    
    // Render template
    const { subject, html } = await renderEmailTemplate(email_type, template_data);
    
    // Send with retry
    const result = await sendWithRetry(resend, {
      from: 'KB Stylish <noreply@kbstylish.com.np>',
      to: recipient_email,
      subject: subject,
      html: html,
    }, 3);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Log to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    await supabase.from('email_logs').insert({
      recipient_user_id: recipient_user_id || null,
      recipient_email: recipient_email,
      email_type: email_type,
      subject: subject,
      resend_email_id: result.id,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
    
    return new Response(JSON.stringify({
      success: true,
      resend_email_id: result.id,
      message: 'Email sent successfully'
    }), { headers: corsHeaders });
    
  } catch (error) {
    console.error('[Email] Send failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: corsHeaders });
  }
});

// Retry logic with exponential backoff
async function sendWithRetry(
  resend: Resend,
  email: any,
  maxAttempts: number = 3
): Promise<{ success: boolean; id?: string; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resend.emails.send(email);
      return { success: true, id: result.id };
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      
      if (isLastAttempt) {
        return { success: false, error: error.message };
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}
```

---

## COMPONENT 2: EMAIL TEMPLATES

### File: supabase/functions/_shared/email/templates.ts
```typescript
export type EmailType =
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'vendor_new_order';

interface EmailTemplate {
  subject: string;
  html: string;
}

export async function renderEmailTemplate(
  type: EmailType,
  data: Record<string, any>
): Promise<EmailTemplate> {
  switch (type) {
    case 'order_confirmation':
      return renderOrderConfirmation(data);
    case 'order_shipped':
      return renderOrderShipped(data);
    case 'vendor_approved':
      return renderVendorApproved(data);
    case 'vendor_rejected':
      return renderVendorRejected(data);
    case 'vendor_new_order':
      return renderVendorNewOrder(data);
    case 'booking_confirmation':
      return renderBookingConfirmation(data);
    case 'booking_reminder':
      return renderBookingReminder(data);
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

function renderOrderConfirmation(data: any): EmailTemplate {
  const { customerName, orderNumber, orderDate, items, total, shippingAddress } = data;
  
  return {
    subject: `Order Confirmed - #${orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; }
          .header { padding: 32px; text-align: center; background: #000; border-radius: 8px 8px 0 0; }
          .content { padding: 32px; }
          .button { display: inline-block; padding: 12px 32px; background: #D4AF37; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #D4AF37; margin: 0;">KB Stylish</h1>
          </div>
          <div class="content">
            <h2 style="color: #111;">Order Confirmed! 🎉</h2>
            <p>Hi ${customerName},</p>
            <p>Thank you for your order! We're preparing your items for shipment.</p>
            
            <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin: 24px 0;">
              <p style="margin: 0;"><strong>Order Number:</strong> ${orderNumber}</p>
              <p style="margin: 8px 0 0 0;"><strong>Order Date:</strong> ${orderDate}</p>
            </div>
            
            <h3>Order Items</h3>
            ${items.map((item: any) => `
              <div style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
                <p style="margin: 0; font-weight: 500;">${item.name}</p>
                <p style="margin: 4px 0 0 0; color: #666;">Qty: ${item.quantity} × NPR ${item.price}</p>
              </div>
            `).join('')}
            
            <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #111;">
              <p style="margin: 0; font-size: 24px; font-weight: bold;">Total: NPR ${total}</p>
            </div>
            
            <div style="margin-top: 24px;">
              <p style="font-size: 12px; color: #666; text-transform: uppercase;">Shipping Address</p>
              <p style="margin: 4px 0 0 0;">${shippingAddress}</p>
            </div>
            
            <div style="text-align: center; margin-top: 32px;">
              <a href="https://kbstylish.com.np/orders/${orderNumber}" class="button">Track Your Order</a>
            </div>
            
            <p style="margin-top: 32px; text-align: center; color: #666; font-size: 14px;">
              Need help? Reply to this email or contact our support team.
            </p>
          </div>
          <div class="footer">
            <p>© 2025 KB Stylish. All rights reserved.</p>
            <p>Kathmandu, Nepal</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

function renderVendorApproved(data: any): EmailTemplate {
  const { vendorName, businessName } = data;
  
  return {
    subject: 'Welcome to KB Stylish - Your Vendor Account is Active!',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background: #f6f9fc;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px;">
          <h1 style="color: #D4AF37;">Welcome to KB Stylish! 🎉</h1>
          <p>Hi ${vendorName},</p>
          <p>Great news! Your vendor application for <strong>${businessName}</strong> has been approved.</p>
          <p>You can now:</p>
          <ul>
            <li>Add your products to the marketplace</li>
            <li>Manage orders and fulfillment</li>
            <li>Track your sales and payouts</li>
          </ul>
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://kbstylish.com.np/vendor/dashboard" 
               style="display: inline-block; padding: 12px 32px; background: #D4AF37; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Go to Dashboard
            </a>
          </div>
          <p>Welcome aboard!</p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">© 2025 KB Stylish</p>
        </div>
      </body>
      </html>
    `,
  };
}

// Additional templates follow same pattern...
```

---

## COMPONENT 3: DATABASE SCHEMA

### Migration File: 20251027000000_email_notification_system.sql
```sql
BEGIN;

-- Email logs table
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  
  -- Email Metadata
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_name TEXT,
  
  -- Delivery Tracking
  resend_email_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent' 
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Error Tracking
  failure_reason TEXT,
  attempts INTEGER DEFAULT 1,
  
  -- Compliance (auto-delete after 90 days)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_user_id, created_at DESC);
CREATE INDEX idx_email_logs_resend ON email_logs(resend_email_id) WHERE resend_email_id IS NOT NULL;
CREATE INDEX idx_email_logs_cleanup ON email_logs(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_email_logs_type_status ON email_logs(email_type, status, created_at DESC);

-- RLS Policies
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs"
ON email_logs FOR SELECT
USING (auth.uid() = recipient_user_id);

CREATE POLICY "Service role can insert email logs"
ON email_logs FOR INSERT
WITH CHECK (true);  -- Only service role can insert

-- Email preferences table
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Optional notifications
  receive_booking_reminders BOOLEAN DEFAULT true,
  receive_review_requests BOOLEAN DEFAULT true,
  receive_promotional_emails BOOLEAN DEFAULT false,
  
  -- Vendor-specific
  receive_low_stock_alerts BOOLEAN DEFAULT true,
  receive_payout_notifications BOOLEAN DEFAULT true,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own email preferences"
ON email_preferences FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Auto-create preferences on signup
CREATE OR REPLACE FUNCTION create_default_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_email_prefs
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_default_email_preferences();

-- Cleanup function (runs daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_email_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM email_logs 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON email_logs TO authenticated;
GRANT SELECT, UPDATE ON email_preferences TO authenticated;

COMMIT;
```

---

## COMPONENT 4: INTEGRATION POINTS

### 1. Order Confirmation (order-worker)
```typescript
// In supabase/functions/order-worker/index.ts
// After line 180 (successful order creation)

if (data.success) {
  // Send order confirmation email
  const { data: orderData } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(product_name, quantity, price_at_purchase)
    `)
    .eq('id', data.order_id)
    .single();
  
  if (orderData) {
    await supabase.functions.invoke('send-email', {
      body: {
        email_type: 'order_confirmation',
        recipient_email: orderData.shipping_email || userEmail,
        recipient_user_id: orderData.user_id,
        template_data: {
          customerName: orderData.shipping_name,
          orderNumber: orderData.order_number,
          orderDate: new Date(orderData.created_at).toLocaleDateString(),
          items: orderData.order_items,
          total: orderData.total_cents / 100,
          shippingAddress: `${orderData.shipping_address_line1}, ${orderData.shipping_city}`,
        },
      },
    });
  }
}
```

### 2. Order Shipped (fulfillment action)
```typescript
// In src/actions/vendor/fulfillment.ts
// After line 100 (successful status update)

if (result.success && params.newStatus === 'shipped') {
  // Get order and customer details
  const { data: orderItem } = await supabase
    .from('order_items')
    .select(`
      *,
      orders!inner(user_id, order_number, shipping_name)
    `)
    .eq('id', params.orderItemId)
    .single();
  
  if (orderItem) {
    const { data: user } = await supabase.auth.admin.getUserById(orderItem.orders.user_id);
    
    if (user) {
      await supabase.functions.invoke('send-email', {
        body: {
          email_type: 'order_shipped',
          recipient_email: user.email,
          recipient_user_id: user.id,
          template_data: {
            customerName: orderItem.orders.shipping_name,
            orderNumber: orderItem.orders.order_number,
            trackingNumber: params.trackingNumber,
            shippingCarrier: params.shippingCarrier,
          },
        },
      });
    }
  }
}
```

### 3. Vendor Approved (approve_vendor RPC)
```sql
-- In approve_vendor function, after line 197

-- Send approval email
PERFORM net.http_post(
  url := format('%s/functions/v1/send-email', current_setting('app.supabase_url')),
  headers := jsonb_build_object(
    'Authorization', format('Bearer %s', current_setting('app.service_role_key')),
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object(
    'email_type', 'vendor_approved',
    'recipient_email', (SELECT contact_email FROM vendor_profiles WHERE user_id = p_vendor_id),
    'recipient_user_id', p_vendor_id,
    'template_data', jsonb_build_object(
      'vendorName', (SELECT contact_name FROM vendor_profiles WHERE user_id = p_vendor_id),
      'businessName', (SELECT business_name FROM vendor_profiles WHERE user_id = p_vendor_id)
    )
  )
);

-- Update flag
UPDATE vendor_profiles
SET approval_notification_sent = true
WHERE user_id = p_vendor_id;
```

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Install Resend: `npm install resend`
- [ ] Get Resend API key from https://resend.com/api-keys
- [ ] Domain verification (SPF/DKIM records)
- [ ] Configure noreply@kbstylish.com.np sender
- [ ] Run migration: `20251027000000_email_notification_system.sql`
- [ ] Deploy send-email Edge Function
- [ ] Set RESEND_API_KEY in Supabase Edge Function secrets
- [ ] Test in development mode (no API key)

### Post-Deployment
- [ ] Send test email to real address
- [ ] Verify mobile rendering
- [ ] Check Resend dashboard for delivery
- [ ] Monitor email_logs table
- [ ] Set up Sentry alerts for failures
- [ ] Configure cron for cleanup (daily 2 AM)

---

**Phase 4 Complete** ✅  
**Next**: Phase 5 - Blueprint Review
