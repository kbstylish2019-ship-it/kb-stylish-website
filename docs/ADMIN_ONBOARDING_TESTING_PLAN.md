# 🧪 ADMIN STYLIST ONBOARDING - MANUAL TESTING PLAN
**KB Stylish - Blueprint v3.1 Service Engine UI**

**Document Type:** QA Testing Checklist  
**Creation Date:** October 15, 2025  
**Test Target:** Stylist Onboarding Wizard  
**Status:** 🟢 READY FOR TESTING

---

## 📋 PRE-TEST SETUP

### Prerequisites
1. ✅ Database migrations applied (`20251015170000_create_service_engine_logic.sql`)
2. ✅ Admin user created with `admin` role assigned
3. ✅ At least one test customer user exists in database
4. ✅ Dev server running on `localhost:3000`
5. ✅ Supabase project accessible

### Test User Accounts Needed

**Admin Account:**
- Username: `admin_test`
- Role: `admin`
- Purpose: Execute onboarding workflow

**Customer Account (to be promoted):**
- Username: `test_stylist_candidate`
- Role: `customer`
- Purpose: User to promote to stylist

**SQL to Create Test Users:**
```sql
-- If users don't exist, create them manually via Supabase Auth UI or:
-- (Replace with actual user IDs from auth.users)

-- Assign admin role to admin user
INSERT INTO public.user_roles (user_id, role_id, assigned_by, assigned_at, is_active)
SELECT 
  'YOUR_ADMIN_USER_ID'::uuid,
  (SELECT id FROM public.roles WHERE name = 'admin'),
  'YOUR_ADMIN_USER_ID'::uuid,
  NOW(),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = 'YOUR_ADMIN_USER_ID'::uuid 
  AND role_id = (SELECT id FROM public.roles WHERE name = 'admin')
);
```

---

## 🎯 TEST SUITE 1: HAPPY PATH (COMPLETE ONBOARDING)

### Test Case 1.1: Access Control & Navigation

**Steps:**
1. Login as customer user (non-admin)
2. Navigate to `/admin/stylists/onboard`
3. **Expected:** Redirect to home page (403 forbidden)

4. Logout and login as admin user
5. Navigate to `/admin/stylists/onboard`
6. **Expected:** Wizard page loads successfully with Step 1 active

**Pass Criteria:**
- ✅ Non-admins cannot access the page
- ✅ Admins can access and see wizard UI
- ✅ Progress indicator shows 4 steps
- ✅ Step 1 is highlighted

---

### Test Case 1.2: Step 1 - User Selection

**Steps:**
1. Type "test" in search box
2. **Expected:** See loading spinner, then mock search results appear
3. Click on search result user
4. **Expected:** 
   - User card appears with username and email
   - Green checkmark icon visible
   - API call to `/api/admin/promotions/initiate` initiated
   - Automatic progression to Step 2

**Pass Criteria:**
- ✅ Search works with debouncing
- ✅ User selection updates UI immediately
- ✅ API call succeeds
- ✅ Promotion ID stored in wizard state
- ✅ Auto-advance to Step 2

**Verification Query:**
```sql
-- Check promotion record created
SELECT * FROM public.stylist_promotions 
WHERE user_id = 'SELECTED_USER_ID'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: 1 row with status = 'in_review'
```

---

### Test Case 1.3: Step 2 - Verification Checks

**Steps:**
1. **Background Check:**
   - Change dropdown to "In Progress"
   - **Expected:** API call to `/api/admin/promotions/update-checks`
   - **Expected:** Badge updates to "in_progress"
   - Change to "Passed"
   - **Expected:** Badge turns green

2. **ID Verification:**
   - Change dropdown to "Submitted"
   - Change to "Verified"
   - **Expected:** Badge turns green

3. **Training:**
   - Click checkbox to enable
   - **Expected:** Checkmark appears, API call succeeds

4. **MFA:**
   - Click checkbox to enable
   - **Expected:** Checkmark appears

5. **All Checks Complete:**
   - **Expected:** Green success banner appears: "All Checks Passed!"
   - **Expected:** "Next" button becomes enabled

6. Click "Next" button
7. **Expected:** Navigate to Step 3

**Pass Criteria:**
- ✅ Each check update triggers API call
- ✅ Local state updates immediately (optimistic UI)
- ✅ Error handling works if API fails
- ✅ Success banner appears when all pass
- ✅ Can't proceed to Step 3 unless all checks pass

