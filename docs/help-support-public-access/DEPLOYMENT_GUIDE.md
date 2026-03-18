# 🚀 DEPLOYMENT GUIDE - Help & Support Public Access

**Date**: January 26, 2026  
**Priority**: CRITICAL - Launch Blocker  
**Risk Level**: LOW  
**Estimated Time**: 15-30 minutes

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure:
- [ ] You have Supabase CLI installed and configured
- [ ] You have access to the production database
- [ ] You have tested locally (optional but recommended)
- [ ] You have a rollback plan ready
- [ ] You have notified the team (if applicable)

---

## 🎯 Deployment Steps

### STEP 1: Apply Database Migration

```bash
# Navigate to project root
cd D:\kb-stylish

# Verify Supabase connection
supabase status

# Apply the migration
supabase db push

# Expected output: Migration applied successfully
```

**Verification**:
```bash
# Check if migration was applied
supabase db diff

# Should show: No differences (all migrations applied)
```

**If migration fails**:
- Check error message
- Verify database connection
- Check if migration already applied
- Contact DBA if needed

---

### STEP 2: Deploy Edge Function

```bash
# Deploy support-ticket-manager function
supabase functions deploy support-ticket-manager

# Expected output: Function deployed successfully
```

**Verification**:
```bash
# List all functions
supabase functions list

# Verify support-ticket-manager is ACTIVE
```

**If deployment fails**:
- Check function syntax
- Verify Supabase CLI version
- Check network connection
- Try deploying again

---

### STEP 3: Deploy Frontend

```bash
# Build Next.js application
npm run build

# Expected output: Build completed successfully
```

**If build fails**:
- Check TypeScript errors
- Run `npm run lint`
- Fix any errors
- Try building again

**Deploy to hosting**:
```bash
# If using Vercel
vercel --prod

# If using other hosting, follow your deployment process
```

---

### STEP 4: Verify Deployment

#### Test 1: Public Submission ✅

1. Open browser in **incognito mode** (no authentication)
2. Navigate to: `https://your-domain.com/support`
3. Verify page loads without redirect
4. Fill form:
   - Email: `test@example.com`
   - Name: `Test User`
   - Subject: `Test public submission`
   - Message: `This is a test of public ticket submission`
5. Click "Submit Request"
6. Verify success message appears
7. Note the ticket ID

**Verify in Database**:
```sql
-- Check if ticket was created
SELECT id, user_id, customer_email, customer_name, subject
FROM support_tickets
WHERE customer_email = 'test@example.com'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: user_id should be NULL
```

---

#### Test 2: Authenticated Submission ✅

1. Log in to your account
2. Navigate to: `https://your-domain.com/support`
3. Verify email/name fields are NOT shown (auto-filled)
4. Fill form:
   - Subject: `Test authenticated submission`
   - Message: `This is a test of authenticated ticket submission`
5. Click "Submit Request"
6. Verify success message appears
7. Note the ticket ID

**Verify in Database**:
```sql
-- Check if ticket was created
SELECT id, user_id, customer_email, customer_name, subject
FROM support_tickets
WHERE subject = 'Test authenticated submission'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: user_id should NOT be NULL
```

---

#### Test 3: RLS Policy Enforcement ✅

**Test Public User Cannot Read Tickets**:
1. In incognito mode (not logged in)
2. Try to access: `https://your-domain.com/support/tickets`
3. Expected: Redirect to login OR empty list

**Test Authenticated User Can Read Own Tickets**:
1. Log in to account
2. Navigate to: `https://your-domain.com/support/tickets`
3. Expected: See only your own tickets

**Test Admin Can Read All Tickets**:
1. Log in as admin
2. Navigate to: `https://your-domain.com/admin/support`
3. Expected: See all tickets (including public submissions)

---

#### Test 4: Form Validation ✅

**Test Email Validation**:
1. Open `/support` (incognito)
2. Enter invalid email: `notanemail`
3. Try to submit
4. Expected: "Please enter a valid email address"

**Test Name Validation**:
1. Leave name empty
2. Try to submit
3. Expected: "Name is required"

**Test Subject Validation**:
1. Enter subject: `Hi`
2. Try to submit
3. Expected: "Subject must be at least 5 characters"

**Test Message Validation**:
1. Enter message: `Test`
2. Try to submit
3. Expected: "Message must be at least 10 characters"

---

### STEP 5: Monitor for Issues

**Check Logs**:
```bash
# Check Edge Function logs
supabase functions logs support-ticket-manager --tail

# Look for errors or warnings
```

**Check Database**:
```sql
-- Monitor public ticket creation rate
SELECT 
  COUNT(*) as public_tickets,
  DATE_TRUNC('hour', created_at) as hour
FROM support_tickets
WHERE user_id IS NULL
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;

-- Alert if > 100 tickets/hour (potential spam)
```

