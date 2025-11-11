# 🏗️ PHASE 2E: PRINCIPAL ENGINEER ANALYSIS

**Expert**: Principal Engineer  
**Focus**: Architecture decisions, failure modes, observability

---

## ARCHITECTURE DECISION: EDGE FUNCTION vs API ROUTE

### Option 1: Supabase Edge Function ✅ RECOMMENDED
```
Pros:
✅ Closer to database (< 50ms latency)
✅ Auto-scales globally
✅ No cold starts with proper singleton pattern
✅ Consistent with existing pattern (order-worker, verify-payment)
✅ Free tier: 500K invocations/month
✅ Can call from database triggers
✅ Service role access

Cons:
❌ Deno runtime (not Node.js)
❌ Limited npm packages
```

### Option 2: Next.js API Route
```
Pros:
✅ Node.js ecosystem
✅ Easier development
✅ TypeScript support

Cons:
❌ Higher latency (Vercel → Supabase)
❌ Cold starts on serverless
❌ Extra hop in request chain
❌ Costs scale with usage
```

**Decision**: Use **Supabase Edge Function** (`send-email`) for consistency and performance.

---

## FAILURE MODES & RECOVERY

### Failure Scenario Matrix

| Failure | Probability | Impact | Recovery Strategy |
|---------|-------------|--------|-------------------|
| Resend API down | 0.1% (99.9% SLA) | 🔴 HIGH | Retry 3x with backoff, alert admin |
| Invalid email address | 1% | 🟡 MEDIUM | Don't retry, log error, notify admin |
| Network timeout | 2% | 🟡 MEDIUM | Retry 3x, increase timeout to 10s |
| API key expired | <0.01% | 🔴 HIGH | Alert admin immediately, fail gracefully |
| Rate limit exceeded | <0.1% | 🟢 LOW | Wait 60s, retry with backoff |
| Database insert fails | 0.5% | 🟡 MEDIUM | Log to console, continue (non-critical) |
| Template render error | 0.1% | 🔴 HIGH | Alert dev team, use fallback template |

---

## OBSERVABILITY STRATEGY

### 1. Logging Standards
```typescript
// Structured logging format
interface EmailLog {
  level: 'info' | 'warn' | 'error';
  event: string;
  email_type: string;
  recipient: string;  // Hashed for privacy
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// Example
console.log(JSON.stringify({
  level: 'info',
  event: 'email_sent',
  email_type: 'order_confirmation',
  recipient: hash(email),
  duration_ms: 245,
  resend_id: 'abc123',
}));
```

### 2. Sentry Integration (Already in Stack)
```typescript
import * as Sentry from '@sentry/nextjs';

try {
  await resend.emails.send({...});
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      email_type: 'order_confirmation',
      recipient_domain: email.split('@')[1],
    },
    extra: {
      order_id: orderId,
      attempt: attemptNumber,
    },
  });
  throw error;
}
```

### 3. Metrics Dashboard (Resend Built-in)
```
Resend Dashboard provides:
✅ Emails sent/hour
✅ Delivery rate
✅ Bounce rate
✅ Open rate
✅ Click rate
✅ Failed emails with reasons

Access: https://resend.com/emails
```

---

## GRACEFUL DEGRADATION

### Development Mode (No API Key)
```typescript
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

if (!RESEND_API_KEY) {
  console.warn('[Email] Development mode - logging email instead of sending');
  console.log('[Email] Would send:', {
    to: recipient,
    subject: subject,
    template: templateName,
  });
  return { success: true, mode: 'development', sent: false };
}

const resend = new Resend(RESEND_API_KEY);
// Normal flow...
```

### Production Fallback
```typescript
async function sendEmailSafely(email: Email) {
  try {
    return await sendWithRetry(email);
  } catch (error) {
    // Email failed after all retries
    // Log to database for manual review
    await supabase.from('failed_emails').insert({
      email_type: email.type,
      recipient: email.to,
      error: error.message,
      retry_after: new Date(Date.now() + 3600000), // 1 hour
    });
    
    // Don't block order processing
    return { success: false, error: error.message };
  }
}
```

---

## INTEGRATION POINTS MAPPED

### 1. Order Confirmation
```
Trigger: order-worker Edge Function (line 163-180)
Location: supabase/functions/order-worker/index.ts
Hook Point: After process_order_with_occ succeeds
Data Source: orders table + order_items join
Email Address: orders.user_id → auth.users.email
```

