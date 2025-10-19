# 🔬 DEEP INVESTIGATION PROMPT: Booking Cart Persistence Bug

> **📌 NOTE**: This is a specific application of the **[UNIVERSAL AI EXCELLENCE PROTOCOL](./UNIVERSAL_AI_EXCELLENCE_PROMPT.md)**.  
> For general-purpose tasks, use the Universal Protocol instead.  
> This document shows how the protocol was applied to a specific bug investigation.

---

## INSTRUCTION TO AI ASSISTANT

You are tasked with solving a **critical production bug** in a Next.js + Supabase e-commerce platform that handles both physical products and service bookings in a unified cart system.

**⚠️ CRITICAL DIRECTIVE**: 

**DO NOT PROPOSE SOLUTIONS IMMEDIATELY.**

Instead, you MUST:

1. **INVESTIGATE DEEPLY** - Spend significant time understanding the complete architecture
2. **GATHER EVIDENCE** - Read code, check database state, examine logs
3. **IDENTIFY INCONSISTENCIES** - Find hidden bugs and architectural gaps
4. **CONSULT EXPERTS** - Use the 3-expert panel method to validate findings
5. **ONLY THEN** - Propose a comprehensive, surgical fix

---

## 🎯 THE PROBLEM

**User Report**: 
> "After placing an order and completing payment, products get cleared from the cart but service bookings remain visible. When I try to checkout again, it shows more money than what's actually in the cart. Sometimes products I add don't sync to the server at all."

**Business Impact**:
- Failed checkout attempts (revenue loss)
- Incorrect cart totals (customer confusion)
- Phantom bookings displaying (trust issues)
- State desynchronization between client and server

---

## 📚 REQUIRED READING

Before doing ANYTHING, you MUST thoroughly read:

1. **`docs/BOOKING_CART_PERSISTENCE_FORENSIC_AUDIT.md`** - Complete forensic analysis
2. **`src/lib/store/decoupledCartStore.ts`** - Main cart state management
3. **`src/lib/store/bookingPersistStore.ts`** - Booking localStorage persistence
4. **`src/lib/api/cartClient.ts`** - Cart API client
5. **`src/app/payment/callback/page.tsx`** - Payment return handler
6. **`supabase/functions/cart-manager/index.ts`** - Cart operations Edge Function
7. **`supabase/functions/create-order-intent/index.ts`** - Order creation Edge Function

---

## 🔍 INVESTIGATION METHODOLOGY

### PHASE 1: DEEP UNDERSTANDING (Mandatory - 60 minutes minimum)

You must build a complete mental model by:

#### 1. Architecture Mapping
```
Create a detailed data flow diagram showing:
- Where cart state lives (server, localStorage, Zustand)
- How state moves between layers
- Who is the source of truth for each data type
- All synchronization points
- All async operations and their completion guarantees
```

#### 2. Code Analysis
```
For EACH file in the cart system:
- Read the ENTIRE file, not just excerpts
- Note all state mutations
- Identify all async operations
- Track error handling paths
- Document side effects (localStorage, API calls, etc.)
```

#### 3. Database Investigation
```sql
-- Execute these queries to understand current state:

-- 1. Check user's cart items
SELECT ci.*, p.name, pv.sku 
FROM cart_items ci
JOIN carts c ON c.id = ci.cart_id
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
WHERE c.user_id = '{USER_ID}';

-- 2. Check booking reservations
SELECT * FROM booking_reservations
WHERE customer_user_id = '{USER_ID}'
ORDER BY created_at DESC;

-- 3. Check confirmed bookings
SELECT * FROM bookings
WHERE customer_user_id = '{USER_ID}'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Check recent orders
SELECT 
    order_number,
    status,
    total_amount,
    metadata->>'booking_items_count' as bookings,
    metadata->>'items_count' as products,
    created_at
FROM orders
WHERE user_id = '{USER_ID}'
ORDER BY created_at DESC
LIMIT 3;

-- 5. Test the RPC function
SELECT public.get_cart_details_secure(
    '{USER_ID}'::UUID,
    NULL
);
```

