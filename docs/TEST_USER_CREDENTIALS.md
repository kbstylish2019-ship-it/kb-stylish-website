# 🧪 TEST USER FOR ONBOARDING

## Quick Setup - Create Test User

Since Supabase's `auth.users` table requires special handling, here are **3 easy ways** to create a test user:

---

## ✅ METHOD 1: Sign Up via UI (RECOMMENDED - 2 minutes)

1. **Go to:** `http://localhost:3000`
2. **Click:** "Login / Register" button
3. **Fill form:**
   - Email: `testuser@kbstylish.com`
   - Password: `Test1234!`
   - Name: "Sarah Johnson"
4. **Click:** Register
5. **Check email** for confirmation link (or skip if email disabled)
6. **Done!** User created with ID

**Now test onboarding:**
- Login as admin
- Go to: `/admin/stylists/onboard`
- Search: `testuser` or `sarah`
- Should see: "Sarah Johnson (@testuser...)"

---

## ✅ METHOD 2: Supabase Dashboard (1 minute)

1. **Go to:** Supabase Dashboard → Authentication → Users
2. **Click:** "Add user" or "Invite user"
3. **Fill:**
   - Email: `testuser@kbstylish.com`
   - Password: `Test1234!`
   - Auto Confirm: YES
4. **Click:** Create
5. **Then add profile:** Run this SQL:

```sql
-- After creating auth user, add profile
INSERT INTO public.user_profiles (id, username, display_name)
SELECT 
  id,
  'testuser',
  'Sarah Johnson'
FROM auth.users 
WHERE email = 'testuser@kbstylish.com'
ON CONFLICT (id) DO NOTHING;
```

---

## ✅ METHOD 3: SQL Script (Direct - Advanced)

**Note:** This requires service_role key access. Use Method 1 or 2 instead if unsure.

```sql
-- Create via Supabase Auth Admin API
-- This would be done via API call, not direct SQL
```

---

## 🔐 TEST CREDENTIALS

Once created via Method 1 or 2:

```
Email: testuser@kbstylish.com
Password: Test1234!
Username: testuser
Display Name: Sarah Johnson
Role: customer (will be promoted to stylist)
```

---

## ✅ VERIFY USER WAS CREATED

```sql
-- Check auth user exists
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'testuser@kbstylish.com';

-- Check profile exists
SELECT id, username, display_name 
FROM public.user_profiles 
WHERE username = 'testuser';

-- Check roles (should be empty or customer only)
SELECT ur.*, r.name as role_name
FROM public.user_roles ur
JOIN public.roles r ON ur.role_id = r.id
WHERE ur.user_id IN (
  SELECT id FROM auth.users WHERE email = 'testuser@kbstylish.com'
);
```

---

## 📝 QUICK TEST FLOW

### Step 1: Create User (Method 1 - UI)
```
1. Go to: http://localhost:3000
2. Register as: testuser@kbstylish.com / Test1234!
3. Confirm email if needed
```

### Step 2: Test Onboarding
```
1. Login as admin
2. Go to: /admin/stylists/onboard
3. Search: testuser
4. Should appear: "Sarah Johnson"
5. Click user → Continue onboarding
```

### Step 3: Complete Promotion
```
1. Set Background Check: Passed
2. Set ID Verification: Verified
3. Check Training ✓
4. Check MFA ✓
5. Fill profile details
6. Complete onboarding
```

### Step 4: Verify Result
```
1. Check audit logs
2. Query: SELECT * FROM stylist_profiles WHERE display_name = 'Sarah Johnson'
3. Login as testuser@kbstylish.com
4. Should see "Stylist Dashboard" in profile dropdown
```

---

## 🐛 TROUBLESHOOTING

### "User not found in search"
**Problem:** Profile not created  
**Fix:** Run the profile INSERT query above

### "Search returns no results"
**Problem:** API column name issue  
**Status:** ✅ FIXED (just now - refresh page)

### "Email already exists"
**Fix:** Use different email or delete existing:
```sql
-- Delete test user if needed (careful!)
DELETE FROM auth.users WHERE email = 'testuser@kbstylish.com';
DELETE FROM public.user_profiles WHERE username = 'testuser';
```

---

## 🎯 ALTERNATIVE TEST USERS

If you want multiple test users:

**User 2:**
- Email: `emma.wilson@kbstylish.com`
- Password: `Test1234!`
- Username: `emmawilson`
- Display Name: "Emma Wilson"

**User 3:**
- Email: `michael.chen@kbstylish.com`
- Password: `Test1234!`
- Username: `michaelchen`
- Display Name: "Michael Chen"

Create via same Method 1 or 2 above.

---

## ✅ RECOMMENDED FLOW

**For easiest testing:**

1. **Use Method 1** (Register via UI) - most realistic
2. **Credentials:** `testuser@kbstylish.com` / `Test1234!`
3. **Name:** "Sarah Johnson" (easy to search)
4. **Username:** Will be auto-generated or set to `testuser`
5. **Then:** Test onboarding immediately

**Why Method 1?**
- No SQL needed
- Tests the full user registration flow
- Creates both auth and profile automatically
- Most realistic scenario

---

**Status:** ✅ User search API fixed (column name issue resolved)  
**Next:** Create test user via Method 1 and test onboarding!
