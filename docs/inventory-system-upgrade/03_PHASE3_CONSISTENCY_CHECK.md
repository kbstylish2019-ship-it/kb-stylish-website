# Phase 3: Codebase Consistency Check

**Date**: January 10, 2026  
**Status**: COMPLETE

---

## 3.1 Pattern Matching Analysis

### Database Function Patterns

**Existing Pattern** (`create_vendor_product`):
```sql
CREATE OR REPLACE FUNCTION public.create_vendor_product(p_product_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  -- ... declarations
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Input validation
  -- 4. Business logic
  -- 5. Audit logging
  -- 6. Cache notification
  -- 7. Return result
  
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate detected';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid reference';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Operation failed: %', SQLERRM;
END;
$function$
```

**New Functions MUST Follow**:
- ✅ SECURITY DEFINER
- ✅ SET search_path
- ✅ SET statement_timeout
- ✅ Auth check first
- ✅ Role check second
- ✅ Input validation
- ✅ Audit logging
- ✅ pg_notify for cache
- ✅ Structured exception handling

### Frontend Component Patterns

**Existing Modal Pattern** (`AddProductModal.tsx`):
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: (data: any) => void;
}

export default function AddProductModal({ open, onClose, userId, onSuccess }: ModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step-based wizard
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // Form state
  const [formData, setFormData] = useState({...});
  
  // Handlers
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await serverAction(data);
      if (result?.success) {
        onSuccess(result);
        onClose();
      } else {
        setError(result?.message || 'Failed');
      }
    } catch (err) {
      setError('Unexpected error');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Render with step navigation
}
```

**New Components MUST Follow**:
- ✅ Same prop interface pattern
- ✅ Loading state management
- ✅ Error state management
- ✅ Server Action integration
- ✅ Success callback pattern
- ✅ Consistent styling (Tailwind + CSS vars)

### Server Action Patterns

**Existing Pattern** (`src/app/actions/vendor.ts`):
```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createVendorProduct(productData: any): Promise<{
  success: boolean;
  product_id?: string;
  slug?: string;
  message?: string;
}> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('create_vendor_product', {
      p_product_data: productData
    });
    
    if (error) {
      console.error('Error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    
    return data;
  } catch (error: any) {
    console.error('Error:', error);
    return { success: false, message: error.message || 'Failed' };
  }
}
```

**New Actions MUST Follow**:
- ✅ 'use server' directive
- ✅ Typed return interface
- ✅ Try-catch wrapper
- ✅ RPC function call
- ✅ revalidatePath after mutations
- ✅ Consistent error handling

---

## 3.2 Dependency Analysis

### Package Dependencies

**Current Relevant Packages**:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "next": "15.x",
    "react": "19.x",
    "zustand": "^4.x",
    "lucide-react": "^0.x"
  }
}
```

**No New Dependencies Required**:
- All UI components use existing Tailwind + Lucide
- State management uses existing Zustand
- API calls use existing Supabase client

### Import Structure

**Existing Import Pattern**:
```typescript
// External
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

// Internal - lib
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Internal - components
import CustomSelect from '@/components/ui/CustomSelect';

// Internal - types
import type { SomeType } from '@/lib/types';
```

**New Files MUST Follow**:
- ✅ External imports first
- ✅ Internal lib imports second
- ✅ Internal component imports third
- ✅ Type imports last
- ✅ Use `@/` path aliases

---

## 3.3 Anti-Pattern Detection

### Patterns to AVOID

| Anti-Pattern | Why Bad | Correct Pattern |
|--------------|---------|-----------------|
| Hardcoded values | Not configurable | Use env vars or constants |
| Direct DB access | Bypasses RLS | Use RPC functions |
| Missing error handling | Silent failures | Try-catch with user feedback |
| Unauthenticated endpoints | Security risk | Always check auth.uid() |
| SQL injection | Security risk | Use parameterized queries |
| N+1 queries | Performance | Use joins or batch queries |
| Duplicate code | Maintenance | Extract to shared functions |
| console.log in production | Noise | Use proper logging |

### Code Review Checklist

**Database Functions**:
- [ ] Uses SECURITY DEFINER
- [ ] Sets search_path
- [ ] Sets statement_timeout
- [ ] Checks auth.uid()
- [ ] Checks user role
- [ ] Validates all inputs
- [ ] Uses parameterized queries
- [ ] Logs to audit table
- [ ] Sends pg_notify
- [ ] Has exception handling

**Frontend Components**:
- [ ] Has TypeScript types
- [ ] Handles loading state
- [ ] Handles error state
- [ ] Uses existing UI patterns
- [ ] Is accessible (labels, ARIA)
- [ ] Is responsive
- [ ] Uses cn() for conditional classes
- [ ] No hardcoded strings (use constants)

**Server Actions**:
- [ ] Has 'use server' directive
- [ ] Has typed return
- [ ] Uses try-catch
- [ ] Calls RPC function
- [ ] Revalidates paths
- [ ] Logs errors

---

## 3.4 Naming Conventions

### Database Objects

| Type | Convention | Example |
|------|------------|---------|
| Tables | snake_case, plural | `product_variants` |
| Columns | snake_case | `quantity_available` |
| Functions | snake_case, verb_noun | `create_vendor_product` |
| Indexes | idx_table_columns | `idx_inventory_variant_id` |
| Constraints | chk/fk/pk_table_column | `chk_inventory_non_negative` |
| Triggers | trg_table_action | `trg_inventory_updated` |

### TypeScript/React

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `VariantBuilder` |
| Files (components) | PascalCase.tsx | `VariantBuilder.tsx` |
| Files (utils) | camelCase.ts | `apiClient.ts` |
| Functions | camelCase | `handleSubmit` |
| Constants | SCREAMING_SNAKE | `MAX_VARIANTS` |
| Types/Interfaces | PascalCase | `ProductVariant` |
| Props interfaces | ComponentNameProps | `VariantBuilderProps` |

---

## 3.5 Consistency Verification Results

### Database Layer ✅

| Check | Status | Notes |
|-------|--------|-------|
| Function naming | ✅ | Follows snake_case |
| Security pattern | ⚠️ | update_vendor_product needs SECURITY DEFINER |
| Audit logging | ✅ | product_change_log exists |
| Cache invalidation | ✅ | pg_notify pattern exists |

### Frontend Layer ✅

| Check | Status | Notes |
|-------|--------|-------|
| Component structure | ✅ | Follows existing patterns |
| State management | ✅ | Uses useState/Zustand |
| Styling | ✅ | Tailwind + CSS vars |
| Error handling | ✅ | Consistent pattern |

### API Layer ✅

| Check | Status | Notes |
|-------|--------|-------|
| Server Actions | ✅ | Follows existing pattern |
| RPC calls | ✅ | Uses supabase.rpc() |
| Path revalidation | ✅ | Uses revalidatePath() |

---

## 3.6 Required Consistency Fixes

Before implementation, these inconsistencies must be addressed:

1. **`update_vendor_product` function**:
   - Add `SECURITY DEFINER`
   - Add `SET search_path`
   - Add `SET statement_timeout`

2. **New functions must include**:
   - Audit logging to `product_change_log`
   - Cache notification via `pg_notify`

3. **New components must use**:
   - Existing `cn()` utility
   - Existing CSS variables
   - Existing icon library (Lucide)

---

## Phase 3 Completion

- [x] Pattern matching complete
- [x] Dependencies verified
- [x] Anti-patterns identified
- [x] Naming conventions documented
- [x] Consistency fixes identified

**Phase 3 Status**: COMPLETE  
**Next Phase**: Solution Blueprint (Phase 4)
