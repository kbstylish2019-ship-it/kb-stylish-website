# GOVERNANCE ENGINE - FRONTEND INTEGRATION TESTING PROTOCOL

**Date**: 2025-10-07  
**Objective**: Verify live dashboard integration with Edge Functions  
**Scope**: Vendor and Admin dashboards displaying real-time metrics  
**Status**: ✅ IMPLEMENTATION COMPLETE - READY FOR TESTING  

---

## EXECUTIVE SUMMARY

This testing protocol verifies that both Vendor and Admin dashboards:
1. ✅ Fetch live metrics from Edge Functions
2. ✅ Display accurate, real-time data
3. ✅ Enforce authentication and authorization
4. ✅ Handle error states gracefully
5. ✅ Provide excellent user experience

**Complete all 8 tests to authorize production deployment.**

---

## PRE-TESTING CHECKLIST

### **Environment Setup**
- [ ] Development server running (`npm run dev`)
- [ ] Supabase Edge Functions deployed and active
- [ ] Database has test data (orders, users, vendors)
- [ ] Test user accounts available:
  - Regular customer account
  - Vendor account with orders
  - Admin account with admin role

### **Configuration Verification**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` configured in `.env.local`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured in `.env.local`
- [ ] Edge Functions accessible at configured URL
- [ ] No console errors on application start

---

## TEST 1: VENDOR DASHBOARD - AUTHENTICATED VENDOR ACCESS

**Objective**: Verify vendor can access dashboard and see real-time metrics

### **Steps**
1. Open browser in incognito mode
2. Navigate to `http://localhost:3000/auth/login`
3. Login with vendor credentials
4. Navigate to `http://localhost:3000/vendor/dashboard`

### **Expected Results**
- ✅ Dashboard loads successfully
- ✅ **Today's Orders** displays real number from database
- ✅ **Monthly Earnings** displays NPR amount with proper formatting
- ✅ **Pending Balance** displays accurate payout amount
- ✅ **Platform Fees** displays 15% of GMV
- ✅ **Payout Snapshot** section shows 30-day breakdown
- ✅ **Quick Stats** displays order count and average order value
- ✅ **Last updated** timestamp visible at bottom of Quick Stats
- ✅ No console errors
- ✅ No "Failed to Load Dashboard" error

### **Data Accuracy Verification**
Open browser console and check logs:
```
[DASHBOARD API] Vendor stats fetched - Latency: XXms, Status: 200
```

Compare displayed metrics with database:
```sql
-- Run this query to verify accuracy
SELECT 
    DATE(created_at) as day,
    COUNT(*) as orders,
    SUM(total_cents) as gmv_cents
FROM orders
WHERE vendor_id = '<YOUR_VENDOR_ID>'
  AND status IN ('confirmed', 'shipped', 'delivered')
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at);
```

**Pass Criteria**: ✅ Dashboard metrics match database query results

---

## TEST 2: VENDOR DASHBOARD - UNAUTHENTICATED ACCESS

**Objective**: Verify authentication enforcement

### **Steps**
1. Open browser in incognito mode (or clear cookies)
2. Navigate directly to `http://localhost:3000/vendor/dashboard`

### **Expected Results**
- ✅ Redirects to `/auth/login?redirect=/vendor/dashboard`
- ✅ Login page loads
- ✅ After successful login, redirects back to vendor dashboard

**Pass Criteria**: ✅ No access without authentication

---

## TEST 3: VENDOR DASHBOARD - ERROR HANDLING

**Objective**: Verify graceful error handling when Edge Function fails

### **Steps**
1. Stop Supabase Edge Functions temporarily:
   ```powershell
   # Simulate Edge Function failure
   # Or: Temporarily modify .env.local with wrong SUPABASE_URL
   ```
2. Login as vendor
3. Navigate to vendor dashboard

### **Expected Results**
- ✅ Dashboard attempts to load
- ✅ **Error UI displayed** with red border
- ✅ Message: "Failed to Load Dashboard"
- ✅ Instruction: "Unable to fetch your dashboard metrics..."
- ✅ No white screen or crash
- ✅ Layout and navigation still functional

### **Recovery Test**
1. Restart Edge Functions (or fix .env.local)
2. Refresh dashboard

**Expected**: ✅ Dashboard loads correctly with real data

**Pass Criteria**: ✅ Graceful degradation without crashes

---

## TEST 4: ADMIN DASHBOARD - AUTHENTICATED ADMIN ACCESS

**Objective**: Verify admin can access dashboard and see platform-wide metrics

