# 🚨 URGENT: Deploy Shipping Cost Fix

## Current Situation
- ✅ Local code updated (shipping = 0)
- ❌ **Live production still charging NPR 99 shipping**
- ⚠️ **Customers are being overcharged right now!**

---

## Quick Deploy (5 minutes)

### Step 1: Deploy Edge Function

**Go to:** https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/functions/create-order-intent

**Find this line (around line 213):**
```typescript
const shipping_cents = 9900; // NPR 99 = 9900 paisa (flat rate for MVP)
```

**Change to:**
```typescript
const shipping_cents = 0; // Free shipping for launch period
```

**Click:** "Deploy" button

**Wait:** ~30 seconds for deployment

---

### Step 2: Deploy Frontend

```bash
git add .
git commit -m "feat: free shipping for launch period"
git push
```

Vercel will auto-deploy in ~2 minutes.

---

### Step 3: Test (2 minutes)

1. Go to your website
2. Add any product to cart
3. Go to checkout
4. **Verify:** Shipping shows NPR 0.00
5. **Verify:** Total = Subtotal (no shipping added)

---

## That's It!

✅ Shipping cost removed  
✅ Customers save NPR 99 per order  
✅ Launch ready

---

## Need Help?

If deployment fails:
1. Check Supabase Dashboard → Edge Functions → Logs
2. Look for error messages
3. Contact support with error details

---

**Time to deploy:** 5 minutes  
**Impact:** Immediate (all new orders)  
**Risk:** Very low (1 line change)
