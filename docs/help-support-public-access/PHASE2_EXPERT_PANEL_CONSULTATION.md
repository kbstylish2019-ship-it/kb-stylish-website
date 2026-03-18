# PHASE 2: EXPERT PANEL CONSULTATION - Help & Support Public Access

**Date**: January 26, 2026  
**Task**: Enable unauthenticated access to Help & Support page  
**Status**: ✅ COMPLETE

---

## 👨‍💻 EXPERT 1: SENIOR SECURITY ARCHITECT

### Questions & Answers:

#### 1. What are the security implications of this change?

**Analysis**:
- **Current**: Only authenticated users can create tickets → Low spam risk
- **Proposed**: Public users can create tickets → Higher spam risk

**Implications**:
- ⚠️ **Spam Risk**: Malicious actors could flood the system with fake tickets
- ⚠️ **Email Harvesting**: Need to validate emails aren't being collected maliciously
- ⚠️ **Data Exposure**: Public users should NOT see other tickets
- ✅ **No PII Exposure**: Public users only provide email/name voluntarily

#### 2. Does this violate least-privilege principle?

**Answer**: NO
- Public users get ONLY INSERT permission on support_tickets
- They CANNOT read, update, or delete any tickets
- They CANNOT see other users' tickets
- Follows principle: "Minimum access needed to perform function"

#### 3. Can this be exploited (SQL injection, XSS, CSRF, etc.)?

**SQL Injection**: ✅ SAFE
- Using parameterized queries in RPC function
- SECURITY DEFINER with SET search_path
- Input validation in place

**XSS**: ✅ SAFE
- React automatically escapes output
- No dangerouslySetInnerHTML used
- Email/name sanitized before storage

**CSRF**: ⚠️ NEEDS ATTENTION
- Edge Function should validate origin
- Consider adding CSRF token for public submissions
- Rate limiting required

**Spam/DoS**: ⚠️ NEEDS MITIGATION
- No rate limiting currently
- No CAPTCHA
- Could be flooded with requests

#### 4. Are we exposing sensitive data?

**Answer**: NO
- Public users only provide: email, name, subject, message
- No access to other tickets
- No access to user database
- RLS prevents reading other tickets

#### 5. Is RLS properly enforced?

**Current RLS**: ❌ BLOCKS PUBLIC INSERT
```sql
support_tickets_user_own: 
  (user_id = auth.uid()) OR admin/support role
```

**Required RLS**: ✅ ALLOW PUBLIC INSERT
```sql
-- Allow INSERT with NULL user_id (public submissions)
CREATE POLICY support_tickets_public_insert
ON support_tickets
FOR INSERT
TO public
WITH CHECK (
  user_id IS NULL 
  AND customer_email IS NOT NULL 
  AND customer_name IS NOT NULL
);

-- Keep existing policy for authenticated users
-- Modify to allow NULL user_id for public tickets
CREATE POLICY support_tickets_user_read
ON support_tickets
FOR SELECT
TO public
USING (
  user_id = auth.uid() 
  OR user_has_role(auth.uid(), 'admin') 
  OR user_has_role(auth.uid(), 'support')
);
```

#### 6. Do we need audit logging?

**Answer**: YES (already exists)
- support_tickets has created_at, updated_at
- support_messages tracks all interactions
- Consider adding: IP address, user agent for public submissions

#### 7. Are JWTs properly validated?

**Answer**: N/A for public submissions
- Public submissions don't use JWT
- Authenticated submissions still validate JWT
- Edge Function should handle both cases

#### 8. Is rate limiting needed?

**Answer**: ⚠️ CRITICAL - YES!

**Recommendations**:
1. **Per-IP Rate Limit**: 5 tickets per hour
2. **Per-Email Rate Limit**: 10 tickets per day
3. **Global Rate Limit**: 1000 tickets per hour
4. **Consider**: CAPTCHA for public submissions (future)

**Implementation**:
- Use Supabase Edge Function with Deno KV for rate limiting
- Store: `rate_limit:support:ip:{ip}` → count + expiry
- Store: `rate_limit:support:email:{email}` → count + expiry

---

### 🔒 SECURITY RECOMMENDATIONS:

#### ✅ MUST HAVE (P0):
1. Add RLS policy for public INSERT with NULL user_id
2. Validate email format (regex + DNS check)
3. Sanitize all text inputs (trim, max length)
4. Add rate limiting (per-IP, per-email)
5. Validate origin in Edge Function (CORS)

