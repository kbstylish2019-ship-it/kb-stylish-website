# 🚀 DEPLOY EDGE FUNCTION - STEP-BY-STEP GUIDE

**Edge Function**: `submit-vendor-application`  
**Status**: Code ready, NOT deployed  
**Time Required**: 5-10 minutes

---

## 📋 PRE-FLIGHT CHECKLIST

✅ Edge Function code exists at: `supabase/functions/submit-vendor-application/index.ts`  
✅ Shared utilities exist: `supabase/functions/_shared/auth.ts`, `cors.ts`  
✅ Configuration updated: `supabase/config.toml` includes Edge Function  
✅ Database RPC deployed: `submit_vendor_application_secure` ✅  
✅ Frontend code ready: `ApplicationForm.tsx` sends correct requests  

**Missing**: Edge Function deployment to Supabase ⏳

---

## 🎯 OPTION 1: DEPLOY VIA SUPABASE DASHBOARD (EASIEST)

### Step 1: Open Supabase Dashboard
Go to: https://app.supabase.com/project/poxjcaogjupsplrcliau/functions

### Step 2: Check if Function Exists
- Look for `submit-vendor-application` in the list
- If it exists → Click on it → Click "Deploy" tab → Paste new code
- If it doesn't exist → Click "Create Function" button

### Step 3: Create/Update Function

**Function Name**: `submit-vendor-application`

**Main File** (`index.ts`):
```typescript
[Copy entire contents from: d:\kb-stylish\supabase\functions\submit-vendor-application\index.ts]
```

**Import Map** (if prompted):
```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.39.3"
  }
}
```

### Step 4: Add Shared Files

You'll need to include the shared utilities. In the dashboard:

1. Create `_shared/auth.ts`:
```typescript
[Copy from: d:\kb-stylish\supabase\functions\_shared\auth.ts]
```

2. Create `_shared/cors.ts`:
```typescript
[Copy from: d:\kb-stylish\supabase\functions\_shared\cors.ts]
```

### Step 5: Deploy

Click **"Deploy"** button and wait for deployment to complete.

### Step 6: Verify

Run this in your browser console:
```javascript
fetch('https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application', {
  method: 'OPTIONS'
}).then(r => console.log('Function exists!', r.status));
```

If you get `200 OK` → ✅ Function deployed!

---

## 🎯 OPTION 2: DEPLOY VIA SUPABASE CLI (RECOMMENDED)

### Step 1: Install Supabase CLI

```powershell
# If you have npm:
npm install -g supabase

# Or download from:
# https://github.com/supabase/cli/releases
```

### Step 2: Login to Supabase

```powershell
supabase login
```

This will open a browser window to authenticate.

### Step 3: Link Your Project

```powershell
cd d:\kb-stylish
supabase link --project-ref poxjcaogjupsplrcliau
```

You'll need your database password (from Supabase dashboard → Settings → Database).

### Step 4: Deploy the Edge Function

```powershell
supabase functions deploy submit-vendor-application
```

**Expected Output**:
```
Deploying submit-vendor-application...
✓ Deployed Function submit-vendor-application
Function URL: https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application
```

### Step 5: Verify Deployment

```powershell
supabase functions list
```

You should see `submit-vendor-application` in the list.

### Step 6: Test the Function

```powershell
# Get your JWT token from the frontend (DevTools console):
# const { data } = await (await import('@/lib/supabase/client')).createClient().auth.getSession();
# console.log(data.session.access_token);

# Then test:
$jwt = "YOUR_JWT_HERE"
$body = @{
  business_name = "Test Shop"
  business_type = "Boutique"
  contact_name = "Test User"
  email = "test@example.com"
  phone = "9812345678"
  payout_method = "bank"
  bank_name = "Nepal Bank"
  bank_account_name = "Test"
  bank_account_number = "123456789"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $jwt"
    "Content-Type" = "application/json"
  } `
  -Body $body
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Application submitted successfully!"
}
```

---

## 🎯 OPTION 3: QUICK VERIFICATION (Is it already deployed?)

Run this in PowerShell:

```powershell
curl.exe -X OPTIONS https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application
```

**Possible Results**:
- `200 OK` → Function is deployed ✅
- `404 Not Found` → Function NOT deployed ❌
- `403 Forbidden` → Function exists but has config issues

---

## 🧪 POST-DEPLOYMENT TESTING

### Test 1: Verify Edge Function is Live

```javascript
// Run in browser console (DevTools → Console)
fetch('https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application', {
  method: 'OPTIONS'
}).then(r => console.log('Status:', r.status, r.ok ? '✅ Deployed' : '❌ Not Found'));
```

### Test 2: Test Authentication

```javascript
// Get your session
const { createClient } = await import('@/lib/supabase/client');
const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
console.log('JWT:', session?.access_token);

