# 📊 PHASE 2C: DATA ARCHITECT ANALYSIS

**Expert**: Data Architect  
**Focus**: Email tracking schema, idempotency, audit trails

---

## EMAIL LOGS SCHEMA

```sql
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  
  -- Email Metadata
  email_type TEXT NOT NULL,  -- 'order_confirmation', 'vendor_approved', etc.
  subject TEXT NOT NULL,
  template_name TEXT NOT NULL,
  
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
  
  -- Compliance (GDPR)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_user_id, created_at DESC);
CREATE INDEX idx_email_logs_resend ON email_logs(resend_email_id) WHERE resend_email_id IS NOT NULL;
CREATE INDEX idx_email_logs_cleanup ON email_logs(expires_at) WHERE expires_at IS NOT NULL;
```

---

## IDEMPOTENCY PATTERN

```typescript
// Prevent duplicate emails using unique constraint
async function sendOrderConfirmation(orderId: string, email: string) {
  // Generate idempotent key
  const idempotencyKey = `order_confirmation:${orderId}`;
  
  try {
    // Check if already sent
    const { data: existing } = await supabase
      .from('email_logs')
      .select('id')
      .eq('email_type', 'order_confirmation')
      .eq('recipient_email', email)
      .contains('metadata', { order_id: orderId })
      .single();
    
    if (existing) {
      console.log('[Email] Already sent, skipping');
      return { success: true, skipped: true };
    }
    
    // Send email
    const result = await resend.emails.send({...});
    
    // Log
    await supabase.from('email_logs').insert({
      recipient_email: email,
      email_type: 'order_confirmation',
      resend_email_id: result.id,
      metadata: { order_id: orderId },
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## VENDOR EMAIL RETRIEVAL PATTERN

```typescript
// ✅ CORRECT: Get vendor contact email
async function getVendorEmail(vendorId: string): Promise<string | null> {
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('contact_email, user_id')
    .eq('user_id', vendorId)
    .single();
  
  if (!vendor?.contact_email) {
    console.warn(`[Email] No contact_email for vendor ${vendorId}`);
    
    // Fallback to auth email as last resort
    const { data: user } = await supabase.auth.admin.getUserById(vendorId);
    return user?.email || null;
  }
  
  return vendor.contact_email;
}

// ✅ CORRECT: Get customer email for orders
async function getCustomerEmailForOrder(orderId: string): Promise<string | null> {
  const { data: order } = await supabase
    .from('orders')
    .select(`
      user_id,
      users:auth.users!inner(email)
    `)
    .eq('id', orderId)
    .single();
  
  return order?.users?.email || null;
}

// ✅ CORRECT: Get customer email for bookings (direct field)
async function getCustomerEmailForBooking(bookingId: string): Promise<string | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_email')
    .eq('id', bookingId)
    .single();
  
  return booking?.customer_email || null;
}
```

---

## EMAIL PREFERENCES SCHEMA

```sql
CREATE TABLE public.email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Optional Notifications (can opt-out)
  receive_booking_reminders BOOLEAN DEFAULT true,
  receive_review_requests BOOLEAN DEFAULT true,
  receive_promotional_emails BOOLEAN DEFAULT false,  -- Must opt-in
  
  -- Vendor-specific
  receive_low_stock_alerts BOOLEAN DEFAULT true,
  receive_payout_notifications BOOLEAN DEFAULT true,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create on user signup
CREATE TRIGGER trigger_create_email_prefs
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_default_email_preferences();
```

**Usage**:
```typescript
// Check preferences before sending optional emails
async function canSendBookingReminder(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('email_preferences')
    .select('receive_booking_reminders')
    .eq('user_id', userId)
    .single();
  
  return data?.receive_booking_reminders !== false; // Default true
}
```

---

## DATA RETENTION POLICY

```sql
-- Auto-delete expired email logs (runs daily via cron)
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
$$ LANGUAGE plpgsql;

-- Schedule: Daily at 2 AM Nepal time
-- Add to Supabase cron: */1 0 2 * * * (every day at 2 AM)
```

---

## RECOMMENDATIONS

| Priority | Item | Time |
|----------|------|------|
| P0 | Create email_logs table | 1 hr |
| P0 | Implement vendor email retrieval | 30 min |
| P1 | Idempotency checks | 2 hrs |
| P1 | Email preferences table | 2 hrs |
| P1 | Auto-cleanup cron job | 1 hr |
| P2 | Email analytics dashboard | 8 hrs |