### 2. Order Shipped
```
Trigger: updateFulfillmentStatus action
Location: src/actions/vendor/fulfillment.ts (line 68-73)
Hook Point: After RPC call succeeds
Data Source: order_items table
Email Address: order_items.order_id → orders.user_id → auth.users.email
```

### 3. Vendor Approved
```
Trigger: approve_vendor RPC
Location: supabase/migrations/20251012220000_admin_vendors_management.sql (line 160-232)
Hook Point: After UPDATE vendor_profiles succeeds (line 193-197)
Data Source: vendor_profiles table
Email Address: vendor_profiles.contact_email (NOT auth.users.email)
```

### 4. Vendor Rejected
```
Trigger: reject_vendor RPC
Location: Same file (line 245-309)
Hook Point: After UPDATE vendor_profiles succeeds (line 274-278)
Data Source: vendor_profiles table
Email Address: vendor_profiles.contact_email
```

### 5. Booking Confirmation
```
Trigger: order-worker Edge Function
Location: Same as #1
Hook Point: After booking record created from booking_reservation
Data Source: bookings table
Email Address: bookings.customer_email (direct field)
```

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Resend API key obtained
- [ ] Domain verified (SPF/DKIM records)
- [ ] noreply@kbstylish.com.np configured
- [ ] React Email templates created & tested
- [ ] Email logging schema deployed
- [ ] Edge Function deployed to Supabase
- [ ] Environment variables set (RESEND_API_KEY)
- [ ] Sentry configured for error tracking

### Post-Deployment
- [ ] Send test email to real address
- [ ] Verify email received & renders correctly
- [ ] Check mobile rendering (iOS, Android)
- [ ] Monitor Resend dashboard for 24hrs
- [ ] Review Sentry for any errors
- [ ] Check database logs for email_logs entries
- [ ] Verify delivery rate >98%

---

## COST ANALYSIS

### Resend Pricing
```
Free Tier: 3,000 emails/month
Paid Tier: $20/month for 50,000 emails

Current Volume: ~3,300 emails/month
Recommendation: Start with Paid Tier ($20/month)

Cost per email: $0.0004
Annual cost: $240
```

### Supabase Costs
```
Edge Function invocations: ~3,300/month
Free tier: 500,000/month
Cost: $0 (well within free tier)
```

### Total Monthly Cost
```
Resend: $20
Supabase: $0 (within existing plan)
Development time: 40 hours @ [your rate]
----------------------------
Total: $20/month recurring
```

---

## RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Email deliverability issues | LOW | HIGH | Domain verification, SPF/DKIM |
| Resend outage | VERY LOW | HIGH | Retry logic, monitoring, fallback queue |
| Cost overrun | LOW | MEDIUM | Set billing alerts, monitor volume |
| Spam complaints | LOW | MEDIUM | Only transactional emails, clear unsubscribe |
| Data breach | VERY LOW | CRITICAL | Encrypt PII, 90-day retention, RLS policies |
| Template bugs | MEDIUM | LOW | Preview tool, staging environment tests |

---

## RECOMMENDATIONS

| Priority | Decision | Rationale |
|----------|----------|-----------|
| P0 | Use Supabase Edge Function | Performance + consistency |
| P0 | Fire-and-forget async pattern | Non-blocking |
| P0 | Retry 3x with exponential backoff | Reliability |
| P0 | Use vendor contact_email | Correct business email |
| P1 | Log to email_logs table | Observability |
| P1 | Integrate Sentry | Error tracking |
| P1 | 90-day auto-delete | GDPR compliance |
| P2 | Upgrade to queue system | When volume >500/day |

---

## FINAL ARCHITECTURE DIAGRAM

```
┌─────────────┐
│   Trigger   │ (order created, vendor approved, etc.)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Edge Function  │ send-email (Deno runtime)
│  (send-email)   │ - Validates event
└──────┬──────────┘ - Gets recipient email
       │            - Renders React template
       │            - Calls Resend API
       ▼            - Logs result
┌─────────────┐
│ Resend API  │ - Sends email
└──────┬──────┘ - Returns tracking ID
       │
       ▼
┌──────────────┐
│  Email Logs  │ - Stores sent_at, status
└──────────────┘ - Auto-deletes after 90 days

Parallel:
┌──────────────┐
│    Sentry    │ - Captures errors
└──────────────┘ - Alerts on failures
```

---

**Phase 2 Complete** ✅  
**Next**: Phase 3 - Consistency Check
