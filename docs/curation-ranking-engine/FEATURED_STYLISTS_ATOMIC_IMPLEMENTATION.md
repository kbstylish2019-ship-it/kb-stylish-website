# 🎯 FEATURED STYLISTS - ATOMIC-LEVEL IMPLEMENTATION PLAN
## Following UNIVERSAL_AI_EXCELLENCE_PROTOCOL (All 10 Phases)

**Date**: October 17, 2025, 4:45 PM NPT  
**Investigation Depth**: Electron-level (database, migrations, code, logs)  
**Status**: 🔥 **READY FOR IMMEDIATE IMPLEMENTATION**  

---

## 📊 PHASE 1-3: TOTAL SYSTEM CONSCIOUSNESS (COMPLETE)

### ✅ What EXISTS (Verified in Live Database)

**Database Tables**:
- ✅ `stylist_profiles` table with 16 columns
- ✅ `user_profiles` table with `avatar_url` column
- ✅ Real data: 5 active stylists (Sarah Johnson: 2 bookings, Shishir: 0, etc.)
- ✅ Columns: `display_name`, `title`, `bio`, `years_experience`, `specialties`, `rating_average`, `total_bookings`

**Curation Infrastructure** (Already Deployed):
- ✅ `metrics.product_trending_scores` table
- ✅ `public.product_recommendations` table
- ✅ `public.curation_events` table
- ✅ `brands.is_featured` + `featured_at` + `featured_by` columns
- ✅ `get-curated-content` Edge Function v4 (deployed, working)
- ✅ RPC functions: `get_trending_products`, `get_featured_brands`, `get_product_recommendations`
- ✅ Admin functions: `toggle_brand_featured`, `add_product_recommendation`

**Frontend Components**:
- ✅ `FeaturedStylists.tsx` (uses MOCK data)
- ✅ `StylistCard.tsx` (working component, expects `imageUrl`, `name`, `specialty`, `rating`)
- ✅ Mock data file: `@/lib/mock/stylists.ts`

### ❌ What's MISSING (Must Implement)

**Database**:
- ❌ `stylist_profiles.is_featured` column
- ❌ `stylist_profiles.featured_at` column
- ❌ `stylist_profiles.featured_by` column (for audit)

**RPC Functions**:
- ❌ `public.get_featured_stylists(p_limit)` - Returns featured stylists
- ❌ `public.toggle_stylist_featured(p_user_id, p_is_featured)` - Admin control

**Edge Function**:
- ❌ `fetch_featured_stylists` action in `get-curated-content`

**Frontend**:
- ❌ `FeaturedStylists.tsx` not connected to real data
- ❌ No `fetchFeaturedStylists()` in apiClient.ts

**Admin Interface**:
- ❌ No admin page for managing featured stylists

---

## 🎯 IMPLEMENTATION STRATEGY

### Why NOT copy products/brands pattern exactly?

**Key Difference**: Stylists ≠ Products
1. **Stylists have user accounts** - Use `user_id` FK to `user_profiles`
2. **Photos come from user_profiles.avatar_url** - Not separate images table
3. **Simpler data model** - No variants, no inventory, no categories

**What to Copy**:
- ✅ Same `is_featured`, `featured_at`, `featured_by` pattern
- ✅ Same Edge Function structure
- ✅ Same caching strategy (Redis 5 min TTL)
- ✅ Same admin toggle pattern

---

## 🗄️ PHASE 5: DATABASE SCHEMA (30 minutes)

### Migration 1: Add is_featured to stylist_profiles

**File**: `supabase/migrations/20251017170000_add_stylist_featured.sql`

