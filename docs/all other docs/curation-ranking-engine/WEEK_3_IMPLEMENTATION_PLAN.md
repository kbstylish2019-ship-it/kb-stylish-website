# 🎨 CURATION UI - WEEK 3 IMPLEMENTATION PLAN

**Date**: October 17, 2025  
**Mission**: Build frontend integration for Curation & Ranking Engine  
**Blueprint**: Fortress Architecture v2.1  

---

## 📋 SUMMARY

### Deliverables
- ✅ 3 API client functions (server-side in apiClient.ts)
- ✅ 1 curationClient.ts file (client-side tracking)
- ✅ 1 FeaturedBrands component (NEW)
- ✅ 1 CompleteTheLook component (renamed from RelatedProducts)
- ✅ Refactor TrendingProducts, Homepage, Product Detail page
- ✅ Add click tracking to ProductCard

---

## 🔍 SYSTEM CONSCIOUSNESS AUDIT COMPLETE

### Existing Patterns Verified
1. **Server Components**: apiClient.ts → Supabase RPC/Edge Function
2. **Client Components**: cartClient.ts → Edge Function with auth
3. **Dynamic Imports**: Loading skeletons with pulse animation
4. **Component Pattern**: Server (data) → Client (interactivity)

### Current State
- TrendingProducts: Hardcoded data ❌
- FeaturedStylists: Shows stylists (not brands) ❌
- RelatedProducts: Mock data ❌
- ProductCard: No tracking ❌

---

## 📐 ARCHITECTURE DESIGN

### 1. API Client Functions (apiClient.ts)

Add 3 new functions using Edge Function pattern:

```typescript
export async function fetchTrendingProducts(limit: number = 20): Promise<TrendingProduct[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_trending_products&limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${anonKey}` },
        next: { revalidate: 300 }, // 5-min cache
      }
    );
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error:', error);
    return []; // Graceful degradation
  }
}

export async function fetchFeaturedBrands(limit: number = 6): Promise<FeaturedBrand[]> { /* same pattern */ }
export async function fetchProductRecommendations(productId: string, limit: number = 4): Promise<ProductRecommendation[]> { /* same pattern */ }
```

**Key Decisions**:
- Use Next.js `fetch()` with `revalidate` for ISR
- Return empty arrays on error (graceful degradation)
- Match Edge Function cache TTL (5 min)

### 2. Curation Client (NEW FILE: lib/curationClient.ts)

```typescript
'use client';

export async function trackCurationEvent(params: TrackEventParams): Promise<TrackEventResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=track_event`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: params.eventType,
          curation_type: params.curationType,
          target_id: params.targetId,
          session_id: params.sessionId || generateSessionId(),
        }),
      }
    );
    return await response.json();
  } catch (error) {
    console.warn('Tracking failed (non-blocking):', error);
    return { success: false };
  }
}
```

**Key Decisions**:
- Fire-and-forget (non-blocking)
- Session ID in sessionStorage
- Graceful failure (warn, don't throw)

### 3. Component Refactoring

#### Homepage (app/page.tsx)

```typescript
// BEFORE: No data
export default function Home() {
  return <main><TrendingProducts /></main>;
}

// AFTER: Fetch data server-side
export default async function Home() {
  const [trending, brands] = await Promise.all([
    fetchTrendingProducts(20),
    fetchFeaturedBrands(6),
  ]);
  
  return (
    <main>
      <FeaturedBrands brands={brands} />
      <TrendingProducts products={trending} />
    </main>
  );
}
```

#### TrendingProducts Component

```typescript
// BEFORE: Hardcoded data
const products = [/* hardcoded */];
export default function TrendingProducts() { /* ... */ }

// AFTER: Accept props + click tracking
'use client';
export default function TrendingProducts({ products }: { products: TrendingProduct[] }) {
  const handleClick = (id: string) => {
    trackCurationEvent({ eventType: 'click', curationType: 'trending_products', targetId: id });
  };
  
  return (
    <section>
      {products.map(p => <ProductCard product={p} onClick={() => handleClick(p.product_id)} />)}
    </section>
  );
}
```

#### FeaturedBrands (NEW COMPONENT)

```typescript
'use client';
export default function FeaturedBrands({ brands }: { brands: FeaturedBrand[] }) {
  const handleClick = (id: string) => {
    trackCurationEvent({ eventType: 'click', curationType: 'featured_brands', targetId: id });
  };
  
  return (
    <section>
      {brands.map(b => (
        <Link href={`/shop?brand=${b.brand_slug}`} onClick={() => handleClick(b.brand_id)}>
          {b.brand_name} ({b.product_count} products)
        </Link>
      ))}
    </section>
  );
}
```

#### CompleteTheLook (Renamed from RelatedProducts)

```typescript
'use client';
export default function CompleteTheLook({ 
  recommendations, 
  sourceProductId 
}: { 
  recommendations: ProductRecommendation[], 
  sourceProductId: string 
}) {
  const handleClick = (recId: string, targetId: string) => {
    trackCurationEvent({
      eventType: 'click',
      curationType: 'product_recommendations',
      sourceId: sourceProductId,
      targetId: targetId,
    });
  };
  
  if (recommendations.length === 0) return null;
  
  return (
    <section>
      <h2>Complete the Look</h2>
      {recommendations.map(r => (
        <Link 
          href={`/product/${r.product_slug}`} 
          onClick={() => handleClick(r.recommendation_id, r.product_id)}
        >
          {r.product_name}
        </Link>
      ))}
    </section>
  );
}
```

#### Product Detail Page

```typescript
// BEFORE: Mock recommendations
const related = getRelatedProducts();

// AFTER: Fetch real recommendations
export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = transformToProductDetail(await fetchProductBySlug(slug));
  const recommendations = await fetchProductRecommendations(product.id, 4);
  
  return (
    <main>
      <ProductDetailClient product={product} />
      <CompleteTheLook recommendations={recommendations} sourceProductId={product.id} />
    </main>
  );
}
```

---

## 🔥 FAANG PRE-MORTEM AUDIT

### FLAW #1: API Failures = Empty UI
**Solution**: Return empty arrays on error. Components check length and hide if zero.
**Status**: ✅ Fixed

### FLAW #2: No Loading Skeletons
**Solution**: Existing dynamic import pattern handles this. For v3.1, add React Suspense.
**Status**: ⚠️ Acceptable for MVP

### FLAW #3: Click Tracking Blocks Navigation
**Solution**: Fire-and-forget tracking (no await). Navigation never blocks.
**Status**: ✅ Fixed

### FLAW #4: Server/Client Component Mismatch
**Solution**: Server parent fetches data, client child handles clicks.
**Status**: ✅ Fixed

### FLAW #5: Cache Staleness After Admin Changes
**Solution**: Accept 5-min staleness (matches Edge Function TTL). Can add revalidation API in v3.1.
**Status**: ⚠️ Acceptable for MVP

---

## ✅ SUCCESS CRITERIA

- [ ] Trending products shows real data from Edge Function
- [ ] Featured brands shows brands with >0 products
- [ ] Recommendations filtered (active + in stock only)
- [ ] Click tracking fires successfully (check DB)
- [ ] Empty sections hidden gracefully
- [ ] Navigation not blocked by tracking

---

**READY FOR EXECUTION**: YES ✅