### **Steps**
1. Login with admin account
2. Navigate to `http://localhost:3000/admin/dashboard`

### **Expected Results**
- ✅ Dashboard loads successfully
- ✅ **Total Users** displays accurate count
- ✅ **Active Vendors** displays vendor count
- ✅ **Monthly Revenue** displays platform-wide GMV
- ✅ **Today's Orders** displays order count + revenue
- ✅ **Platform Overview (30 Days)** section shows:
  - Total GMV
  - Platform Fees (15%)
  - Total Orders
- ✅ **Today's Activity** section shows:
  - Orders count
  - Revenue amount
  - Last updated timestamp
- ✅ No console errors

### **Data Accuracy Verification**
Console logs should show:
```
[DASHBOARD API] Admin stats fetched - Latency: XXms, Status: 200
```

Compare with database:
```sql
-- Verify platform metrics
SELECT 
    COUNT(DISTINCT id) as total_users
FROM user_profiles;

SELECT 
    COUNT(DISTINCT id) as total_vendors
FROM user_profiles
WHERE id IN (SELECT user_id FROM user_roles WHERE role_name = 'vendor');

SELECT 
    SUM(total_cents) as gmv_cents,
    COUNT(*) as orders
FROM orders
WHERE status IN ('confirmed', 'shipped', 'delivered')
  AND created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**Pass Criteria**: ✅ Dashboard metrics match database aggregates

---

## TEST 5: ADMIN DASHBOARD - NON-ADMIN ACCESS BLOCKED

**Objective**: Verify non-admins cannot access admin dashboard

### **Steps**
1. Login with **regular customer** account (not admin)
2. Navigate to `http://localhost:3000/admin/dashboard`

### **Expected Results**
- ✅ Redirects to `/` (home page)
- ✅ No access to admin dashboard
- ✅ No error thrown

### **Test with Vendor Account**
1. Login with **vendor** account (not admin)
2. Navigate to admin dashboard

**Expected**: ✅ Redirects to home page

**Pass Criteria**: ✅ Only admins can access admin dashboard

---

## TEST 6: ADMIN DASHBOARD - JWT VERIFICATION

**Objective**: Verify defense-in-depth security (Edge Function + DB verification)

### **Steps**
1. Login as admin
2. Navigate to admin dashboard
3. Open browser DevTools → Network tab
4. Refresh dashboard
5. Inspect `admin-dashboard` request

### **Expected Results**
- ✅ Request to `/functions/v1/admin-dashboard`
- ✅ `Authorization: Bearer <JWT>` header present
- ✅ Response status: `200`
- ✅ Response body contains `success: true` and `data` object

### **Security Headers Verification**
Check that JWT is included:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Pass Criteria**: ✅ JWT properly transmitted to Edge Function

---

## TEST 7: DATA FRESHNESS - REAL-TIME UPDATES

**Objective**: Verify dashboards display fresh data (no stale cache)

### **Steps**
1. Note current metrics on vendor dashboard
2. Create a new test order in the system:
   ```sql
   -- Insert test order
   INSERT INTO orders (user_id, vendor_id, total_cents, status, created_at)
   VALUES (
     '<customer_id>', 
     '<vendor_id>', 
     5000, 
     'confirmed', 
     NOW()
   );
   ```
3. Refresh vendor dashboard
4. Check if order count incremented

### **Expected Results**
- ✅ **Today's Orders** count increased by 1
- ✅ **Today's Revenue** increased by NPR 50
- ✅ Dashboard reflects new order immediately
- ✅ No caching issues

**Alternative Test**: Wait 60 seconds and verify auto-refresh (if implemented)

**Pass Criteria**: ✅ Dashboard shows latest data on refresh

---

## TEST 8: CROSS-BROWSER COMPATIBILITY

**Objective**: Verify dashboards work across browsers

### **Browsers to Test**
- [ ] Google Chrome (latest)
- [ ] Microsoft Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if available)

### **Test for Each Browser**
1. Login as vendor
2. Navigate to vendor dashboard
3. Verify metrics display correctly
4. Check console for errors

### **Expected Results**
- ✅ Dashboard loads in all browsers
- ✅ Metrics display correctly
- ✅ No layout issues
- ✅ No JavaScript errors

**Pass Criteria**: ✅ Works in all major browsers

---

## PERFORMANCE BENCHMARKS

### **Latency Targets**

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Edge Function Response | <300ms | ___ ms | ⬜ |
| Dashboard First Paint | <1s | ___ ms | ⬜ |
| Dashboard Interactive | <2s | ___ ms | ⬜ |
| Full Page Load | <3s | ___ ms | ⬜ |