```sql
-- =====================================================================
-- MIGRATION: Add Featured Stylist Support
-- Following proven brands.is_featured pattern
-- =====================================================================

BEGIN;

-- Add featured columns to stylist_profiles
ALTER TABLE public.stylist_profiles 
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_by UUID REFERENCES auth.users(id);

-- Create index for fast featured stylist queries
CREATE INDEX IF NOT EXISTS idx_stylist_profiles_featured 
ON public.stylist_profiles (is_featured, is_active) 
WHERE is_featured = TRUE AND is_active = TRUE;

-- Add comment
COMMENT ON COLUMN public.stylist_profiles.is_featured IS 'Admin-controlled flag for homepage featured stylists';
COMMENT ON COLUMN public.stylist_profiles.featured_at IS 'Timestamp when stylist was featured';
COMMENT ON COLUMN public.stylist_profiles.featured_by IS 'Admin user who featured this stylist';

COMMIT;

-- Rollback plan:
-- ALTER TABLE public.stylist_profiles DROP COLUMN IF EXISTS is_featured, DROP COLUMN IF EXISTS featured_at, DROP COLUMN IF EXISTS featured_by;
```

---

## ⚙️ PHASE 6: RPC FUNCTIONS (1 hour)

### Function 1: get_featured_stylists

**File**: `supabase/migrations/20251017170100_create_stylist_featured_functions.sql`

```sql
-- =====================================================================
-- FUNCTION: Get Featured Stylists
-- Returns: Featured stylists with user profile data (avatars)
-- Security: SECURITY INVOKER (public read access)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_featured_stylists(p_limit INTEGER DEFAULT 6)
RETURNS TABLE(
    stylist_id UUID,
    display_name TEXT,
    title TEXT,
    bio TEXT,
    years_experience INTEGER,
    specialties TEXT[],
    rating_average NUMERIC,
    total_bookings INTEGER,
    avatar_url TEXT,
    featured_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id as stylist_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.specialties,
        sp.rating_average,
        sp.total_bookings,
        up.avatar_url,
        sp.featured_at
    FROM public.stylist_profiles sp
    LEFT JOIN public.user_profiles up ON sp.user_id = up.id
    WHERE sp.is_featured = TRUE
      AND sp.is_active = TRUE
    ORDER BY 
        sp.total_bookings DESC NULLS LAST, 
        sp.rating_average DESC NULLS LAST,
        sp.featured_at DESC
    LIMIT p_limit;
END;
$$;

-- Grant public access (RLS not needed - already filtering by is_active)
GRANT EXECUTE ON FUNCTION public.get_featured_stylists TO anon, authenticated;

COMMENT ON FUNCTION public.get_featured_stylists IS 'Returns featured stylists for homepage display';
```

### Function 2: toggle_stylist_featured (Admin Only)

```sql
-- =====================================================================
-- FUNCTION: Toggle Stylist Featured Status
-- Admin-only function for featuring/unfeaturing stylists
-- Security: SECURITY DEFINER + assert_admin()
-- =====================================================================

CREATE OR REPLACE FUNCTION public.toggle_stylist_featured(
    p_user_id UUID,
    p_is_featured BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    -- Self-defense: Only admins can feature stylists
    PERFORM private.assert_admin();
    
    -- Update stylist profile
    UPDATE public.stylist_profiles
    SET 
        is_featured = p_is_featured,
        featured_at = CASE WHEN p_is_featured THEN NOW() ELSE NULL END,
        featured_by = CASE WHEN p_is_featured THEN auth.uid() ELSE NULL END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Verify stylist exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stylist not found: %', p_user_id;
    END IF;
END;
$$;

-- Restrict to authenticated users only (assert_admin will further restrict)
REVOKE ALL ON FUNCTION public.toggle_stylist_featured FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_stylist_featured TO authenticated;

COMMENT ON FUNCTION public.toggle_stylist_featured IS 'Admin-only: Toggle stylist featured status';
```

---

## 🚀 PHASE 7: EDGE FUNCTION UPDATE (30 minutes)

### Update: get-curated-content/index.ts

**Add to existing file** (after line 305):