#### ⚠️ SHOULD HAVE (P1):
1. Add CAPTCHA for public submissions
2. Log IP address + user agent for public tickets
3. Add honeypot field (spam detection)
4. Email verification (send confirmation link)

#### 💡 NICE TO HAVE (P2):
1. Akismet integration (spam detection)
2. Blocklist for known spam emails/IPs
3. Admin dashboard for spam management

---

## ⚡ EXPERT 2: PERFORMANCE ENGINEER

### Questions & Answers:

#### 1. Will this scale to 10M+ rows?

**Answer**: YES, with proper indexing

**Current Indexes**:
```sql
-- Check existing indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'support_tickets';
```

**Required Indexes**:
```sql
-- For admin queries (status, priority, created_at)
CREATE INDEX idx_support_tickets_status_created 
ON support_tickets(status, created_at DESC);

-- For user queries (user_id, created_at)
CREATE INDEX idx_support_tickets_user_created 
ON support_tickets(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- For email lookups (public tickets)
CREATE INDEX idx_support_tickets_email 
ON support_tickets(customer_email) 
WHERE user_id IS NULL;
```

#### 2. What's the query plan (EXPLAIN ANALYZE)?

**Current Query** (authenticated):
```sql
SELECT * FROM support_tickets 
WHERE user_id = 'xxx' 
ORDER BY created_at DESC;
```
**Expected**: Index scan on user_id ✅

**New Query** (public lookup by email):
```sql
SELECT * FROM support_tickets 
WHERE customer_email = 'xxx@example.com' 
AND user_id IS NULL
ORDER BY created_at DESC;
```
**Expected**: Index scan on customer_email ✅ (with new index)

#### 3. Are there N+1 queries?

**Answer**: NO
- Single INSERT for ticket
- Single INSERT for initial message
- Single INSERT for system message
- Total: 3 queries (acceptable)

#### 4. Can we use indices to optimize?

**Answer**: YES (see above)

#### 5. Should we cache this?

**Answer**: NO for writes, YES for reads

**Don't Cache**:
- Ticket creation (always fresh)
- Ticket updates (real-time)

**Do Cache**:
- Support categories (rarely change) → 1 hour TTL
- Response time info (static) → 24 hour TTL

#### 6. What happens under high load?

**Concerns**:
- Database connection pool exhaustion
- Edge Function cold starts
- RLS policy evaluation overhead

**Mitigations**:
- Use connection pooling (Supabase handles this)
- Keep Edge Function warm (periodic pings)
- Optimize RLS policies (indexed columns)

#### 7. Are there race conditions?

**Answer**: NO
- Each ticket creation is atomic
- No concurrent updates during creation
- UUID prevents ID collisions

#### 8. Is this operation atomic?

**Answer**: YES
- RPC function uses transaction (implicit)
- All INSERTs succeed or all fail
- No partial ticket creation

---

### ⚡ PERFORMANCE RECOMMENDATIONS:

#### ✅ MUST HAVE (P0):
1. Add indexes (status, user_id, email, created_at)
2. Set max_length on text fields (prevent huge payloads)
3. Add query timeout (prevent long-running queries)

#### ⚠️ SHOULD HAVE (P1):
1. Cache support_categories (1 hour TTL)
2. Monitor query performance (pg_stat_statements)
3. Add database query logging

#### 💡 NICE TO HAVE (P2):
1. Partition support_tickets by created_at (after 1M rows)
2. Archive old tickets (> 1 year) to separate table
3. Add read replicas for admin queries

---

## 🗄️ EXPERT 3: DATA ARCHITECT

### Questions & Answers:

#### 1. Is this schema normalized correctly?

**Answer**: YES
- support_tickets (parent)
- support_messages (child, FK to ticket)
- support_categories (lookup table)
- support_attachments (child, FK to ticket/message)

**Normalization**: 3NF ✅

#### 2. Are foreign keys and constraints in place?

**Current**:
```sql
user_id uuid NOT NULL REFERENCES auth.users(id)
```

**Required**:
```sql
user_id uuid NULL REFERENCES auth.users(id)
```

**Other Constraints**:
- ✅ category_id FK to support_categories
- ✅ ticket_id FK in support_messages
- ✅ CHECK constraints on status, priority

#### 3. What happens during migration?