// Test Edge Function
const response = await fetch('https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    business_name: 'Test Shop',
    business_type: 'Boutique',
    contact_name: 'Test User',
    email: 'test@example.com',
    phone: '9812345678',
    payout_method: 'esewa',
    esewa_number: '9812345678'
  })
});

const result = await response.json();
console.log('Result:', result);
```

**Expected if deployed correctly**:
```json
{
  "success": true,
  "message": "Application submitted successfully!"
}
```

**Or if validation fails** (which is GOOD - means function is working):
```json
{
  "success": false,
  "error": "Invalid email format",
  "error_code": "INVALID_EMAIL"
}
```

### Test 3: Full Frontend Test

1. Log in as `shishirbhusal08@gmail.com`
2. Go to `/vendor/apply`
3. Fill out the form completely
4. Click "Submit Application"
5. Check console for success message

**Expected Console Output**:
```
[ApplicationForm] Checking authentication...
[ApplicationForm] User: shishirbhusal08@gmail.com Error: null
[ApplicationForm] Session after getUser(): Found
✅ POST /functions/v1/submit-vendor-application 200 OK
✅ Application submitted successfully!
```

### Test 4: Verify in Database

```sql
-- Run in Supabase SQL Editor
SELECT 
  user_id,
  business_name,
  application_state,
  application_submitted_at,
  created_at
FROM vendor_profiles
WHERE business_name = 'shishir''s business'
ORDER BY created_at DESC
LIMIT 1;
```

---

## 🚨 TROUBLESHOOTING

### Issue: "Function not found" (404)

**Cause**: Edge Function not deployed  
**Fix**: Follow Option 1 or Option 2 above to deploy

### Issue: "Unauthorized" (401) after deployment

**Possible Causes**:

1. **JWT is expired**
   - Solution: Log out and log back in
   
2. **Edge Function can't access auth utilities**
   - Solution: Verify `_shared/auth.ts` is deployed alongside main function
   
3. **Environment variables missing**
   - Solution: Check Supabase dashboard → Edge Functions → Environment Variables
   - Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Issue: "Invalid request body" (400)

**Cause**: Request format mismatch  
**Fix**: Check console logs to see what frontend is sending vs. what Edge Function expects

### Issue: "RPC error" (500)

**Cause**: Database RPC function not deployed or has errors  
**Fix**: 
1. Check if RPC exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'submit_vendor_application_secure';
   ```
2. If missing, run migration:
   ```powershell
   # Apply migration
   supabase db push
   ```

---

## ✅ SUCCESS CHECKLIST

After deployment, verify:

- [ ] Edge Function appears in Supabase dashboard functions list
- [ ] OPTIONS request returns 200 OK
- [ ] POST with valid JWT returns 200 or validation error (not 401)
- [ ] Frontend submission succeeds
- [ ] Application appears in `vendor_profiles` table
- [ ] No console errors

---

## 🎯 EXPECTED TIMELINE

- **Option 1 (Dashboard)**: 10-15 minutes (copy-paste code)
- **Option 2 (CLI)**: 5 minutes (if CLI already installed)
- **Option 3 (Verification)**: 1 minute

**Choose**: Option 2 (CLI) is fastest if you have it installed, otherwise Option 1 (Dashboard) is most reliable.

---

## 📞 IF YOU'RE STUCK

**Quick Health Check**:
```powershell
# 1. Test if Edge Function exists
curl.exe -I https://poxjcaogjupsplrcliau.supabase.co/functions/v1/submit-vendor-application

# 2. Check if RPC exists (in SQL Editor)
SELECT proname FROM pg_proc WHERE proname = 'submit_vendor_application_secure';

# 3. Check frontend auth (in browser console)
const { createClient } = await import('@/lib/supabase/client');
const supabase = createClient();
const { data } = await supabase.auth.getUser();
console.log('User:', data.user?.email);
```

**If all 3 pass** → Edge Function is deployed and working!  
**If #1 fails** → Deploy Edge Function (this guide)  
**If #2 fails** → Deploy database migration  
**If #3 fails** → Frontend auth issue (refresh page, re-login)

---

**Ready to deploy!** Choose your option above and let's get this function live! 🚀