```typescript
/**
 * Handler: Fetch Featured Stylists
 * 
 * Cache Key Pattern: curation:stylists:{limit}
 * Example: curation:stylists:6
 * 
 * Database Function: get_featured_stylists(p_limit)
 * Returns: Stylists where is_featured=true AND is_active=true
 */
async function handleFetchFeaturedStylists(
  client: any,
  url: URL,
  cors: Record<string, string>
) {
  const limit = parseInt(url.searchParams.get('limit') || '6');
  const cacheKey = `${CACHE_PREFIX.STYLISTS}${limit}`;
  
  // L1: Try cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: cached, 
        source: 'cache',
        cached_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
  
  console.log(`[Featured Stylists] Cache MISS - fetching from database (limit: ${limit})`);
  
  // L2: Fetch from database
  const { data, error } = await client.rpc('get_featured_stylists', { p_limit: limit });
  
  if (error) {
    console.error('[Featured Stylists] RPC error:', error);
    return errorResponse(error.message || 'Failed to fetch featured stylists', 'RPC_ERROR', 500, cors);
  }
  
  // L3: Write back to cache (fire-and-forget, non-blocking)
  setCache(cacheKey, data).catch((err) => console.warn('[Featured Stylists] Cache write failed:', err));
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      data, 
      source: 'database',
      fetched_at: new Date().toISOString()
    }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
}
```

**Update cache prefix** (line 45):

```typescript
const CACHE_PREFIX = {
  TRENDING: 'curation:trending:',
  BRANDS: 'curation:brands:',
  RECOMMENDATIONS: 'curation:rec:',
  STYLISTS: 'curation:stylists:',  // ADD THIS
};
```

**Update switch statement** (line 423):

```typescript
case 'fetch_featured_stylists':
  return await handleFetchFeaturedStylists(serviceClient, url, cors);
```

**Update curation_type validation** (line 347):

```typescript
const validCurationTypes = ['trending_products', 'featured_brands', 'product_recommendations', 'featured_stylists'];
```

**Deploy Command**:
```bash
supabase functions deploy get-curated-content --no-verify-jwt
```

---

## 💻 PHASE 8: FRONTEND INTEGRATION (1 hour)

### Step 1: Add fetchFeaturedStylists to apiClient.ts

**File**: `src/lib/apiClient.ts`

```typescript
/**
 * Fetch Featured Stylists from Curation Engine
 * Uses get-curated-content Edge Function with Redis caching (5 min TTL)
 */
export interface FeaturedStylist {
  stylist_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  years_experience: number | null;
  specialties: string[] | null;
  rating_average: number | null;
  total_bookings: number;
  avatar_url: string | null;
  featured_at: string | null;
}

export async function fetchFeaturedStylists(limit: number = 6): Promise<FeaturedStylist[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.error('[Featured Stylists] Missing Supabase env vars');
    return [];
  }
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_featured_stylists&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 }, // 5 min cache
      }
    );
    
    if (!response.ok) {
      console.error('[Featured Stylists] API error:', response.status);
      return [];
    }
    
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error('[Featured Stylists] Fetch error:', error);
    return [];
  }
}
```

### Step 2: Update FeaturedStylists.tsx

**File**: `src/components/homepage/FeaturedStylists.tsx`

