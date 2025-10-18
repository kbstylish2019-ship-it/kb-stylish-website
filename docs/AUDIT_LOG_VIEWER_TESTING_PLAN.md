# 🧪 AUDIT LOG VIEWER - MANUAL TESTING PLAN
**KB Stylish - Production Verification Protocol**

**Document Type:** QA Testing Checklist  
**Created:** October 15, 2025  
**Scope:** Audit Log Viewer (Blueprint v3.1 - Final Component)  
**Testing Level:** Manual E2E Testing  

---

## 📋 PRE-TESTING CHECKLIST

Before beginning tests, ensure:

- [ ] **Migration Applied:** Run `20251015180000_create_audit_log_viewer_rpc.sql`
- [ ] **RPC Verified:** Check function exists:
  ```sql
  SELECT proname, pg_get_function_arguments(oid) 
  FROM pg_proc 
  WHERE proname = 'get_audit_logs';
  ```
- [ ] **Test Users Created:**
  - [ ] Admin user (with 'admin' role)
  - [ ] Auditor user (with 'auditor' role)
  - [ ] Super Auditor user (with 'super_auditor' role)
  - [ ] Regular customer (no privileged roles)
- [ ] **Test Data Exists:** Service management logs populated (from previous promotions/overrides)
- [ ] **Development Server Running:** `npm run dev`
- [ ] **Supabase Connected:** Check environment variables

---

## 🎯 TEST CASES

### **Test Case 1: Access Control - Admin User**

**Purpose:** Verify admins can only see governance & configuration logs (excluding own actions)

**Prerequisites:**
- Login as user with 'admin' role
- Admin has performed at least one action (e.g., created schedule override)