**Verification Query:**
```sql
-- Check promotion checks updated
SELECT 
  background_check_status,
  id_verification_status,
  training_completed,
  mfa_enabled,
  status
FROM public.stylist_promotions 
WHERE user_id = 'SELECTED_USER_ID';

-- Expected: All checks = passed/verified/true, status = 'pending_approval'
```

---

### Test Case 1.4: Step 3 - Profile Setup

**Steps:**
1. **Display Name:**
   - Enter: "Jane Professional Stylist"
   - **Expected:** Red asterisk indicates required

2. **Title:**
   - Enter: "Senior Hair Stylist"

3. **Bio:**
   - Enter: "10+ years of experience in bridal and color treatments..."

4. **Years of Experience:**
   - Enter: `10`

5. **Specialties:**
   - Enter: "Bridal, Hair Color, Extensions"
   - **Expected:** Comma-separated values

6. **Timezone:**
   - Select: "Asia/Kathmandu (Nepal Time)"

7. Click "Next" button
8. **Expected:** Navigate to Step 4

**Pass Criteria:**
- ✅ All form fields work correctly
- ✅ Required field validation (display_name)
- ✅ Can't proceed without display name
- ✅ State persists if navigating back

---

### Test Case 1.5: Step 4 - Review & Complete

**Steps:**
1. **Review Section - User Information:**
   - **Expected:** Shows selected user's display name and username

2. **Review Section - Verification Status:**
   - **Expected:** All checks show green badges with "passed"/"verified"/"Completed"/"Enabled"

3. **Review Section - Profile Details:**
   - **Expected:** All entered profile data displayed correctly
   - **Expected:** Bio shown in separate section

4. Click "Complete Onboarding" button
5. **Expected:**
   - Loading spinner appears on button
   - Button disabled during request
   - API call to `/api/admin/promotions/complete`
   - Success screen appears with:
     - Green checkmark icon
     - "Onboarding Complete!" message
     - Stylist User ID displayed
     - Display name shown
     - "Onboard Another Stylist" button

**Pass Criteria:**
- ✅ Review shows accurate data
- ✅ Button shows loading state
- ✅ API completes successfully
- ✅ Success screen displays
- ✅ localStorage cleared

**Verification Queries:**
```sql
-- 1. Check promotion completed
SELECT * FROM public.stylist_promotions 
WHERE user_id = 'SELECTED_USER_ID';
-- Expected: status = 'approved', approved_at IS NOT NULL

-- 2. Check stylist profile created
SELECT * FROM public.stylist_profiles 
WHERE user_id = 'SELECTED_USER_ID';
-- Expected: 1 row with all profile data

-- 3. Check stylist role assigned
SELECT ur.*, r.name as role_name
FROM public.user_roles ur
JOIN public.roles r ON ur.role_id = r.id
WHERE ur.user_id = 'SELECTED_USER_ID' AND r.name = 'stylist';
-- Expected: 1 row with is_active = true

-- 4. Check audit log created
SELECT * FROM private.service_management_log
WHERE operation = 'stylist_promotion_completed'
AND user_id = 'SELECTED_USER_ID';
-- Expected: 1 row
```

---

## ⚠️ TEST SUITE 2: ERROR HANDLING

### Test Case 2.1: Network Errors

**Steps:**
1. Open browser DevTools → Network tab
2. Start wizard, select user
3. **Simulate failure on Step 2:**
   - Throttle to "Offline" mode
   - Try to update background check
   - **Expected:** Red error banner appears with message
   - Enable network again
   - **Expected:** Can retry successfully

**Pass Criteria:**
- ✅ Error message displayed clearly
- ✅ Can recover from network errors
- ✅ UI doesn't break

---

### Test Case 2.2: Incomplete Checks Validation

**Steps:**
1. Complete Step 1
2. On Step 2, only complete Background Check (leave others pending)
3. Try to click "Next" button
4. **Expected:** Button is disabled (grayed out)

**Pass Criteria:**
- ✅ Can't proceed without all checks
- ✅ Clear visual feedback

---

### Test Case 2.3: Missing Required Fields

**Steps:**
1. Complete Steps 1-2
2. On Step 3, leave Display Name empty
3. Enter only optional fields
4. Try to click "Next"
5. **Expected:** Button disabled
6. Enter Display Name
7. **Expected:** Button enables

