# 🔒 PHASE 2A: SECURITY ARCHITECT ANALYSIS

**Expert**: Security Architect  
**Focus**: Email data protection, API security, GDPR compliance

---

## CRITICAL EMAIL ADDRESS DISCOVERY ✅

### Vendor Emails
```sql
-- ✅ CORRECT: Use contact_email from application form
vendor_profiles.contact_email TEXT  -- From "Email" field in vendor application

-- ❌ WRONG: Don't use auth email (can be different)
auth.users.email  -- Signup email, may not match business email
```

**Verified in Code**: `submit_vendor_application_rpc.sql` line 63
```sql
v_email := TRIM(LOWER(p_application_data->>'email'));
-- Stored in vendor_profiles.contact_email
```

### Customer Emails
```sql
-- For ORDERS: Join to get email
orders.user_id → auth.users.email

-- For BOOKINGS: Direct email field
bookings.customer_email TEXT  -- Stored directly
```

---

## API KEY SECURITY

### Storage Strategy
```typescript
// Supabase Edge Function
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

if (!RESEND_API_KEY) {
  console.warn('[Email] Development mode - emails will be logged only');
  return { success: true, mode: 'development' };
}

const resend = new Resend(RESEND_API_KEY);
```

**Storage**: Supabase Dashboard → Edge Functions → Secrets  
**Rotation**: Every 90 days  
**Access**: Service role only

---

## EMAIL DATA CLASSIFICATION

```
🔴 HIGH SENSITIVITY (encrypt, auto-delete after 90 days)
├── Email addresses
├── Full names
├── Phone numbers
├── Physical addresses
└── Order details

🟡 MEDIUM SENSITIVITY (standard protection)
├── Order numbers (trackable but not PII)
├── Business names
└── Appointment times

🟢 LOW SENSITIVITY
├── Generic status messages
└── System notifications
```

---

## REQUIRED DNS RECORDS

```dns
; SPF Record (prevents spoofing)
kbstylish.com.np. IN TXT "v=spf1 include:resend.com ~all"

; DKIM Record (cryptographic signature)
resend._domainkey.kbstylish.com.np. IN CNAME resend.com

; DMARC Record (reporting)
_dmarc.kbstylish.com.np. IN TXT "v=DMARC1; p=none; rua=mailto:admin@kbstylish.com.np"
```

**Setup**: Resend provides these records automatically. Add to domain DNS.

---

## INPUT SANITIZATION

```typescript
// Prevent email header injection
function sanitizeEmailInput(input: string): string {
  return input
    .replace(/[\r\n]/g, '') // Remove newlines
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .trim()
    .slice(0, 200);
}

// Usage
const subject = `Order ${sanitizeEmailInput(orderNumber)} confirmed`;
const customerName = sanitizeEmailInput(order.shipping_name);
```

---

## RECOMMENDATIONS

| Priority | Item | Time | Risk |
|----------|------|------|------|
| P0 | Store API key in Supabase secrets | 5 min | 🔴 HIGH |
| P0 | Domain verification (SPF/DKIM) | 1 hr | 🔴 HIGH |
| P0 | Input sanitization | 2 hrs | 🔴 HIGH |
| P1 | 90-day auto-delete email logs | 4 hrs | 🟡 MEDIUM |
| P1 | Rate limiting via Redis | 2 hrs | 🟡 MEDIUM |