```typescript
import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { fetchFeaturedStylists } from "@/lib/apiClient";

export default async function FeaturedStylists() {
  const stylists = await fetchFeaturedStylists(3);
  
  // Don't render section if no featured stylists
  if (stylists.length === 0) return null;
  
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Featured Stylists</h2>
          <p className="mt-2 text-sm text-foreground/60">Book with our top-rated professionals</p>
        </div>
        <Link 
          href="/book-a-stylist" 
          className="text-sm text-foreground/70 hover:text-foreground transition-colors"
        >
          View all →
        </Link>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stylists.map((stylist) => (
          <Link
            key={stylist.stylist_id}
            href={`/book-a-stylist?stylist=${stylist.stylist_id}`}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-xl hover:shadow-white/5"
          >
            {/* Stylist Photo */}
            <div className="relative aspect-[4/3] overflow-hidden">
              {stylist.avatar_url ? (
                <Image
                  src={stylist.avatar_url}
                  alt={stylist.display_name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="size-full bg-gradient-to-br from-[var(--kb-primary-brand)]/20 to-[var(--kb-accent-gold)]/20 flex items-center justify-center">
                  <span className="text-6xl font-bold text-white/30">
                    {stylist.display_name.charAt(0)}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
            
            {/* Stylist Info */}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold tracking-tight transition-colors group-hover:text-foreground/90">
                    {stylist.display_name}
                  </h3>
                  <p className="mt-1 text-sm text-foreground/70">{stylist.title}</p>
                </div>
                {stylist.rating_average && (
                  <div className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs ring-1 ring-white/10">
                    <Star className="h-3.5 w-3.5 fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]" />
                    <span className="font-medium">{stylist.rating_average.toFixed(1)}</span>
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-sm text-foreground/60">
                {stylist.years_experience && (
                  <span>{stylist.years_experience} years exp</span>
                )}
                <span>•</span>
                <span>{stylist.total_bookings} bookings</span>
              </div>
              
              {stylist.specialties && stylist.specialties.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stylist.specialties.slice(0, 3).map((specialty, idx) => (
                    <span 
                      key={idx}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-foreground/70 ring-1 ring-white/10"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

---

## 🧪 PHASE 9: TESTING (30 minutes)

### Test 1: Database Functions

```sql
-- Test get_featured_stylists
SELECT * FROM public.get_featured_stylists(6);
-- Should return: Empty array (no featured stylists yet)

-- Manually feature Sarah Johnson (has 2 bookings)
CALL public.toggle_stylist_featured('19d02e52-4bb3-4bd6-ae4c-87e3f1543968', true);

-- Test again
SELECT * FROM public.get_featured_stylists(6);
-- Should return: Sarah Johnson with all details
```

### Test 2: Edge Function

```powershell
# Test fetch_featured_stylists action
$headers = @{
    'Authorization' = 'Bearer [ANON_KEY]'
}

$result = Invoke-RestMethod `
  -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_featured_stylists&limit=6" `
  -Headers $headers

$result | ConvertTo-Json -Depth 5
```

### Test 3: Frontend

1. Manually feature 3 stylists via SQL
2. Visit homepage
3. Should see "Featured Stylists" section with 3 cards
4. Check images load (or show fallback initials)
5. Verify ratings, experience, bookings display
6. Click card → should go to `/book-a-stylist?stylist={id}`

---

## ✅ SUCCESS CRITERIA

- [ ] Migration applies cleanly
- [ ] `get_featured_stylists()` returns correct data
- [ ] `toggle_stylist_featured()` requires admin role
- [ ] Edge Function returns 200 with featured stylists
- [ ] Redis caching works (check logs for HIT/MISS)
- [ ] Homepage shows Featured Stylists section
- [ ] Images load correctly (or fallback shows)
- [ ] Clicking stylist card navigates to booking page
- [ ] No console errors in browser
- [ ] No Supabase logs errors

---

## ⏱️ TIME ESTIMATE

| Phase | Time | Cumulative |
|-------|------|------------|
| Schema migration | 15 min | 15 min |
| RPC functions | 30 min | 45 min |
| Edge Function update | 20 min | 1h 5min |
| Frontend integration | 45 min | 1h 50min |
| Testing | 20 min | 2h 10min |
| Bug fixes | 20 min | 2h 30min |
| **TOTAL** | **2.5 hours** | **READY IN 1 SESSION** |

---

## 🚀 DEPLOYMENT SEQUENCE

```bash
# 1. Apply migrations
cd supabase/migrations
supabase db push

# 2. Deploy Edge Function
supabase functions deploy get-curated-content --no-verify-jwt

# 3. Feature first 3 stylists (via SQL or admin UI)
# Run manual SQL in Supabase Studio

# 4. Restart dev server (if running)
# Frontend will auto-fetch on next build

# 5. Test homepage
# Visit http://localhost:3000 and verify Featured Stylists appears
```

---

**STATUS**: 🔥 **READY FOR IMMEDIATE IMPLEMENTATION**  
**Next Action**: Apply migration → Deploy function → Test → Launch