#### 4. State Transition Analysis
```
Map EVERY state transition in the cart lifecycle:

1. User adds product → What changes where?
2. User adds booking → What changes where?
3. User proceeds to checkout → What reads what?
4. Payment initiated → What changes where?
5. Payment confirmed → What changes where?
6. Order created → What changes where?
7. User returns to site → What syncs how?
8. Page refresh → What persists where?

For EACH transition, document:
- Source state
- Trigger event
- Operations performed (in order)
- Async operations and their completion
- Error handling paths
- Final state
- Validation checks
```

#### 5. Identify Hidden Assumptions
```
List ALL assumptions in the codebase:
- "syncWithServer() will complete before navigation"
- "localStorage will persist immediately"
- "Empty array clears localStorage"
- "Booking reservations auto-expire"
- "React will re-render when Zustand state updates"
- etc.

Then TEST each assumption.
```

---

### PHASE 2: THE 3-EXPERT PANEL (Mandatory)

Before proposing ANY solution, you must consult 3 virtual experts:

#### 👨‍💻 Expert 1: Senior Frontend Architect (React/State Management)
**Perspective**: State management, async operations, React lifecycle

**Questions to Ask**:
1. Is there a single source of truth for cart state?
2. Can localStorage and Zustand state get out of sync?
3. Does `syncWithServer()` have race conditions?
4. Will React re-render when state updates?
5. Are there optimistic updates that might show stale data?
6. Is localStorage cleared properly on empty arrays?
7. What happens if user navigates away during async operations?

**Expert Must Analyze**:
- `decoupledCartStore.ts` state mutations
- `bookingPersistStore.ts` persistence logic
- `CartInitializer.tsx` initialization flow
- `payment/callback/page.tsx` sync timing

#### 🔒 Expert 2: Backend/Database Engineer (Supabase/PostgreSQL)
**Perspective**: Data integrity, transactions, database state

**Questions to Ask**:
1. Are booking reservations properly cleaned up after order confirmation?
2. Do expired reservations auto-delete or need manual cleanup?
3. Is `get_cart_details_secure()` returning correct data?
4. Can cart_items and booking_reservations get orphaned?
5. Are there race conditions in `reserve_inventory_for_payment()`?
6. Do database triggers exist that might interfere?
7. Is there a background job for cleanup?

**Expert Must Analyze**:
- `get_cart_details_secure()` SQL function
- `confirm_booking_reservation()` implementation
- `reserve_inventory_for_payment()` atomicity
- Database foreign keys and cascades
- RLS policies on cart tables

#### 🎭 Expert 3: Integration/System Architect (Full Stack Flow)
**Perspective**: End-to-end flow, integration points, edge cases

**Questions to Ask**:
1. What is the COMPLETE flow from "add to cart" to "order confirmed"?
2. Where can this flow break without throwing errors?
3. Are there silent failures in API calls?
4. What happens if Edge Functions timeout?
5. Is payment callback guaranteed to complete before user navigation?
6. Can cart state be in an inconsistent state during checkout?
7. What happens on page refresh mid-checkout?

**Expert Must Analyze**:
- Payment callback flow
- Edge Function response handling
- Error recovery mechanisms
- Async operation guarantees
- State consistency checks

---

### PHASE 3: EVIDENCE GATHERING (Test Everything)

You MUST perform these tests before proposing solutions:

#### Test 1: localStorage Behavior
```javascript
// In browser console
const store = useBookingPersistStore.getState();

// Test 1: Save empty array
store.saveBookings([]);
console.log('After saving []:', localStorage.getItem('kb-stylish-bookings'));

// Test 2: Does it actually clear?
store.saveBookings([{id: '123', service_name: 'Test'}]);
console.log('After adding item:', localStorage.getItem('kb-stylish-bookings'));
store.saveBookings([]);
console.log('After clearing:', localStorage.getItem('kb-stylish-bookings'));
```

#### Test 2: syncWithServer() Completion
```javascript
// Add to payment/callback/page.tsx
console.log('=== SYNC START ===');
console.log('State before:', useDecoupledCartStore.getState());
await syncWithServer();
console.log('State after:', useDecoupledCartStore.getState());
console.log('localStorage:', localStorage.getItem('kb-stylish-bookings'));
console.log('=== SYNC END ===');
```