**Check Error Rates**:
- Monitor frontend error tracking (Sentry, etc.)
- Monitor Edge Function error rates
- Monitor database query performance

---

## 🔄 Rollback Plan

If critical issues are discovered:

### STEP 1: Revert Frontend

```bash
# Find the commit hash before changes
git log --oneline

# Revert the changes
git revert <commit-hash>

# Rebuild and deploy
npm run build
vercel --prod  # or your deployment command
```

---

### STEP 2: Revert Edge Function

```bash
# Checkout previous version
git checkout <previous-commit> supabase/functions/support-ticket-manager/

# Redeploy
supabase functions deploy support-ticket-manager

# Verify
supabase functions list
```

---

### STEP 3: Revert Database (ONLY if no public tickets exist)

```sql
-- WARNING: This will fail if public tickets exist!
-- Check first:
SELECT COUNT(*) FROM support_tickets WHERE user_id IS NULL;

-- If count is 0, proceed with rollback:
BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS idx_support_tickets_email;
DROP INDEX IF EXISTS idx_support_tickets_status_created;
DROP INDEX IF EXISTS idx_support_tickets_user_created;

-- Drop RLS policies
DROP POLICY IF EXISTS support_tickets_public_insert ON support_tickets;
DROP POLICY IF EXISTS support_tickets_user_read ON support_tickets;
DROP POLICY IF EXISTS support_tickets_user_update ON support_tickets;

-- Drop constraints
ALTER TABLE support_tickets 
DROP CONSTRAINT IF EXISTS check_public_ticket_has_contact_info;

ALTER TABLE support_tickets 
DROP CONSTRAINT IF EXISTS check_customer_email_format;

-- Drop tracking columns
ALTER TABLE support_tickets 
DROP COLUMN IF EXISTS submitted_from_ip;

ALTER TABLE support_tickets 
DROP COLUMN IF EXISTS submitted_user_agent;

-- Make user_id NOT NULL again
ALTER TABLE support_tickets 
ALTER COLUMN user_id SET NOT NULL;

-- Restore original FK constraint
ALTER TABLE support_tickets
DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey,
ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Restore original RPC function (from previous migration)
-- TODO: Add original function definition here

COMMIT;
```

**If public tickets exist**, you CANNOT rollback the database. Instead:
1. Revert frontend (blocks new public submissions)
2. Manually review and delete spam tickets
3. Consider data migration to system user

---

## 📊 Post-Deployment Monitoring

### Metrics to Track (First 24 Hours):

1. **Public Ticket Creation Rate**
   ```sql
   SELECT COUNT(*) FROM support_tickets 
   WHERE user_id IS NULL 
   AND created_at > NOW() - INTERVAL '1 hour';
   ```
   - Expected: 0-50 per hour
   - Alert if > 100 per hour

2. **Validation Failure Rate**
   - Check Edge Function logs for validation errors
   - Expected: < 10% of requests

3. **RLS Policy Violations**
   - Check database logs for permission errors
   - Expected: 0 violations

4. **Edge Function Performance**
   - Check response times
   - Expected: < 500ms average

5. **User Feedback**
   - Monitor support channels
   - Check for user complaints

---

## ✅ Success Criteria

Deployment is successful when:
- [x] Public users can submit tickets without login
- [x] Authenticated users can still submit tickets
- [x] Email/name validation works
- [x] RLS policies prevent unauthorized access
- [x] No errors in logs
- [x] Performance is acceptable (< 500ms)
- [x] No user complaints

---

## 🆘 Emergency Contacts

If critical issues occur:
- **Database Issues**: Contact DBA
- **Edge Function Issues**: Check Supabase status
- **Frontend Issues**: Check hosting status
- **Security Issues**: Immediately rollback and investigate

---

## 📝 Post-Deployment Tasks

After successful deployment:
- [ ] Update documentation
- [ ] Notify team of completion
- [ ] Monitor for 24 hours
- [ ] Write E2E tests (Phase 9)
- [ ] Plan rate limiting implementation (P1)
- [ ] Plan CAPTCHA implementation (P1)
- [ ] Update user guide/FAQ

---

## 🎉 Deployment Complete!

Once all tests pass and monitoring shows no issues, the deployment is complete. The Help & Support page now supports public access, removing the launch blocker.

**Estimated Impact**:
- Increased user engagement (product suggestions)
- Reduced friction for support requests
- Better user experience
- No breaking changes for existing users

---

**Deployment Guide Version**: 1.0  
**Last Updated**: January 26, 2026  
**Maintained By**: KB Stylish Engineering Team
