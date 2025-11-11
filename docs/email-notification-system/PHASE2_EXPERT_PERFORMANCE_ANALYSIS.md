# ⚡ PHASE 2B: PERFORMANCE ENGINEER ANALYSIS

**Expert**: Performance Engineer  
**Focus**: Async delivery, retry logic, scalability

---

## EMAIL SENDING ARCHITECTURE

### Option A: Synchronous ❌
```typescript
const order = await createOrder();
await sendEmail(); // BLOCKS order processing +250ms
```
**Pros**: Simple  
**Cons**: Slow, no retry

### Option B: Fire-and-Forget ✅ (PHASE 1 RECOMMENDATION)
```typescript
const order = await createOrder();
sendEmail().catch(console.error); // NON-BLOCKING
```
**Pros**: Fast, simple  
**Cons**: No retry on failure

### Option C: Queue-Based 🚀 (FUTURE)
```typescript
const order = await createOrder();
await queueEmail({ orderId, type: 'confirmation' });
// Separate worker processes queue with retries
```
**Pros**: Reliable, retries, monitoring  
**Cons**: Complex, requires worker

**Decision**: Start with B, upgrade to C at 500+ emails/day

---

## RETRY STRATEGY

```typescript
async function sendWithRetry(email: Email, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resend.emails.send(email);
      return { success: true, id: result.id };
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`Failed after ${attempt} attempts:`, error);
        return { success: false, error: error.message };
      }
      
      // Exponential backoff: 2s, 5s, 9s
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await sleep(delay + Math.random() * 1000); // Add jitter
    }
  }
}
```

---

## PERFORMANCE METRICS

### Current Load (Estimated)
```
Orders: 20/day × 4 emails = 80 emails/day
Bookings: 10/day × 3 emails = 30 emails/day
Vendors: 5/month × 2 emails = 0.3 emails/day
-------------------------------------------
Total: ~110 emails/day (0.0013/sec average)

Peak: All in 1 hour = 110/hour = 0.03/sec
```

### Resend Performance
```
Average latency: 150-250ms
P95 latency: 400ms
Rate limit: 10 emails/sec (free), 100/sec (paid)
Max size: 40MB

Our peak: 0.03/sec → 300x below rate limit ✅
```

---

## SINGLETON PATTERN (COLD START FIX)

```typescript
// ❌ SLOW - Creates new instance every time
export default async function handler(req: Request) {
  const resend = new Resend(API_KEY); // Cold start penalty
}

// ✅ FAST - Reuses instance
let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(Deno.env.get('RESEND_API_KEY')!);
  }
  return resendInstance;
}

export default async function handler(req: Request) {
  const resend = getResend(); // Instant on warm starts
}
```

---

## MONITORING TARGETS

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Delivery Rate | >98% | <95% |
| Bounce Rate | <2% | >5% |
| Failure Rate | <5% | >10% |
| Send Time (P95) | <500ms | >1000ms |

---

## RECOMMENDATIONS

| Priority | Item | Time |
|----------|------|------|
| P0 | Async fire-and-forget | 1 hr |
| P0 | Retry with backoff | 2 hrs |
| P0 | Singleton Resend client | 15 min |
| P1 | Email logging | 3 hrs |
| P1 | Sentry integration | 1 hr |
| P2 | Queue system (future) | 8 hrs |
