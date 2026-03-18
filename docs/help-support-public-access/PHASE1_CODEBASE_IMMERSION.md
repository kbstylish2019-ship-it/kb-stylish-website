# PHASE 1: CODEBASE IMMERSION - Help & Support Public Access

**Date**: January 26, 2026  
**Task**: Enable unauthenticated access to Help & Support page  
**Status**: ✅ COMPLETE

---

## 1.1 Architecture Documents Review

### Key Documents Reviewed:
- Universal AI Excellence Protocol v2.0
- Current support system implementation
- Database schema and RLS policies

---

## 1.2 Core Systems Mapped

### Current Support System Architecture

#### **Frontend Layer**
```
src/app/support/page.tsx (Server Component)
├── Requires authentication (redirects to /auth/login)
├── Fetches support_categories from database
└── Renders SupportForm component

src/components/support/SupportForm.tsx (Client Component)
├── Requires session/access_token
├── Calls Edge Function: support-ticket-manager/create
└── Validates form data client-side
```

#### **Database Layer**
```
Tables:
├── support_tickets (user_id NOT NULL, customer_email NOT NULL)
├── support_messages (ticket_id FK, user_id nullable)
├── support_categories (public read access via RLS)
└── support_attachments (ticket_id FK)

RLS Policies:
├── support_tickets_user_own: (user_id = auth.uid()) OR admin/support role
├── support_categories_public_read: is_active = true (✅ PUBLIC ACCESS)
├── support_messages_access: via ticket ownership
└── support_attachments_access: via ticket ownership
```

#### **RPC Functions**
```sql
create_support_ticket(
  p_category_id uuid,
  p_subject text,
  p_message_text text,
  p_priority text DEFAULT 'medium',
  p_order_reference text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER

Key Logic:
1. Checks auth.uid() - RETURNS ERROR if NULL ❌
2. Gets user email from auth.users
3. Validates inputs
4. Creates ticket with user_id
5. Creates initial message
```

#### **Edge Function**
```
supabase/functions/support-ticket-manager/
├── Endpoint: /create
├── Requires Authorization header
└── Calls create_support_ticket RPC
```

---

## 1.3 Current Blocking Points Identified

### 🚫 **BLOCKER 1: Page-Level Authentication**
**Location**: `src/app/support/page.tsx:46-50`
```typescript
if (userError || !user) {
  redirect('/auth/login?redirect=/support');
}
```
**Impact**: Unauthenticated users cannot even see the page

---

### 🚫 **BLOCKER 2: RPC Function Authentication Check**
**Location**: `create_support_ticket` function
```sql
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Authentication required',
    'code', 'AUTH_REQUIRED'
  );
END IF;
```
**Impact**: Cannot create tickets without auth.uid()

---

### 🚫 **BLOCKER 3: Database Schema Constraint**
**Location**: `support_tickets` table
```sql
user_id uuid NOT NULL REFERENCES auth.users(id)
```
**Impact**: Cannot insert tickets without a valid user_id

---

### 🚫 **BLOCKER 4: Client-Side Session Check**
**Location**: `src/components/support/SupportForm.tsx:75-79`
```typescript
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  setErrors({ general: 'Please log in to submit a support ticket' });
  return;
}
```
**Impact**: Form submission blocked without session

---

### 🚫 **BLOCKER 5: RLS Policy on support_tickets**
**Location**: Database RLS
```sql
support_tickets_user_own: 
  (user_id = auth.uid()) OR admin/support role
```
**Impact**: Cannot INSERT without auth.uid() matching user_id

---

## 1.4 Related Code Patterns

### Similar Public Access Patterns Found:
1. **Guest Cart System** - Allows unauthenticated users to add items
   - Uses `guest_id` instead of `user_id`
   - Has nullable user_id column
   - RLS allows guest access

2. **Product Browsing** - Public access to products
   - No authentication required
   - RLS allows SELECT for all users

3. **Order Tracking** - Public access with order ID
   - No authentication required
   - Uses order_id as identifier

---

## 1.5 LIVE Database State Verification

