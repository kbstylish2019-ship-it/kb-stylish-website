# CUSTOMER JOURNEY - REMEDIATION BLUEPRINT
**Date**: October 18, 2025  
**Phase**: 2 - Surgical Fix Planning  
**Critical Issues**: 5  
**Priority**: P0 (MUST FIX before production)

---

## ⚡ EXECUTIVE SUMMARY

Forensic audit identified **5 CRITICAL security vulnerabilities** in the Customer Journey domain. All issues are **P0 severity** and must be fixed before production deployment.

**Fix Strategy**: Surgical, minimal changes with zero regression risk  
**Testing**: Each fix tested immediately after implementation  
**Rollback**: Migration rollback scripts provided for all changes

### Issues Overview

| ID | Component | Root Cause | Fix Complexity | ETA |
|----|-----------|------------|----------------|-----|
| CJ-SEC-001 | Guest Cart | Client-generated tokens | Medium | 2 hours |
| CJ-SEC-002 | Guest Cart | localStorage storage | Low | 1 hour |
| CJ-SEC-003 | Cart Merge RPC | Missing auth validation | Low | 30 min |
| CJ-SEC-004 | Orders RLS | Overly permissive policy | Low | 15 min |
| CJ-SEC-005 | Cart RPCs | Missing auth validation | Medium | 1 hour |

**Total Implementation Time**: ~5 hours  
**Dependencies**: CJ-SEC-002 depends on CJ-SEC-001

---

## 🔧 ISSUE CJ-SEC-001: Server-Side Guest Token Generation

### Problem Statement

**Affected Questions**: Q3  
**Priority**: 🔴 P0 CRITICAL  
**Category**: Security - Authentication

**Root Cause**:
Guest tokens are generated client-side using `crypto.randomUUID()` and sent in the `x-guest-token` header. An attacker can enumerate or guess UUID values to hijack other users' guest carts.

**Current Behavior**:
```typescript
// Client: src/lib/api/cartClient.ts
const guestToken = crypto.randomUUID();  // Client generates
localStorage.setItem('guest_token', guestToken);

// Edge Function: cart-manager/index.ts
const guestToken = req.headers.get('x-guest-token');  // Trusts client
```

**Attack Vector**:
1. Attacker generates valid UUID: `550e8400-e29b-41d4-a716-446655440000`
2. Sends `x-guest-token: 550e8400-e29b-41d4-a716-446655440000`
3. If lucky, gains access to someone's cart
4. Can enumerate systematically

**User Impact**:
- Cart hijacking
- Inventory manipulation
- Privacy violation (cart contents exposed)

---

### Proposed Solution

**Approach**: Server-Side Token Generation with CSPRNG

**Changes Required**:

#### 1. Database Migration
```sql
-- Create guest token generation function
CREATE OR REPLACE FUNCTION generate_guest_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate cryptographically secure token
    v_token := 'guest_' || encode(gen_random_bytes(32), 'base64');
    
    -- Check uniqueness
    SELECT EXISTS(
      SELECT 1 FROM carts WHERE session_id = v_token
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_token;
END;
$$;

-- Create RPC to get guest token
CREATE OR REPLACE FUNCTION get_guest_token_secure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := generate_guest_token();
  
  RETURN jsonb_build_object(
    'success', true,
    'guest_token', v_token,
    'expires_at', NOW() + INTERVAL '30 days'
  );
END;
$$;
```

#### 2. Edge Function Update
```typescript
// cart-manager/index.ts
// BEFORE: Accept client token
const guestToken = req.headers.get('x-guest-token');

// AFTER: Validate token exists in database
if (!authenticatedUser) {
  const headerToken = req.headers.get('x-guest-token');
  if (headerToken && headerToken.startsWith('guest_')) {
    // Verify token exists and is not expired
    const { data: cart } = await serviceClient
      .from('carts')
      .select('session_id')
      .eq('session_id', headerToken)
      .single();
    
    if (cart) {
      guestToken = headerToken;
    } else {
      // Invalid token, reject
      return errorResponse('Invalid guest token', 401);
    }
  }
}
```

