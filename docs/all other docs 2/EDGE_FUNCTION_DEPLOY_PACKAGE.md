# 🚀 EDGE FUNCTION DEPLOYMENT PACKAGE

## Deploy via Supabase Dashboard

Since MCP deployment has folder limitations, please deploy manually via dashboard.

---

# DEPLOYMENT STEPS

## 1. Go to Supabase Dashboard
- URL: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau
- Navigate to: **Edge Functions** (left sidebar)
- Find: **review-manager**
- Click: **New Deployment** or **Edit**

## 2. Toggle JWT Verification OFF
- In function settings
- Find: "Verify JWT" toggle
- **Turn OFF** (as you mentioned)

## 3. Upload Files

The function needs these 4 files from your local directory:

### File 1: `index.ts`
**Location**: `d:\kb-stylish\supabase\functions\review-manager\index.ts`
**Status**: ✅ Already updated with user's own pending reviews logic

### File 2: `_shared/cors.ts`
**Location**: `d:\kb-stylish\supabase\functions\_shared\cors.ts`
**Status**: ✅ No changes needed

### File 3: `_shared/auth.ts`
**Location**: `d:\kb-stylish\supabase\functions\_shared\auth.ts`
**Status**: ✅ No changes needed (already checks both metadata locations)

### File 4: `_shared/validation.ts`
**Location**: `d:\kb-stylish\supabase\functions\_shared\validation.ts`
**Status**: ✅ No changes needed

---

## 4. Deployment Options

### **Option A: Via Supabase CLI** (Recommended if available)
```bash
supabase functions deploy review-manager --project-ref poxjcaogjupsplrcliau --no-verify-jwt
```

### **Option B: Via GitHub Integration**
If you have GitHub integration set up, just push the code:
```bash
git add supabase/functions/review-manager/
git commit -m "feat: allow users to see own pending reviews"
git push
```

### **Option C: Manual Dashboard Upload**
1. Copy entire `supabase/functions/review-manager/` folder
2. Copy entire `supabase/functions/_shared/` folder
3. Upload via dashboard
4. Set entrypoint: `index.ts`

---

# WHAT THE EDGE FUNCTION DOES

## Key Changes (Line 165-176):
```typescript
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

**Impact**:
- ✅ Guest users: See only approved reviews
- ✅ Authenticated users: See approved reviews + their own pending reviews
- ✅ Vendors: See all reviews on their products (when using status filter)
- ✅ Security: RLS policies still enforce access control

---

# TESTING AFTER DEPLOYMENT

## Test 1: Guest User
Visit: `http://localhost:3000/product/nail-polish` (not logged in)

**Expected**: No reviews shown (none approved yet)

## Test 2: Authenticated User (shishir)
1. Log in as shishir
2. Visit: `http://localhost:3000/product/nail-polish`
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

## Test 3: Vendor Approves Review
1. Log in as swostika
2. Go to vendor dashboard → Customer Reviews
3. Click: **Approve Review** button
4. Confirm approval

**Expected**: Alert "✅ Review approved successfully!"

## Test 4: Public Visibility After Approval
1. Log out (or use incognito)
2. Visit: `http://localhost:3000/product/nail-polish`

**Expected**:
```
Customer Reviews
3.0 ⭐⭐⭐☆☆
Based on 1 reviews

━━━━━━━━━━━━━━━━━━━━━━━
⭐⭐⭐☆☆ shishir bhusal
Oct 24, 2025

Great Nail polish.
I just liked the nail polish, its just out of blue. very unique!!

0 found this helpful
━━━━━━━━━━━━━━━━━━━━━━━
```

---

# VERIFICATION CHECKLIST

After deployment:

## Backend:
- [ ] Edge Function shows "Active" status in dashboard
- [ ] JWT verification is OFF
- [ ] Function logs show no errors
- [ ] Test API call returns 200 OK

## Frontend:
- [ ] shishir sees own pending review on product page
- [ ] Guest users only see approved reviews
- [ ] Product header shows correct rating after approval
- [ ] Review stats update automatically (database trigger)

## Vendor Dashboard:
- [ ] Approve button works
- [ ] Reject button works
- [ ] Review disappears from pending list after approval
- [ ] Review appears in public product page after approval

---

# ROLLBACK PLAN

If something breaks:

1. Go to: Dashboard → Edge Functions → review-manager → Deployments
2. Find: Previous deployment (before this one)
3. Click: **Redeploy**

Or emergency fix:
```typescript
// Revert line 171 to:
query = query.eq('is_approved', true);
```

---

# WHAT'S WORKING NOW (Without Edge Function)

✅ Vendor dashboard shows pending reviews (metadata fix)
✅ Approve/Reject buttons work
✅ Product header shows correct rating
✅ Rating distribution bars work
✅ Database trigger auto-updates stats
✅ RLS policies secure

## What Edge Function Adds:

⏳ User can see own pending review on product page

---

**You can deploy this whenever ready!**

The moderation UI is working NOW. Edge Function deployment is optional for the user pending review feature.