### **How to Measure**
1. Open DevTools → Network tab
2. Refresh dashboard
3. Note timing for:
   - `admin-dashboard` or `vendor-dashboard` request
   - DOMContentLoaded event
   - Load event

**Pass Criteria**: ✅ All metrics within target ranges

---

## ERROR SCENARIOS MATRIX

| Scenario | Expected Behavior | Test Status |
|----------|-------------------|-------------|
| **No authentication** | Redirect to login | ⬜ |
| **Non-admin accessing admin** | Redirect to home | ⬜ |
| **Edge Function timeout** | Error UI displayed | ⬜ |
| **Invalid JWT** | Redirect to login | ⬜ |
| **Edge Function returns 500** | Error UI displayed | ⬜ |
| **Network offline** | Error UI displayed | ⬜ |

---

## VISUAL REGRESSION CHECKLIST

### **Vendor Dashboard**
- [ ] Stat cards display with proper spacing
- [ ] Icons render correctly (BarChart3, Wallet, Package, TrendingUp)
- [ ] Numbers formatted with commas (e.g., NPR 2,45,000)
- [ ] **Live data** badge visible on stat cards
- [ ] Payout snapshot grid layout correct (3 columns)
- [ ] Quick Stats section displays timestamp
- [ ] No layout shifts during loading
- [ ] Colors match design system (gold accents, white/10 borders)

### **Admin Dashboard**
- [ ] 4-column stat grid on desktop
- [ ] Platform Overview section spans 2 columns
- [ ] Today's Activity section displays in sidebar
- [ ] All monetary values show "NPR" prefix
- [ ] User Management section shows link to /admin/users
- [ ] No overlapping text or truncated values

---

## ACCESSIBILITY TESTING

### **Keyboard Navigation**
- [ ] Tab through all interactive elements
- [ ] Focus indicators visible
- [ ] Can navigate without mouse

### **Screen Reader**
- [ ] Stat card titles announced correctly
- [ ] Values announced with context (e.g., "Today's Orders: 5")
- [ ] Links have descriptive text

### **Color Contrast**
- [ ] Text readable on backgrounds
- [ ] Error messages meet WCAG AA standards

---

## PRODUCTION READINESS CHECKLIST

- [ ] All 8 tests passed
- [ ] Performance benchmarks met
- [ ] Error scenarios handled gracefully
- [ ] Data accuracy verified against database
- [ ] Security (auth + authorization) verified
- [ ] Cross-browser compatibility confirmed
- [ ] Visual regression checks passed
- [ ] Accessibility guidelines met
- [ ] No console errors in production build
- [ ] Environment variables configured for production

---

## ROLLBACK PROCEDURE

If critical issues found during testing:

1. **Revert Dashboard Pages**
   ```bash
   git checkout HEAD~1 src/app/vendor/dashboard/page.tsx
   git checkout HEAD~1 src/app/admin/dashboard/page.tsx
   ```

2. **Remove API Client Functions**
   ```bash
   git checkout HEAD~1 src/lib/apiClient.ts
   ```

3. **Redeploy Previous Version**
   ```bash
   npm run build
   npm run start
   ```

4. **Verify Rollback**
   - Dashboards show mock data again
   - No errors in console
   - Users can still access dashboards

---

## POST-DEPLOYMENT MONITORING

### **Metrics to Track (First 24 Hours)**
- Dashboard load times (P50, P95, P99)
- Edge Function error rates
- Authentication failures
- User feedback/support tickets

### **Success Criteria**
- ✅ Dashboard load times <2s (P95)
- ✅ Edge Function error rate <0.1%
- ✅ Zero authentication bypass incidents
- ✅ No critical bugs reported

---

## CONCLUSION

Complete all 8 tests and checklists above. Upon successful completion:

**✅ PHASE 6 COMPLETE - DASHBOARDS ACTIVATED**

The live dashboard integration brings real-time, role-gated analytics to end users with:
- ✅ **Perfect Authentication**: SSR with proper redirects
- ✅ **Perfect Authorization**: Admin role verification
- ✅ **Live Data**: Real-time metrics from Edge Functions
- ✅ **Graceful Errors**: No crashes, user-friendly error states
- ✅ **Production Performance**: <2s load times

**The Governance Engine is now fully operational from database to frontend.**

---

**Testing Completed By**: _________________  
**Date**: _________________  
**Production Deployment Authorized**: ⬜ YES / ⬜ NO  