**Migration Plan**:
```sql
BEGIN;

-- Step 1: Make user_id nullable
ALTER TABLE support_tickets 
ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add constraint for public tickets
ALTER TABLE support_tickets
ADD CONSTRAINT check_public_ticket_has_email
CHECK (
  (user_id IS NOT NULL) OR 
  (user_id IS NULL AND customer_email IS NOT NULL AND customer_name IS NOT NULL)
);

-- Step 3: Add RLS policy for public INSERT
CREATE POLICY support_tickets_public_insert
ON support_tickets
FOR INSERT
TO public
WITH CHECK (
  user_id IS NULL 
  AND customer_email IS NOT NULL 
  AND customer_name IS NOT NULL
  AND length(trim(customer_email)) > 0
  AND length(trim(customer_name)) > 0
);

-- Step 4: Add indexes
CREATE INDEX idx_support_tickets_email 
ON support_tickets(customer_email) 
WHERE user_id IS NULL;

CREATE INDEX idx_support_tickets_status_created 
ON support_tickets(status, created_at DESC);

COMMIT;
```

#### 4. Can we rollback safely?

**Answer**: YES

**Rollback Plan**:
```sql
BEGIN;

-- Remove indexes
DROP INDEX IF EXISTS idx_support_tickets_email;
DROP INDEX IF EXISTS idx_support_tickets_status_created;

-- Remove RLS policy
DROP POLICY IF EXISTS support_tickets_public_insert ON support_tickets;

-- Remove constraint
ALTER TABLE support_tickets
DROP CONSTRAINT IF EXISTS check_public_ticket_has_email;

-- Make user_id NOT NULL again (only if no NULL values exist)
-- WARNING: This will fail if public tickets exist
ALTER TABLE support_tickets 
ALTER COLUMN user_id SET NOT NULL;

COMMIT;
```

**Note**: Cannot rollback if public tickets already created. Need data migration first.

#### 5. Is data consistency maintained?

**Answer**: YES

**Consistency Rules**:
1. If user_id IS NULL → customer_email + customer_name REQUIRED
2. If user_id IS NOT NULL → customer_email + customer_name auto-filled
3. Every ticket has at least one message (initial message)
4. Status transitions are valid (open → in_progress → resolved → closed)

#### 6. Are there orphaned records possible?

**Answer**: NO

**Foreign Keys**:
- support_messages.ticket_id → support_tickets.id (CASCADE DELETE)
- support_attachments.ticket_id → support_tickets.id (CASCADE DELETE)
- support_tickets.user_id → auth.users.id (SET NULL on delete)

**Recommendation**: Change user_id FK to SET NULL instead of CASCADE
```sql
ALTER TABLE support_tickets
DROP CONSTRAINT support_tickets_user_id_fkey,
ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;
```

#### 7. Do we need cascading deletes?

**Answer**: YES (already in place)
- Delete ticket → Delete messages ✅
- Delete ticket → Delete attachments ✅
- Delete user → SET NULL on tickets (recommended)

#### 8. Is the data type appropriate?

**Answer**: YES
- user_id: uuid ✅
- customer_email: text ✅ (consider varchar(255))
- customer_name: text ✅ (consider varchar(255))
- subject: text ✅ (consider varchar(500))
- message_text: text ✅ (unlimited, appropriate)

---

### 🗄️ DATA ARCHITECTURE RECOMMENDATIONS:

#### ✅ MUST HAVE (P0):
1. Make user_id nullable
2. Add CHECK constraint (public tickets need email+name)
3. Change FK to SET NULL on user delete
4. Add indexes for performance

#### ⚠️ SHOULD HAVE (P1):
1. Add email validation constraint (regex)
2. Add max length constraints (prevent abuse)
3. Add created_by_ip column (audit trail)

#### 💡 NICE TO HAVE (P2):
1. Add is_public boolean column (explicit flag)
2. Add verified_email boolean (email verification)
3. Add spam_score column (spam detection)

---

## 🎨 EXPERT 4: FRONTEND/UX ENGINEER

### Questions & Answers:

#### 1. Is the UX intuitive?

**Current UX**: ❌ CONFUSING
- User clicks "Suggest a Product" → Redirected to login → Confused

**Proposed UX**: ✅ INTUITIVE
- User clicks "Suggest a Product" → Opens support form → Can submit immediately
- Clear indication: "No account needed"
- Email + name fields visible for public users

#### 2. Are loading states handled?