#### Test 3: Database State After Order
```sql
-- Run IMMEDIATELY after order confirmation
SELECT 
    'cart_items' as table_name,
    COUNT(*) as count
FROM cart_items ci
JOIN carts c ON c.id = ci.cart_id
WHERE c.user_id = '{USER_ID}'

UNION ALL

SELECT 
    'booking_reservations',
    COUNT(*)
FROM booking_reservations
WHERE customer_user_id = '{USER_ID}'
  AND status = 'reserved';
```

#### Test 4: Edge Function Logs
```javascript
// Check recent Edge Function logs for create-order-intent and cart-manager
// Look for errors, warnings, or unexpected behavior
```

#### Test 5: Full E2E Cart Flow
```
Perform this exact sequence and document state at EACH step:

1. Clear all localStorage
2. Clear database cart (DELETE FROM cart_items)
3. Add 1 product to cart
   - Check localStorage
   - Check database
   - Check UI
4. Add 1 booking
   - Check localStorage (both stores)
   - Check database (booking_reservations)
   - Check UI
5. Navigate to checkout
   - Check cart totals
   - Check server-side cart fetch
6. Initiate payment (use test mode)
7. Complete payment
8. Return to callback page
   - Watch console logs
   - Monitor state changes
9. After redirect
   - Check localStorage
   - Check database
   - Check UI
10. Refresh page
    - Check if cart is truly empty everywhere
```

---

### PHASE 4: ROOT CAUSE IDENTIFICATION

After completing all investigation, you must identify:

#### Primary Root Cause
- The ONE fundamental issue causing the bug
- Why it exists (architectural gap? coding error? assumption violation?)
- How it propagates to user-visible symptoms

#### Secondary Issues
- Related bugs discovered during investigation
- Architectural weaknesses that allow this class of bug
- Missing validation or error handling

#### Hidden Inconsistencies
- State that can be out of sync
- Race conditions
- Silent failures
- Missing cleanup operations

---

### PHASE 5: THE 3-EXPERT SOLUTION DESIGN

Now that root cause is identified, the 3 experts MUST reconvene:

#### Expert 1 (Frontend) Proposes:
```
- State management changes needed
- localStorage handling improvements
- React lifecycle considerations
- Error handling enhancements
```

#### Expert 2 (Backend) Proposes:
```
- Database function modifications
- Cleanup job requirements
- Data integrity constraints
- Transaction boundaries
```

#### Expert 3 (Integration) Proposes:
```
- Flow modifications
- Synchronization guarantees
- Rollback mechanisms
- Validation checkpoints
```

#### The Panel Must Agree On:
1. **Minimal, surgical fix** vs **architectural refactor**
2. **Immediate hotfix** vs **proper long-term solution**
3. **Which layer owns cart clearing** (frontend, backend, or both?)
4. **Source of truth** for cart state
5. **Synchronization strategy** (optimistic, pessimistic, or eventual consistency)

---

## 🎯 SOLUTION CRITERIA (Only After Investigation)

Your final solution MUST:

### ✅ Functional Requirements
1. Cart completely clears after successful order (all layers)
2. localStorage syncs with server state
3. Products and bookings both clear properly
4. No phantom items after page refresh
5. Checkout totals always match server state
6. Failed syncs retry or rollback gracefully

### ✅ Technical Requirements
1. Single source of truth established
2. State transitions are explicit and logged
3. No race conditions in async operations
4. Proper error handling at each layer
5. Database cleanup is automatic
6. Frontend state reflects server state

### ✅ Testing Requirements
1. E2E test for complete cart lifecycle
2. Unit tests for critical functions
3. Manual test checklist provided
4. Logging added for debugging
5. Monitoring/alerts for state mismatches

---

## 📋 DELIVERABLES REQUIRED

After your investigation, provide:

### 1. Investigation Report
```markdown
## Findings

### Architecture Analysis
[Complete data flow diagram]

### Root Cause
[THE fundamental issue causing the bug]

### Evidence
[Logs, queries, test results proving root cause]

### Secondary Issues Discovered
[List of related bugs found]

### Expert Panel Conclusions
[What each expert determined]
```

### 2. Solution Design Document
```markdown
## Proposed Solution

### Approach
[Surgical fix vs refactor, with justification]

### Changes Required
- Frontend: [specific files and changes]
- Backend: [specific functions and migrations]
- Edge Functions: [specific modifications]

### Migration Plan
[How to deploy without breaking production]

### Rollback Plan
[How to revert if solution fails]
```

