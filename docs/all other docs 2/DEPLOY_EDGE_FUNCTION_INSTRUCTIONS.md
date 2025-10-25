# 🚀 EDGE FUNCTION DEPLOYMENT INSTRUCTIONS

## Status: Ready to Deploy (Code Updated ✅)

---

# WHAT NEEDS TO BE DEPLOYED

**Function Name**: `review-manager`

**Purpose**: Allows users to see their own pending reviews on product pages

**Code Change** (Already in file):
```typescript
// Line 165-176 in supabase/functions/review-manager/index.ts
} else {
  // Default: Show approved reviews + user's own pending reviews
  if (authenticatedUser) {
    // Show: (1) all approved reviews OR (2) user's own reviews (any status)
    query = query.or(`is_approved.eq.true,user_id.eq.${authenticatedUser.id}`);
  } else {
    // Guest users: approved only
    query = query.eq('is_approved', true);
  }
}
```

---

# DEPLOYMENT METHOD (Via Supabase Dashboard)

Since Supabase CLI isn't available in PowerShell, deploy via dashboard:

## Step 1: Go to Supabase Dashboard
1. Open: https://supabase.com/dashboard
2. Select project: `poxjcaogjupsplrcliau`
3. Go to: **Edge Functions** in left sidebar

## Step 2: Find review-manager Function
1. Click on: **review-manager** function
2. Click: **"New deployment"** or **"Edit function"**

## Step 3: Copy Updated Code
The function has 4 files that need to be included:

### File 1: `index.ts` (Main file)
**Location**: `d:\kb-stylish\supabase\functions\review-manager\index.ts`
**Size**: 418 lines
**Status**: ✅ Updated

### File 2: `_shared/cors.ts` (Dependency)
**Location**: `d:\kb-stylish\supabase\functions\_shared\cors.ts`
**Size**: 54 lines
**Status**: ✅ No changes needed

### File 3: `_shared/auth.ts` (Dependency)
**Location**: `d:\kb-stylish\supabase\functions\_shared\auth.ts`
**Size**: 111 lines
**Status**: ✅ No changes needed

### File 4: `_shared/validation.ts` (Dependency)
**Location**: `d:\kb-stylish\supabase\functions\_shared\validation.ts`
**Size**: 95 lines
**Status**: ✅ No changes needed

## Step 4: Deploy Options

### **Option A: Via Supabase CLI** (Recommended if available)
```bash
# If Supabase CLI is available:
supabase functions deploy review-manager --project-ref poxjcaogjupsplrcliau

# You mentioned you'll toggle --no-verify-jwt in dashboard
```

### **Option B: Via Dashboard** (If CLI not available)
1. In dashboard, click "New deployment"
2. Upload all 4 files
3. Set entrypoint: `index.ts`
4. Click "Deploy"

### **Option C: Via API** (Advanced)
Use Supabase Management API to deploy programmatically

---

# TOGGLE JWT VERIFICATION

## In Supabase Dashboard:
1. Go to: Edge Functions → review-manager → Settings
2. Find: "Verify JWT" toggle
3. **Turn OFF** (as you mentioned you'll do this)

**Why**: This allows the function to handle authentication internally using the dual-client pattern

---

# TESTING AFTER DEPLOYMENT

## Test 1: Guest User (No Auth)
```bash
curl -X POST 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/review-manager' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{
    "action": "fetch",
    "filters": {
      "productId": "e2353d46-b528-47e1-b3c3-46ec2f1463c8"
    }
  }'
```

**Expected**: Returns empty reviews (no approved reviews yet)

## Test 2: Authenticated User (shishir)
```bash
curl -X POST 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/review-manager' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SHISHIR_USER_JWT' \
  -d '{
    "action": "fetch",
    "filters": {
      "productId": "e2353d46-b528-47e1-b3c3-46ec2f1463c8"
    }
  }'
```

**Expected**: Returns his pending review (because it's his own)

## Test 3: Product Page
1. Log in as shishir
2. Go to: `http://localhost:3000/product/nail-polish`
3. Scroll to reviews

**Expected**:
```
Customer Reviews
0.0 ⭐⭐⭐⭐⭐
Based on 0 reviews

━━━━━━━━━━━━━━━━━━━━━━━
Your Review (Pending Approval)
⭐⭐⭐☆☆ shishir bhusal
Oct 24, 2025
[⏳ Pending Moderation]

Great Nail polish.
I just liked the nail polish, its just out of blue. very unique!!
━━━━━━━━━━━━━━━━━━━━━━━

[You have already reviewed this product]
```

---

# VERIFICATION CHECKLIST

After deployment, verify:

## Backend:
- [ ] Edge Function deployed successfully
- [ ] JWT verification toggled OFF in dashboard
- [ ] Function returns 200 OK for test requests
- [ ] Logs show no errors in Supabase Edge Function logs

## Frontend:
- [ ] shishir can see his own pending review on product page
- [ ] Guest users only see approved reviews
- [ ] Product stats still show correct values
- [ ] Review submission still works

## Security:
- [ ] RLS policies still enforced
- [ ] Users can only see own pending reviews (not others')
- [ ] Vendors can see all reviews on own products
- [ ] Guest users can't see pending reviews

---

# ROLLBACK PLAN

If something breaks after deployment:

## Quick Rollback:
1. Go to Supabase Dashboard → Edge Functions → review-manager
2. Click "Deployments" tab
3. Find previous deployment (before this one)
4. Click "Redeploy"

## Emergency Fix:
Revert line 171 in index.ts:
```typescript
// OLD (safe but limited):
query = query.eq('is_approved', true);
```

---

# WHAT'S ALREADY WORKING

✅ Product header shows correct rating (fresh from DB)
✅ Rating distribution bars work
✅ Vendor dashboard shows pending reviews (metadata fix applied)
✅ vendor.demo and swostika can both access vendor dashboard
✅ RLS policy allows vendors to see own products
✅ Database trigger auto-updates product stats

---

# SUMMARY

| Component | Status | Action Required |
|-----------|--------|-----------------|
| API Routes | ✅ FIXED | None (metadata fix deployed) |
| RLS Policy | ✅ DEPLOYED | None |
| Product Stats | ✅ WORKING | None |
| Edge Function | ⏳ READY | **Deploy via dashboard** |

---

**Deployment Time**: ~5 minutes  
**Risk Level**: LOW (can rollback easily)  
**Breaking Changes**: NONE  
**Required By**: User to see own pending reviews  

---

*All code ready, just needs deployment*  
*User will toggle JWT verification OFF*  
*Testing instructions provided*