8. Navigate to Step 4
9. Try to complete without display name (somehow)
10. **Expected:** API returns error with code

**Pass Criteria:**
- ✅ Frontend validation prevents submission
- ✅ Backend validation catches edge cases
- ✅ Error messages clear

---

### Test Case 2.4: Duplicate Promotion

**Steps:**
1. Complete full onboarding for User A
2. Start new wizard session
3. Try to onboard User A again
4. **Expected:** API returns error: "User already has active promotion"

**Pass Criteria:**
- ✅ Database constraint prevents duplicates
- ✅ Error message user-friendly

---

## 🔄 TEST SUITE 3: STATE PERSISTENCE (localStorage)

### Test Case 3.1: Mid-Wizard Refresh

**Steps:**
1. Start wizard, complete Step 1 (select user)
2. Complete Step 2 (all checks)
3. **Refresh browser page (F5)**
4. **Expected:**
   - Wizard loads at Step 2
   - Selected user still shown
   - All check statuses restored
   - Promotion ID persists

**Pass Criteria:**
- ✅ State fully restored from localStorage
- ✅ No data loss
- ✅ Can continue workflow seamlessly

---

### Test Case 3.2: localStorage Cleanup

**Steps:**
1. Complete full onboarding
2. Open browser DevTools → Application → localStorage
3. Check for key `stylist_onboarding_wizard_state`
4. **Expected:** Key does not exist (cleared on completion)

**Pass Criteria:**
- ✅ localStorage cleared after success
- ✅ No stale data left behind

---

## 🔐 TEST SUITE 4: SECURITY

### Test Case 4.1: API Endpoint Security

**Steps:**
1. Logout completely
2. Use `curl` or Postman to call:
```bash
curl -X POST http://localhost:3000/api/admin/promotions/initiate \
  -H "Content-Type: application/json" \
  -d '{"userId": "any-user-id"}'
```
3. **Expected:** 401 Unauthorized

4. Login as customer user
5. Repeat curl with customer session cookie
6. **Expected:** 403 Forbidden

**Pass Criteria:**
- ✅ Endpoints reject unauthenticated requests
- ✅ Endpoints reject non-admin requests
- ✅ Database RPC also validates admin role

---

### Test Case 4.2: CSRF Protection

**Steps:**
1. Create malicious HTML page:
```html
<form action="http://localhost:3000/api/admin/promotions/complete" method="POST">
  <input type="hidden" name="promotionId" value="stolen-id" />
  <input type="submit" value="Click me!" />
</form>
```
2. Host on different origin
3. Login to KB Stylish as admin
4. Visit malicious page and submit form
5. **Expected:** Request fails (Next.js SameSite cookie protection)

**Pass Criteria:**
- ✅ CSRF attacks prevented by Next.js

---

## 📊 FINAL VERIFICATION CHECKLIST

After completing all tests, verify:

### Database State
- [ ] 1 promotion record in `stylist_promotions` (status = 'approved')
- [ ] 1 stylist profile in `stylist_profiles` with correct data
- [ ] 1 stylist role assignment in `user_roles` (is_active = true)
- [ ] 1+ audit log entries in `private.service_management_log`

### User Experience
- [ ] Wizard UI is intuitive and professional
- [ ] Error messages are clear and actionable
- [ ] Loading states prevent duplicate submissions
- [ ] Success screen provides confirmation

### Security
- [ ] Non-admins cannot access page
- [ ] API routes verify admin role
- [ ] Database RPCs verify admin role
- [ ] No sensitive data exposed in errors

### Performance
- [ ] Page loads in < 2 seconds
- [ ] API calls complete in < 3 seconds
- [ ] No console errors in browser
- [ ] No TypeScript errors in build

---

## 🐛 BUG REPORTING TEMPLATE

If issues found during testing:

```markdown
### Bug #X: [Brief Title]

**Severity:** Critical | Major | Minor  
**Test Case:** [e.g., Test Case 1.3]

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Screenshots/Logs:**
[Attach screenshots or console logs]

**Database State:**
```sql
-- Relevant query to show issue
```

**Environment:**
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]
- Date/Time: [When issue occurred]
```

---

## ✅ SIGN-OFF

**Tester Name:** ___________________  
**Date:** ___________________  
**Test Result:** ☐ PASS  ☐ FAIL (see bugs)  
**Notes:** ___________________

---

**Status:** 🟢 READY FOR MANUAL TESTING