### 3. Implementation Plan
```markdown
## Implementation Steps

### Phase 1: Preparation
- [ ] Add logging to critical paths
- [ ] Create backup of current state
- [ ] Set up monitoring

### Phase 2: Core Fix
- [ ] Step-by-step changes with rationale
- [ ] Each change tested independently

### Phase 3: Validation
- [ ] E2E test execution
- [ ] Database state verification
- [ ] UI verification
- [ ] Edge case testing

### Phase 4: Cleanup
- [ ] Remove debug logging (or keep if valuable)
- [ ] Update documentation
- [ ] Create runbook for similar issues
```

### 4. Test Plan
```markdown
## Testing Checklist

### Manual Tests
- [ ] Add product → checkout → verify cleared
- [ ] Add booking → checkout → verify cleared
- [ ] Add both → checkout → verify both cleared
- [ ] Refresh during checkout → verify state
- [ ] Failed payment → verify rollback
- [ ] Multiple concurrent users

### Automated Tests
- [ ] Unit tests for state functions
- [ ] Integration tests for API calls
- [ ] E2E tests for full flow
```

---

## 🚫 WHAT NOT TO DO

DO NOT:
- ❌ Jump to solutions without investigation
- ❌ Make assumptions about how code works
- ❌ Only read excerpts of files
- ❌ Skip database state verification
- ❌ Ignore edge cases
- ❌ Propose "try this" solutions
- ❌ Add band-aid fixes without understanding root cause
- ❌ Modify code without testing
- ❌ Trust that existing code works as expected

---

## 🎓 INVESTIGATION PRINCIPLES

### 1. **Assume Nothing**
Even if code looks correct, verify it actually works.
Even if documentation says something happens, verify it does.
Even if tests pass, verify the behavior in production.

### 2. **Follow the Data**
Track cart state through EVERY layer.
Verify persistence at each step.
Check for gaps in the flow.

### 3. **Think Like a Detective**
What evidence supports the bug?
What evidence contradicts assumptions?
What's happening that shouldn't be?
What's NOT happening that should be?

### 4. **Consider Second-Order Effects**
If you clear cart on frontend, does backend know?
If booking expires, does frontend update?
If payment fails, does state rollback?
If user refreshes, does sync happen?

### 5. **Validate with Experts**
Would a React expert agree with this approach?
Would a database expert approve this transaction?
Would a systems architect find this design sound?

---

## 🎯 SUCCESS CRITERIA FOR YOUR INVESTIGATION

You have completed a thorough investigation when you can answer ALL of these questions with certainty:

1. **Where exactly does the bug occur?** (File, function, line)
2. **Why does it occur?** (Root cause, not symptom)
3. **When does it occur?** (Specific conditions, timing)
4. **What allows it to occur?** (Missing validation, race condition, etc.)
5. **How does it propagate?** (From root cause to user-visible bug)
6. **What else is affected?** (Secondary bugs, edge cases)
7. **How should it work?** (Correct behavior specification)
8. **What's the minimal fix?** (Surgical solution)
9. **What's the proper fix?** (Long-term architectural solution)
10. **How do we prevent recurrence?** (Tests, validation, architecture)

---

## 🚀 YOUR MISSION

**Investigate this bug with the rigor of a principal engineer conducting a production post-mortem.**

Find the truth. 
Understand the system completely.
Identify all inconsistencies.
Consult the experts.
Design a bulletproof solution.

**Only then**: Implement the fix.

**Remember**: A week of coding can save an hour of thinking. 
Think first. Investigate thoroughly. Then solve surgically.

---

## 📎 STARTING POINT

Your first action should be:

```bash
# Read the forensic audit
Read: docs/BOOKING_CART_PERSISTENCE_FORENSIC_AUDIT.md

# Then map the architecture by reading these files in order:
1. src/lib/store/decoupledCartStore.ts
2. src/lib/store/bookingPersistStore.ts
3. src/lib/api/cartClient.ts
4. src/app/payment/callback/page.tsx
5. supabase/functions/cart-manager/index.ts
6. Database: Execute the diagnostic queries

# Then begin the 3-expert panel analysis
```

**GO DEEP. FIND TRUTH. FIX PERMANENTLY.**

---

*This investigation should take 2-4 hours of focused analysis before ANY code changes are proposed.*