**Answer**: YES (already in SupportForm)
- Submitting state with spinner ✅
- Success state with confirmation ✅
- Error state with message ✅

#### 3. Are errors user-friendly?

**Current Errors**: ⚠️ TECHNICAL
- "Authentication required" → Confusing for public users

**Proposed Errors**: ✅ USER-FRIENDLY
- "Please provide your email and name"
- "Invalid email format"
- "Message too short (minimum 10 characters)"

#### 4. Is it accessible (WCAG 2.1)?

**Current**: ⚠️ NEEDS IMPROVEMENT
- Form labels exist ✅
- Error messages need aria-live ⚠️
- Focus management needs improvement ⚠️

**Required**:
```tsx
<div role="alert" aria-live="polite">
  {errors.email && <p>{errors.email}</p>}
</div>
```

#### 5. Does it work on mobile?

**Answer**: YES (Tailwind responsive classes)
- Form is responsive ✅
- Buttons are touch-friendly ✅
- Text inputs are appropriately sized ✅

#### 6. Are there race conditions in state?

**Answer**: NO
- Single form submission at a time
- isSubmitting flag prevents double-submit ✅
- State updates are sequential ✅

#### 7. Is the component tree optimized?

**Answer**: YES
- SupportForm is client component (interactive) ✅
- Page is server component (data fetching) ✅
- No unnecessary re-renders ✅

#### 8. Do we need optimistic updates?

**Answer**: NO
- Ticket creation is fast (< 1s)
- Success confirmation is important
- No need for optimistic UI

---

### 🎨 UX RECOMMENDATIONS:

#### ✅ MUST HAVE (P0):
1. Add email + name fields for public users
2. Show "No account needed" message
3. Add clear success confirmation
4. Improve error messages (user-friendly)

#### ⚠️ SHOULD HAVE (P1):
1. Add aria-live for errors
2. Add focus management (error → first field)
3. Add email format validation (client-side)
4. Add character counter for message

#### 💡 NICE TO HAVE (P2):
1. Add autosave to localStorage (prevent data loss)
2. Add "Sign in to track your ticket" CTA
3. Add email confirmation (send copy to user)
4. Add estimated response time indicator

---

## 🔬 EXPERT 5: PRINCIPAL ENGINEER (INTEGRATION & SYSTEMS)

### Questions & Answers:

#### 1. What's the complete end-to-end flow?

**Public User Flow**:
```
1. User visits /support (no auth required)
2. Page loads support_categories (public RLS)
3. User fills form (email, name, subject, message)
4. Client validates inputs
5. Client calls Edge Function (no auth token)
6. Edge Function validates inputs + rate limit
7. Edge Function calls create_support_ticket_public RPC
8. RPC creates ticket with NULL user_id
9. RPC creates initial message
10. RPC creates system message
11. Success response → Show confirmation
12. Optional: Send email confirmation to user
```

**Authenticated User Flow** (unchanged):
```
1. User visits /support (authenticated)
2. Page loads support_categories
3. User fills form (email/name auto-filled)
4. Client calls Edge Function (with auth token)
5. Edge Function calls create_support_ticket RPC
6. RPC creates ticket with user_id
7. Success response → Show confirmation
```

#### 2. Where can this break silently?

**Potential Silent Failures**:
1. ⚠️ Email not sent (if email notification fails)
2. ⚠️ Rate limit not enforced (if Deno KV fails)
3. ⚠️ Spam tickets created (if validation bypassed)
4. ⚠️ RLS policy not applied (if migration incomplete)

**Mitigations**:
1. Log all ticket creations
2. Monitor rate limit failures
3. Add spam detection
4. Test RLS policies thoroughly

#### 3. What are ALL the edge cases?

**Edge Cases**:
1. ✅ User submits with invalid email → Validate format
2. ✅ User submits with disposable email → Allow (for now)
3. ✅ User submits with very long message → Truncate/reject
4. ✅ User submits multiple times (spam) → Rate limit
5. ✅ User submits with XSS payload → Sanitize
6. ✅ User submits with SQL injection → Parameterized queries
7. ⚠️ User submits from blocked country → Consider geo-blocking
8. ⚠️ User submits with profanity → Consider content filter

#### 4. How do we handle failures?

**Failure Scenarios**:

**Database Failure**:
- RPC returns error → Show user-friendly message
- Log error for debugging
- Suggest alternative contact methods

