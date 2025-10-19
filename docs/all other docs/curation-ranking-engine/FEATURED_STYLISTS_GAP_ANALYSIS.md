# 🎯 FEATURED STYLISTS - GAP ANALYSIS & IMPLEMENTATION PLAN

**Date**: October 17, 2025  
**Investigation Protocol**: UNIVERSAL_AI_EXCELLENCE_PROTOCOL  
**Status**: 📋 **READY FOR IMPLEMENTATION**  

---

## 📊 CURRENT STATE vs PLANNED STATE

### What EXISTS ✅
| Component | Status | Details |
|-----------|--------|---------|
| `stylist_profiles` table | ✅ EXISTS | 5 real stylists (Sarah Johnson, Shishir bhusal, etc.) |
| `rating_average` column | ✅ EXISTS | For ranking stylists |
| `total_bookings` column | ✅ EXISTS | For popularity ranking |
| `is_active` column | ✅ EXISTS | For filtering |
| Homepage component | ✅ EXISTS | `FeaturedStylists.tsx` |
| Stylist card design | ✅ EXISTS | `StylistCard.tsx` |
| Booking system | ✅ WORKING | Fully functional |

### What's MISSING ❌
| Component | Status | Impact |
|-----------|--------|--------|
| `is_featured` column | ❌ MISSING | Can't manually feature stylists |
| Database function | ❌ MISSING | No `get_featured_stylists()` RPC |
| Edge Function action | ❌ MISSING | No `fetch_top_stylists` |
| Real data connection | ❌ MISSING | Homepage uses MOCK data |
| Admin interface | ❌ MISSING | No way to feature/unfeature |
| Analytics tracking | ❌ MISSING | No click/view tracking |
| Review system | ❌ MISSING | No stylist reviews |

---

## 🎯 TWO IMPLEMENTATION APPROACHES

### APPROACH A: BASIC (2-3 hours)
**Minimal viable feature - get it working ASAP**

**Steps:**
1. Add `is_featured` column to `stylist_profiles`
2. Create simple RPC function `get_featured_stylists(limit)`
3. Update `FeaturedStylists.tsx` to fetch real data
4. Manual SQL to feature stylists (no admin UI yet)

**Pros:**
- ✅ Fast to implement
- ✅ Uses real data immediately
- ✅ No breaking changes

**Cons:**
- ❌ No admin UI (must use SQL)
- ❌ No ranking beyond manual selection
- ❌ No analytics tracking

---

### APPROACH B: PRODUCTION-GRADE (1-2 days)
**Full implementation matching product curation quality**

**Steps:**
1. Database layer (2 hours):
   - Add `is_featured` column
   - Create `get_featured_stylists()` RPC with self-healing
   - Create `get_top_stylists()` RPC for trending
   - Add to Edge Function `get-curated-content`

2. Admin interface (3 hours):
   - Create `/admin/curation/featured-stylists` page
   - Toggle featured status UI
   - Preview how homepage will look

3. Homepage integration (1 hour):
   - Update `FeaturedStylists.tsx` to fetch from Edge Function
   - Add click tracking
   - Implement proper loading/error states

4. Analytics (1 hour):
   - Track `curation_events` for stylists
   - Add `curation_type = 'featured_stylists'`

5. Review system (4 hours - optional):
   - Create `stylist_reviews` table
   - Allow customers to review after booking
   - Calculate `rating_average` automatically

**Pros:**
- ✅ Matches product curation quality
- ✅ Admin-friendly management
- ✅ Analytics for data-driven decisions
- ✅ Future-proof architecture

**Cons:**
- ❌ Takes 1-2 days
- ❌ More complex

---

## 💡 RECOMMENDED: APPROACH B (Production-Grade)

**Reasoning:**
1. You already have production-grade product curation
2. Stylists will complain if brands get better UX than them
3. Approach A creates technical debt you'll regret
4. 1-2 days is acceptable for a complete feature

---

## 📋 DETAILED IMPLEMENTATION PLAN (Approach B)

### PHASE 1: Database Schema (30 min)

**Migration**: `20251017170000_add_stylist_featured.sql`

```sql
-- Add is_featured column
ALTER TABLE public.stylist_profiles 
ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX idx_stylist_profiles_featured 
ON public.stylist_profiles(is_featured) 
WHERE is_featured = TRUE AND is_active = TRUE;

-- Manually feature top 3 stylists
UPDATE stylist_profiles 
SET is_featured = TRUE 
WHERE user_id IN (
    SELECT user_id 
    FROM stylist_profiles 
    WHERE is_active = TRUE 
    ORDER BY total_bookings DESC NULLS LAST, rating_average DESC NULLS LAST 
    LIMIT 3
);
```

---

### PHASE 2: Database Functions (1 hour)

**Function 1**: `get_featured_stylists(limit)`