### ✅ Verified via Supabase MCP:

**Tables Exist:**
- support_tickets ✅
- support_messages ✅
- support_categories ✅
- support_attachments ✅

**RLS Policies Active:**
- support_categories_public_read ✅ (allows public SELECT)
- support_tickets_user_own ✅ (blocks public INSERT)
- support_messages_access ✅ (blocks public INSERT)

**RPC Functions Exist:**
- create_support_ticket ✅ (SECURITY DEFINER)
- add_support_message ✅ (SECURITY DEFINER)
- get_user_support_tickets ✅
- get_admin_support_tickets ✅

---

## 1.6 Key Insights

### ✅ What Works:
1. Support categories are already publicly readable
2. Edge Function infrastructure exists
3. Email collection is already in place (customer_email field)
4. Form validation is comprehensive

### ❌ What Blocks Public Access:
1. Page-level auth redirect
2. RPC function auth check
3. Database NOT NULL constraint on user_id
4. Client-side session check
5. RLS policy requires auth.uid()

### 💡 Critical Observation:
**The support_tickets table already has `customer_email` and `customer_name` fields!**
This suggests the system was designed to support non-authenticated submissions, but the implementation was never completed.

---

## 1.7 Data Flow Analysis

### Current Flow (Authenticated):
```
User visits /support
  ↓
Page checks auth → Redirect if not logged in ❌
  ↓
Fetch categories (public RLS ✅)
  ↓
User fills form
  ↓
SupportForm checks session ❌
  ↓
Calls Edge Function with access_token
  ↓
Edge Function calls create_support_ticket RPC
  ↓
RPC checks auth.uid() ❌
  ↓
Creates ticket with user_id
```

### Required Flow (Public):
```
User visits /support
  ↓
Page loads without auth check ✅
  ↓
Fetch categories (public RLS ✅)
  ↓
User fills form + provides email/name
  ↓
SupportForm submits without session ✅
  ↓
Calls Edge Function (or new RPC)
  ↓
Creates ticket with NULL user_id + email/name
  ↓
Success!
```

---

## 1.8 Security Considerations

### Current Security Model:
- RLS enforces user can only see their own tickets
- Admin/support roles can see all tickets
- SECURITY DEFINER functions bypass RLS safely

### Required Security for Public Access:
- Public users can CREATE tickets (no user_id)
- Public users CANNOT READ other tickets
- Email validation required
- Rate limiting needed (prevent spam)
- CAPTCHA consideration (future)

---

## 1.9 Existing Patterns to Follow

### Pattern: Guest Cart
```typescript
// Allows NULL user_id
// Uses guest_id for tracking
// RLS: (user_id = auth.uid() OR user_id IS NULL)
```

### Pattern: Order Tracking
```typescript
// Public access with order_id
// No authentication required
// Validates order_id instead
```

### Pattern to Use: **Hybrid Approach**
```typescript
// Allow NULL user_id for public submissions
// Require email + name for public users
// Authenticated users auto-fill from profile
// RLS: Allow INSERT with NULL user_id
```

---

## 1.10 Migration Files Review

### No existing migrations found for:
- Making user_id nullable
- Adding public INSERT RLS policy
- Creating public submission RPC

### Migrations Needed:
1. Alter support_tickets.user_id to nullable
2. Add RLS policy for public INSERT
3. Create/modify RPC for public submissions
4. Update Edge Function to handle public requests

---

## Summary

### Blockers Identified: 5
1. Page-level authentication redirect
2. RPC function auth.uid() check
3. Database user_id NOT NULL constraint
4. Client-side session validation
5. RLS policy requires auth.uid()

### Solution Approach: Surgical Fix
- Make user_id nullable
- Add public INSERT RLS policy
- Create new RPC or modify existing
- Remove auth checks from page/form
- Add email/name fields for public users

### Risk Level: LOW
- Minimal schema change
- No breaking changes for existing users
- Follows existing patterns (guest cart)
- Security maintained via RLS

---

**Phase 1 Status**: ✅ COMPLETE  
**Next Phase**: Expert Panel Consultation