**Edge Function Failure**:
- Network error → Retry with exponential backoff
- Timeout → Show "Please try again" message
- 500 error → Log and alert admin

**Rate Limit Exceeded**:
- Return 429 status
- Show "Too many requests, please try again later"
- Suggest alternative contact methods

#### 5. What's the rollback strategy?

**Rollback Plan**:
1. Revert frontend changes (re-add auth check)
2. Revert Edge Function changes
3. Drop RLS policy for public INSERT
4. Make user_id NOT NULL (if no public tickets)
5. Drop indexes

**Data Migration** (if public tickets exist):
```sql
-- Option 1: Delete public tickets
DELETE FROM support_tickets WHERE user_id IS NULL;

-- Option 2: Assign to system user
UPDATE support_tickets 
SET user_id = 'system-user-uuid' 
WHERE user_id IS NULL;
```

#### 6. Are there hidden dependencies?

**Dependencies**:
1. ✅ Supabase Auth (for authenticated users)
2. ✅ Supabase Database (RLS, RPC)
3. ✅ Supabase Edge Functions
4. ⚠️ Email service (for notifications) - NOT IMPLEMENTED
5. ⚠️ Deno KV (for rate limiting) - NOT IMPLEMENTED

#### 7. What breaks if this fails?

**Impact of Failure**:
- Public users cannot submit tickets → Use email/phone
- Authenticated users still work → No impact
- Admin can still manage tickets → No impact
- No data loss → Safe failure

#### 8. Is monitoring in place?

**Current Monitoring**: ⚠️ MINIMAL
- Database logs ✅
- Edge Function logs ✅
- Error tracking ❌
- Rate limit monitoring ❌
- Spam detection ❌

**Required Monitoring**:
1. Track public ticket creation rate
2. Track rate limit hits
3. Track validation failures
4. Track spam tickets (manual review)
5. Alert on unusual patterns

---

### 🔬 INTEGRATION RECOMMENDATIONS:

#### ✅ MUST HAVE (P0):
1. Add comprehensive error handling
2. Add logging for all public submissions
3. Test all edge cases
4. Add monitoring for public tickets

#### ⚠️ SHOULD HAVE (P1):
1. Add email notification to user (confirmation)
2. Add email notification to admin (new ticket)
3. Add rate limiting with Deno KV
4. Add spam detection (basic)

#### 💡 NICE TO HAVE (P2):
1. Add webhook for ticket creation (Slack/Discord)
2. Add analytics (track submission sources)
3. Add A/B testing (public vs auth-required)
4. Add feedback survey (after resolution)

---

## 📊 EXPERT PANEL SUMMARY

### 🔴 CRITICAL ISSUES (P0):
1. **Security**: Add rate limiting (per-IP, per-email)
2. **Security**: Validate email format + sanitize inputs
3. **Security**: Add RLS policy for public INSERT
4. **Data**: Make user_id nullable + add CHECK constraint
5. **Data**: Add indexes for performance
6. **UX**: Add email + name fields for public users
7. **Integration**: Add comprehensive error handling

### 🟡 IMPORTANT ISSUES (P1):
1. **Security**: Add CAPTCHA for public submissions
2. **Security**: Log IP address + user agent
3. **Performance**: Cache support_categories
4. **Data**: Add email validation constraint
5. **UX**: Improve error messages (user-friendly)
6. **Integration**: Add email notifications

### 🟢 NICE TO HAVE (P2):
1. **Security**: Akismet spam detection
2. **Performance**: Partition old tickets
3. **Data**: Add spam_score column
4. **UX**: Add autosave to localStorage
5. **Integration**: Add webhook notifications

---

## ✅ EXPERT PANEL APPROVAL

### Security Architect: ✅ APPROVED (with P0 fixes)
- Add rate limiting
- Validate inputs
- Add RLS policy

### Performance Engineer: ✅ APPROVED (with P0 fixes)
- Add indexes
- Set max lengths
- Monitor performance

### Data Architect: ✅ APPROVED (with P0 fixes)
- Make user_id nullable
- Add CHECK constraint
- Add indexes

### UX Engineer: ✅ APPROVED (with P0 fixes)
- Add email/name fields
- Improve error messages
- Add success confirmation

### Principal Engineer: ✅ APPROVED (with P0 fixes)
- Add error handling
- Add logging
- Test edge cases

---

**Phase 2 Status**: ✅ COMPLETE  
**Next Phase**: Consistency Check