**Steps:**
1. Navigate to `/admin/logs/audit`
2. **Expected:** Page loads successfully
3. **Expected:** Role badge shows "⚠️ Admin Access (Governance & Configuration only)"
4. Observe category filter dropdown
5. **Expected:** "Security" and "Data Access" options are disabled with "(Auditor Only)" label
6. Select "All Categories" filter
7. **Expected:** Only logs with category = 'governance' OR 'configuration' are shown
8. **Expected:** No logs where `admin_email` matches your logged-in email (self-audit prevention)
9. Click "Details" (eye icon) on any log
10. **Expected:** If category = 'governance' or 'configuration', details JSON is visible
11. **Expected:** If category = 'security' (shouldn't appear), details show "[Details redacted - insufficient privileges]"

**Pass Criteria:**
- ✅ Admin cannot see security/data_access logs
- ✅ Admin cannot see their own actions
- ✅ Details are visible for allowed categories
- ✅ UI clearly indicates restricted access

---

### **Test Case 2: Access Control - Auditor User**

**Purpose:** Verify auditors can see all logs except their own actions

**Prerequisites:**
- Login as user with 'auditor' role
- Auditor has performed at least one action

**Steps:**
1. Navigate to `/admin/logs/audit`
2. **Expected:** Page loads successfully
3. **Expected:** Role badge shows "🔍 Auditor Access (All logs except own)"
4. Observe category filter dropdown
5. **Expected:** All categories (Governance, Security, Data Access, Configuration) are enabled
6. Select "Security" category
7. **Expected:** Security logs are visible (auth failures, etc.)
8. Select "All Categories"
9. **Expected:** All categories appear EXCEPT logs where `admin_email` matches your logged-in email
10. Click "Details" on any log
11. **Expected:** Full details JSON is visible (no redaction)

**Pass Criteria:**
- ✅ Auditor can see all categories
- ✅ Auditor cannot see their own actions
- ✅ Details are fully visible (no redaction)

---

### **Test Case 3: Access Control - Super Auditor User**

**Purpose:** Verify super auditors have unrestricted access

**Prerequisites:**
- Login as user with 'super_auditor' role

**Steps:**
1. Navigate to `/admin/logs/audit`
2. **Expected:** Page loads successfully
3. **Expected:** Role badge shows "🔓 Super Auditor Access (Unrestricted)"
4. Observe category filter dropdown
5. **Expected:** All categories are enabled
6. Select "All Categories"
7. **Expected:** ALL logs are visible, including logs of super auditor's own actions
8. Filter by specific admin (if UI supports search by admin email)
9. **Expected:** Can see logs from ANY admin, including self
10. Click "Details" on any log
11. **Expected:** Full details JSON is visible (no redaction)

**Pass Criteria:**
- ✅ Super Auditor sees ALL logs (no filtering)
- ✅ Super Auditor sees their own actions
- ✅ No restrictions on categories
- ✅ Full details visibility

---

### **Test Case 4: Access Control - Unauthorized User**

**Purpose:** Verify non-privileged users are blocked

**Prerequisites:**
- Login as regular customer (no admin/auditor roles)

**Steps:**
1. Navigate to `/admin/logs/audit`
2. **Expected:** Redirected to `/` (home page)
3. **Expected:** Cannot access audit logs

**Pass Criteria:**
- ✅ Non-privileged users cannot access `/admin/logs/audit`
- ✅ Proper redirect behavior

---

### **Test Case 5: Filtering - Category Filter**

**Purpose:** Verify category filtering works correctly

**Prerequisites:**
- Login as auditor or super auditor
- Logs exist for multiple categories

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Select "Governance" from category filter
3. **Expected:** Only logs with `category = 'governance'` are shown
4. Select "Security"
5. **Expected:** Only logs with `category = 'security'` are shown
6. Select "All Categories"
7. **Expected:** All categories are shown
8. Observe total count updates with each filter change

**Pass Criteria:**
- ✅ Category filter correctly filters results
- ✅ Total count reflects filtered results
- ✅ Pagination resets to page 1 on filter change

---

### **Test Case 6: Filtering - Severity Filter**

**Purpose:** Verify severity filtering works correctly

**Prerequisites:**
- Logs exist with different severities (info, warning, critical)

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Select "Critical" from severity filter
3. **Expected:** Only logs with `severity = 'critical'` are shown
4. Select "Warning"
5. **Expected:** Only logs with `severity = 'warning'` are shown
6. Select "Info"
7. **Expected:** Only logs with `severity = 'info'` are shown
8. Select "All Severities"
9. **Expected:** All severities are shown

**Pass Criteria:**
- ✅ Severity filter correctly filters results
- ✅ Badge colors match severity (Critical=red, Warning=yellow, Info=blue)

---

### **Test Case 7: Filtering - Date Range**

**Purpose:** Verify date range filtering works correctly

**Prerequisites:**
- Logs exist spanning multiple days

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Set "Start Date" to 3 days ago (use datetime-local picker)
3. **Expected:** Only logs created on or after start date are shown
4. Set "End Date" to yesterday
5. **Expected:** Only logs between start and end date are shown
6. Clear both dates (empty fields)
7. **Expected:** All logs are shown
8. Set "End Date" before "Start Date"
9. **Expected:** API returns error: "endDate must be >= startDate"

**Pass Criteria:**
- ✅ Date range filtering works correctly
- ✅ Invalid date ranges are rejected
- ✅ Clearing dates shows all logs

---

### **Test Case 8: Pagination**

**Purpose:** Verify pagination works correctly

**Prerequisites:**
- More than 50 logs exist

**Steps:**
1. Navigate to `/admin/logs/audit`
2. **Expected:** "Showing 1 - 50 of X logs" appears
3. **Expected:** "Page 1 of Y" appears
4. **Expected:** Previous button is disabled (on page 1)
5. Click "Next" button
6. **Expected:** Page 2 loads
7. **Expected:** "Showing 51 - 100 of X logs" appears
8. **Expected:** Both Previous and Next buttons are enabled
9. Click "Previous" button
10. **Expected:** Back to page 1
11. Change page size to "100"
12. **Expected:** More logs per page, pagination updates

**Pass Criteria:**
- ✅ Pagination controls work correctly
- ✅ Page size selector updates results
- ✅ Count displays are accurate

---

### **Test Case 9: Details Expansion**

**Purpose:** Verify expandable details row works correctly

**Prerequisites:**
- Logs exist with details JSON

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Click "Details" (eye icon) on first log
3. **Expected:** Row expands to show:
   - Log ID
   - Target ID (if exists)
   - Target Type (if exists)
   - IP Address (if exists)
   - Details JSON (formatted)
   - User Agent (if exists)
4. **Expected:** JSON is properly formatted and readable
5. Click "Details" again
6. **Expected:** Row collapses
7. Click "Details" on a different log
8. **Expected:** Previous log collapses, new log expands

**Pass Criteria:**
- ✅ Details expand/collapse correctly
- ✅ JSON is formatted and readable
- ✅ Only one row expanded at a time

---

### **Test Case 10: Details Redaction (Admin User)**

**Purpose:** Verify detail redaction for insufficient privileges

**Prerequisites:**
- Login as admin user
- At least one log exists (should be visible as governance/config)

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Click "Details" on a governance log
3. **Expected:** Full details JSON is visible
4. (If a security log appears due to bug): Click "Details"
5. **Expected:** "[Details redacted - insufficient privileges]" message appears

**Pass Criteria:**
- ✅ Admins see full details for allowed categories
- ✅ Redaction message for restricted categories

---

### **Test Case 11: Clear Filters**

**Purpose:** Verify "Clear Filters" button resets all filters

**Prerequisites:**
- Multiple filters applied

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Set category = "Governance"
3. Set severity = "Critical"
4. Set start date = 3 days ago
5. Set end date = today
6. Click "Clear Filters" button
7. **Expected:** Category resets to "All Categories"
8. **Expected:** Severity resets to "All Severities"
9. **Expected:** Start date field is empty
10. **Expected:** End date field is empty
11. **Expected:** Page resets to 1
12. **Expected:** All logs are shown

**Pass Criteria:**
- ✅ All filters reset correctly
- ✅ Page resets to 1
- ✅ Full log list is re-displayed

---

### **Test Case 12: Error Handling - Network Error**

**Purpose:** Verify graceful error handling

**Prerequisites:**
- Ability to simulate network failure (browser DevTools offline mode)

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Open browser DevTools → Network tab
3. Enable "Offline" mode
4. Apply a filter (triggers refetch)
5. **Expected:** Loading spinner appears
6. **Expected:** Error banner appears: "Network error. Please try again."
7. **Expected:** Previous logs (if any) are cleared
8. Disable "Offline" mode
9. Click "Clear Filters" to retry
10. **Expected:** Logs load successfully

**Pass Criteria:**
- ✅ Network errors are caught and displayed
- ✅ User-friendly error message
- ✅ UI remains functional after error

---

### **Test Case 13: Loading States**

**Purpose:** Verify loading indicators appear correctly

**Prerequisites:**
- Fresh page load or filter change

**Steps:**
1. Navigate to `/admin/logs/audit` (first time)
2. **Expected:** Loading spinner appears immediately
3. **Expected:** "Loading audit logs..." message displays
4. **Expected:** Once loaded, spinner disappears and logs appear
5. Change a filter
6. **Expected:** Spinner reappears briefly during fetch
7. **Expected:** New filtered results appear

**Pass Criteria:**
- ✅ Loading spinner displays during data fetch
- ✅ Smooth transition from loading to data
- ✅ No flickering or UI jumps

---

### **Test Case 14: Empty State**

**Purpose:** Verify empty state when no logs match filters

**Prerequisites:**
- Filters that return no results

**Steps:**
1. Navigate to `/admin/logs/audit`
2. Set category = "Security"
3. Set severity = "Critical"
4. Set date range = distant past (e.g., 5 years ago)
5. **Expected:** Empty state icon (FileText) appears
6. **Expected:** Message: "No audit logs found"
7. **Expected:** Sub-message: "Try adjusting your filters"
8. Clear filters
9. **Expected:** Logs reappear

**Pass Criteria:**
- ✅ Empty state displays when no results
- ✅ Helpful message encourages filter adjustment
- ✅ No errors or broken UI

---

### **Test Case 15: Real Audit Data Verification**

**Purpose:** Verify actual audit logs are being created and displayed

**Prerequisites:**
- Perform an action that creates audit logs (e.g., complete stylist promotion)

**Steps:**
1. As admin, complete a stylist promotion via `/admin/stylists/onboard`
2. **Expected:** Action completes successfully
3. Navigate to `/admin/logs/audit`
4. Filter by category = "Governance"
5. **Expected:** See log with:
   - Action: `'complete_stylist_promotion'`
   - Admin: Your email
   - Category: Governance badge
   - Severity: Info badge
6. Click "Details"
7. **Expected:** Details JSON shows:
   - `promotion_id`
   - `user_id`
   - `user_name`
   - Stylist profile details

**Pass Criteria:**
- ✅ Audit logs are created for admin actions
- ✅ Logs display correct data
- ✅ Details JSON matches expected structure

---

## 🔒 SECURITY VERIFICATION

### **Security Test 1: Self-Audit Prevention**

**Purpose:** Confirm admins/auditors cannot see their own logs

**Steps:**
1. Login as Admin A
2. Create a schedule override
3. Login as Admin B (different admin)
4. Navigate to `/admin/logs/audit`
5. Filter by category = "Governance"
6. **Expected:** See Admin A's action (schedule override creation)
7. Logout, login as Admin A
8. Navigate to `/admin/logs/audit`
9. **Expected:** Do NOT see your own schedule override creation log
10. Verify total count is 1 less than what Admin B saw

**Pass Criteria:**
- ✅ Users cannot see their own audit logs
- ✅ Self-audit prevention works correctly

---

### **Security Test 2: Category Restriction for Admins**

**Purpose:** Confirm admins cannot see security logs

**Steps:**
1. As super auditor, verify security logs exist (e.g., failed login attempts)
2. Login as regular admin
3. Navigate to `/admin/logs/audit`
4. **Expected:** "Security" category is disabled in dropdown
5. Manually craft API request with category='security' (use browser DevTools)
6. **Expected:** Response shows 0 logs (filtered by RPC)

**Pass Criteria:**
- ✅ Admins cannot access security category via UI
- ✅ Backend RPC enforces category restrictions

---

### **Security Test 3: Detail Redaction**

**Purpose:** Verify sensitive details are redacted for lower privileges

**Steps:**
1. Login as super auditor
2. Find a security log with details
3. Note the details JSON content
4. Login as regular admin
5. (Security logs shouldn't appear, but if they do via bug)
6. **Expected:** Details field shows NULL or redaction message

**Pass Criteria:**
- ✅ Details are redacted for insufficient privileges
- ✅ RPC-level redaction works (not just UI)

---

## ✅ ACCEPTANCE CRITERIA

All test cases must pass:

- [ ] **Access Control:** All 4 access control tests pass
- [ ] **Filtering:** All 4 filtering tests pass
- [ ] **Pagination:** Pagination test passes
- [ ] **Details:** Both details tests pass
- [ ] **UX:** Clear filters, loading, empty state tests pass
- [ ] **Integration:** Real audit data test passes
- [ ] **Security:** All 3 security tests pass

**Overall Status:** 🔴 PENDING TESTING

---

## 🐛 BUG REPORTING

If a test fails, document:

1. **Test Case #:** (e.g., Test Case 5)
2. **Expected Behavior:** (from test case)
3. **Actual Behavior:** (what happened)
4. **Steps to Reproduce:** (exact steps)
5. **Screenshots:** (if applicable)
6. **Environment:** (browser, OS, Supabase project)

**Bug Report Location:** GitHub Issues or `docs/BUGS_AUDIT_LOG_VIEWER.md`

---

## 📊 TEST RESULTS TEMPLATE

```
# Audit Log Viewer - Test Results
Date: YYYY-MM-DD
Tester: [Name]
Environment: [Dev/Staging/Production]

## Summary
- Total Tests: 18 (15 functional + 3 security)
- Passed: X / 18
- Failed: Y / 18
- Blocked: Z / 18

## Failed Tests
1. [Test Case #] - [Brief description of failure]
   - Root Cause: [Analysis]
   - Fix Status: [In Progress / Fixed / Deferred]

## Notes
[Any additional observations or concerns]

## Sign-off
✅ APPROVED FOR PRODUCTION
❌ REQUIRES FIXES

Approved By: [Name]
Date: YYYY-MM-DD
```

---

**Testing Protocol Version:** 1.0  
**Last Updated:** October 15, 2025  
**Next Review:** After first production deployment