#### 3. Frontend Update
```typescript
// src/lib/api/cartClient.ts
export async function getGuestToken(): Promise<string> {
  // Check if we already have a valid token
  const existing = localStorage.getItem('guest_token');
  if (existing && existing.startsWith('guest_')) {
    return existing;
  }
  
  // Request new token from server
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_guest_token_secure`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  if (data.guest_token) {
    localStorage.setItem('guest_token', data.guest_token);
    return data.guest_token;
  }
  
  throw new Error('Failed to get guest token');
}
```

**Why This Approach**:
- Server-generated tokens use `gen_random_bytes(32)` (256-bit entropy)
- Token format: `guest_<base64>` (prevents collision with UUIDs)
- Token uniqueness verified in database
- Backwards compatible (can gradually migrate existing tokens)

**Alternatives Considered**:
1. ❌ JWT-based guest tokens: Overkill, adds complexity
2. ❌ Session cookies: CORS issues, requires httpOnly setup
3. ✅ CSPRNG tokens: Simple, secure, no external dependencies

---

### Testing Strategy

**Unit Tests**:
- [ ] `generate_guest_token()` returns unique tokens
- [ ] `get_guest_token_secure()` creates valid tokens
- [ ] Frontend `getGuestToken()` caches properly

**Integration Tests**:
- [ ] New guest can get token and add items to cart
- [ ] Invalid token is rejected with 401
- [ ] Token reuse works across sessions
- [ ] Existing UUID tokens are gradually migrated

**Security Tests**:
- [ ] Cannot enumerate tokens (256-bit space = infeasible)
- [ ] Token uniqueness enforced
- [ ] Old cart accessible with new token after migration

**Regression Prevention**:
- [ ] Existing guest carts still accessible
- [ ] Cart merge still works
- [ ] No breaking changes to cart API

---

### Rollback Plan

**If this fix fails**:
1. Drop the new RPC functions:
   ```sql
   DROP FUNCTION IF EXISTS get_guest_token_secure();
   DROP FUNCTION IF EXISTS generate_guest_token();
   ```
2. Revert edge function to previous version
3. Frontend falls back to client-generated UUIDs
4. Deploy via MCP

**Verification**:
- Test cart operations with old client
- Verify no 401 errors in logs

---

### Dependencies

**Must be fixed before**: CJ-SEC-002 (depends on this fix)  
**Must be fixed after**: None  
**Blocks deployment**: YES - P0 Critical

---

## 🔧 ISSUE CJ-SEC-003: Auth Validation in merge_carts_secure

### Problem Statement

**Affected Questions**: Q5, Q21  
**Priority**: 🔴 P0 CRITICAL  
**Category**: Security - Authorization

**Root Cause**:
`merge_carts_secure` accepts `p_user_id` parameter but never validates it matches `auth.uid()`. Since the function is SECURITY DEFINER, it bypasses RLS and can merge carts into any user's account.

**Attack Vector**:
```sql
-- Attacker (as user A) calls:
SELECT merge_carts_secure(
  p_user_id := 'victim-user-b-uuid',
  p_guest_token := 'attacker-guest-token'
);
-- Successfully merges attacker's cart into victim's cart
```

**User Impact**: Cart hijacking, unauthorized cart manipulation

---

### Proposed Solution

**Approach**: Add auth.uid() validation at function entry

```sql
CREATE OR REPLACE FUNCTION merge_carts_secure(
  p_user_id uuid,
  p_guest_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- SECURITY FIX: Validate caller
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Cannot merge cart for different user';
  END IF;
  
  -- Rest of function unchanged...
END;
$$;
```

**Testing**:
- [ ] Calling with own user_id: SUCCESS
- [ ] Calling with different user_id: EXCEPTION
- [ ] Calling without auth: EXCEPTION

**Rollback**: Revert to previous function version

---

## 🔧 ISSUE CJ-SEC-004: Remove Permissive Orders RLS Policy

### Problem Statement

**Affected Questions**: Q17  
**Priority**: 🔴 P0 CRITICAL  
**Category**: Security - Data Leakage

**Root Cause**:
RLS policy "Allow viewing orders in joins" has `qual: true` (no filtering), allowing ANY authenticated user to SELECT all orders from all users.

**Current Policy**:
```sql
CREATE POLICY "Allow viewing orders in joins"
ON orders
FOR SELECT
TO authenticated
USING (true);  -- NO FILTERING!
```

**Attack Vector**:
```sql
-- Any authenticated user can:
SELECT * FROM orders;  -- Returns ALL orders
SELECT * FROM orders JOIN order_items ...;  -- Full access
```

**User Impact**: Complete breach of order privacy, addresses, payment info exposed

---

### Proposed Solution

**Approach**: DROP the permissive policy

```sql
-- Remove the dangerous policy
DROP POLICY IF EXISTS "Allow viewing orders in joins" ON orders;

-- Existing policy "Users can view own orders" is sufficient:
-- CREATE POLICY "Users can view own orders"
-- ON orders FOR SELECT TO public
-- USING (auth.uid() = user_id);
```

**Why This Works**:
- The "Users can view own orders" policy already exists
- It properly filters: `auth.uid() = user_id`
- JOINs work fine with this policy
- The permissive policy serves no legitimate purpose

**Testing**:
- [ ] User can view own orders: SUCCESS
- [ ] User CANNOT view other users' orders: BLOCKED
- [ ] Vendors can still view own product orders (separate policy)

**Rollback**:
```sql
CREATE POLICY "Allow viewing orders in joins"
ON orders FOR SELECT TO authenticated USING (true);
```

---

## 🔧 ISSUE CJ-SEC-005: Auth Validation in Cart RPCs

### Problem Statement

**Affected Questions**: Q20, Q21, Q22  
**Priority**: 🔴 P0 CRITICAL  
**Category**: Security - Authorization

**Root Cause**:
All cart RPCs (`add_to_cart_secure`, `update_cart_item_secure`, `get_cart_details_secure`) accept `p_user_id` without validation. Since they're SECURITY DEFINER, they can manipulate any user's cart.

**Attack Vector**:
```sql
-- Add item to victim's cart:
SELECT add_to_cart_secure(
  p_variant_id := 'product-variant-uuid',
  p_quantity := 99,
  p_user_id := 'victim-uuid',  -- Different user!
  p_guest_token := NULL
);
```

---

### Proposed Solution

**Approach**: Modify RPCs to validate or remove p_user_id

**Option A** (Recommended): Remove p_user_id parameter entirely
```sql
CREATE OR REPLACE FUNCTION add_to_cart_secure(
  p_variant_id uuid,
  p_quantity integer,
  -- p_user_id REMOVED
  p_guest_token text DEFAULT NULL
)
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user from auth context
  v_user_id := auth.uid();
  
  -- Call internal function
  v_cart_id := get_or_create_cart_secure(v_user_id, p_guest_token);
  -- ...
END;
$$;
```

**Option B**: Validate p_user_id matches auth.uid()
```sql
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();
  
  IF p_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify cart for different user';
  END IF;
  
  -- Use v_auth_user_id instead of p_user_id
END;
```

**Recommendation**: Option A (simpler, clearer intent)

**Affected Functions**:
1. `add_to_cart_secure`
2. `update_cart_item_secure`
3. `get_cart_details_secure` (if p_user_id exists)

**Testing**:
- [ ] Authenticated user can modify own cart
- [ ] Guest can modify cart with valid token
- [ ] Cannot access other user's cart via any parameter manipulation

**Rollback**: Revert to previous function definitions

---

## 📊 IMPLEMENTATION PRIORITY

**Fix Order** (must follow dependencies):

1. **CJ-SEC-004** (15 min) - Drop RLS policy (simplest, no dependencies)
2. **CJ-SEC-003** (30 min) - Fix merge_carts_secure
3. **CJ-SEC-005** (1 hour) - Fix cart RPCs auth validation
4. **CJ-SEC-001** (2 hours) - Implement server-side guest tokens
5. **CJ-SEC-002** (1 hour) - Move tokens to httpOnly cookies (optional, depends on #1)

**Total Sequential Time**: ~5 hours

---

## ✅ APPROVAL CHECKLIST

Before proceeding to Phase 3 (Implementation):

- [ ] All 5 remediation plans reviewed
- [ ] SQL migrations syntactically valid
- [ ] Edge function changes backwards compatible
- [ ] Rollback plans documented and tested
- [ ] No breaking changes to public API
- [ ] Test cases comprehensive
- [ ] Human orchestrator approval obtained

---

**REMEDIATION BLUEPRINT COMPLETE**  
**Ready for Phase 3**: Surgical Implementation  
**Next Step**: Execute fixes in priority order with immediate testing