```sql
CREATE OR REPLACE FUNCTION public.get_featured_stylists(p_limit INTEGER DEFAULT 6)
RETURNS TABLE(
    stylist_id UUID,
    display_name TEXT,
    title TEXT,
    bio TEXT,
    years_experience INTEGER,
    rating_average NUMERIC,
    total_bookings INTEGER,
    specialties TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.rating_average,
        sp.total_bookings,
        sp.specialties
    FROM public.stylist_profiles sp
    WHERE sp.is_featured = TRUE
      AND sp.is_active = TRUE
    ORDER BY sp.total_bookings DESC NULLS LAST, sp.rating_average DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_featured_stylists TO anon, authenticated;
```

**Function 2**: `get_top_stylists(limit)` - For trending

```sql
CREATE OR REPLACE FUNCTION public.get_top_stylists(p_limit INTEGER DEFAULT 6)
RETURNS TABLE(
    stylist_id UUID,
    display_name TEXT,
    title TEXT,
    rating_average NUMERIC,
    total_bookings INTEGER,
    recent_bookings INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id,
        sp.display_name,
        sp.title,
        sp.rating_average,
        sp.total_bookings,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM bookings b
            WHERE b.stylist_id = sp.user_id
            AND b.created_at > NOW() - INTERVAL '30 days'
            AND b.status != 'cancelled'
        ), 0) as recent_bookings
    FROM public.stylist_profiles sp
    WHERE sp.is_active = TRUE
    ORDER BY recent_bookings DESC, sp.rating_average DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_stylists TO anon, authenticated;
```

---

### PHASE 3: Edge Function Integration (30 min)

**Update**: `supabase/functions/get-curated-content/index.ts`

Add new action handler:

```typescript
async function handleFetchFeaturedStylists(client, url, cors) {
  const limit = parseInt(url.searchParams.get('limit') || '6');
  const cacheKey = `${CACHE_PREFIX.STYLISTS}${limit}`;
  
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      success: true,
      data: cached,
      source: 'cache'
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' }});
  }
  
  const { data, error } = await client.rpc('get_featured_stylists', { p_limit: limit });
  
  if (error) return errorResponse(error.message || 'Failed to fetch', 'RPC_ERROR', 500, cors);
  
  setCache(cacheKey, data).catch(console.warn);
  
  return new Response(JSON.stringify({
    success: true,
    data,
    source: 'database'
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' }});
}

// Add to switch statement:
case 'fetch_featured_stylists':
  return await handleFetchFeaturedStylists(serviceClient, url, cors);
```

---

### PHASE 4: Frontend Integration (1 hour)

**Update**: `src/lib/apiClient.ts`

```typescript
export interface FeaturedStylist {
  stylist_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  years_experience: number | null;
  rating_average: number | null;
  total_bookings: number;
  specialties: string[] | null;
}

export async function fetchFeaturedStylists(limit: number = 6): Promise<FeaturedStylist[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) return [];
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_featured_stylists&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 },
      }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Curation API] Error fetching featured stylists:', error);
    return [];
  }
}
```

**Update**: `src/components/homepage/FeaturedStylists.tsx`

```typescript
import { fetchFeaturedStylists } from "@/lib/apiClient";

export default async function FeaturedStylists() {
  const stylists = await fetchFeaturedStylists(3);
  
  if (stylists.length === 0) return null;
  
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Featured Stylists</h2>
          <p className="mt-2 text-sm text-foreground/60">Book with our top-rated professionals</p>
        </div>
        <Link href="/book-a-stylist" className="text-sm text-foreground/70 hover:text-foreground">
          View all
        </Link>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stylists.map((stylist) => (
          <Link
            key={stylist.stylist_id}
            href={`/book-a-stylist?stylist=${stylist.stylist_id}`}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-xl"
          >
            <h3 className="text-xl font-bold">{stylist.display_name}</h3>
            <p className="text-sm text-foreground/70">{stylist.title}</p>
            <div className="mt-4 flex items-center gap-4 text-sm">
              {stylist.rating_average && (
                <span className="flex items-center gap-1">
                  ⭐ {stylist.rating_average.toFixed(1)}
                </span>
              )}
              <span>{stylist.total_bookings} bookings</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

---

### PHASE 5: Admin Interface (3 hours)

Create `/admin/curation/featured-stylists` page matching the Featured Brands design.

*(Similar structure to FeaturedBrandsClient.tsx)*

---

## ⏱️ TIME ESTIMATE

| Phase | Time | Cumulative |
|-------|------|------------|
| Schema migration | 30 min | 30 min |
| Database functions | 1 hour | 1.5 hours |
| Edge Function | 30 min | 2 hours |
| Frontend integration | 1 hour | 3 hours |
| Admin interface | 3 hours | 6 hours |
| Testing | 1 hour | 7 hours |
| **TOTAL** | **7 hours** | **1 day** |

---

## 🚀 NEXT STEPS

1. **Confirm approach**: Basic (A) or Production (B)?
2. **Execute**: Implement chosen approach
3. **Test**: Verify homepage shows real stylists
4. **Deploy**: Push to production

---

## 📝 NOTES

- Review system is OPTIONAL (add later if needed)
- Analytics tracking should match product pattern
- Admin interface can reuse Featured Brands design patterns

**Recommendation**: Start with Approach B - it's only 1 day and gives you a complete, professional feature.
