# 📊 TRENDING PRODUCTS LOGIC & SPECIALTIES ANALYSIS

**Date**: October 17, 2025, 5:30 PM NPT  
**Investigation**: How trending works + Role of specialties  

---

## 🔥 TRENDING PRODUCTS LOGIC (How Homepage Order Works)

### **SQL Query Analysis** (from `get_trending_products` RPC):

```sql
-- PRIORITY 1: Trending (from metrics.product_trending_scores)
WHERE pts.score_date = CURRENT_DATE
  AND pts.trend_score > 1.0
  AND p.is_active = TRUE
ORDER BY pts.trend_score DESC

-- PRIORITY 2: New Arrivals (if not enough trending)
WHERE p.created_at >= NOW() - INTERVAL '30 days'
  AND NOT IN (trending)
ORDER BY p.created_at DESC

-- PRIORITY 3: Top Rated (if still not enough)
WHERE p.review_count >= 3
  AND NOT IN (trending, new)
ORDER BY p.average_rating DESC, p.review_count DESC

-- PRIORITY 4: Fallback Active Products
WHERE p.is_active = TRUE
  AND NOT IN (trending, new, rated)
ORDER BY p.created_at DESC
```

### **Key Factors**:
1. **Trend Score** from `metrics.product_trending_scores` (computed daily)
2. **Recency** (created_at within 30 days)
3. **Rating + Review Count** (minimum 3 reviews)
4. **Active status** (`is_active = TRUE`)

### **What Influences Trend Score?**
From blueprints: Likely factors include:
- View count
- Add-to-cart rate
- Purchase rate
- Wishlist adds
- Recent activity (time decay)

**NOTE**: Trending score is computed separately (not visible in this query).

---

## 👔 STYLISTS: DO SPECIALTIES AFFECT ORDERING?

### **Current Stylist Ordering** (from our new RPC functions):

#### **Featured Stylists** (`get_featured_stylists`):
```sql
ORDER BY 
    sp.total_bookings DESC NULLS LAST,   -- PRIMARY: Bookings
    sp.rating_average DESC NULLS LAST,    -- SECONDARY: Rating
    sp.featured_at DESC NULLS LAST        -- TERTIARY: Most recent feature
```
**❌ Specialties DO NOT affect order**

#### **Top Stylists** (`get_top_stylists`):
```sql
ORDER BY 
    sp.total_bookings DESC NULLS LAST,   -- PRIMARY: Bookings
    sp.rating_average DESC NULLS LAST,    -- SECONDARY: Rating  
    sp.created_at ASC                     -- TERTIARY: Oldest first (seniority)
```
**❌ Specialties DO NOT affect order**

---

## 🎯 SPECIALTIES: CURRENT STATE

### **Database Check Results**:
```
Sarah Johnson: ['Hair Coloring', 'Bridal Styling', 'Hair Extensions'] (3 specialties)
Shishir bhusal: ['haircolor'] (1 specialty)
rabindra sah: ['haircolor', 'bridalmakeup', 'bridal'] (3 specialties)
sara kami: ['hair', 'color', 'body'] (3 specialties)
test stylish: [] (0 specialties) ❌ EMPTY
```

**Problem Identified**: 
- Last stylist has EMPTY specialties array
- Specialties are text[] (inconsistent formatting: 'Hair Coloring' vs 'haircolor')
- No standardization/validation

---

## 💡 SHOULD WE KEEP SPECIALTIES IN ONBOARDING?

### **RECOMMENDATION: YES, BUT FIX IT** ✅

### **Why Keep It**:
1. **User Filtering** - Customers can search/filter by specialty
2. **Stylist Discovery** - "Find a makeup artist" vs "Find a hair stylist"
3. **SEO** - Specialty keywords improve search rankings
4. **Trust Signal** - Shows expertise areas
5. **Future Use** - Can be used for smart recommendations later

### **What Needs Fixing**:

#### **1. Standardize Specialty Options** (Dropdown, not freeform)
Create enum or reference table:
```sql
CREATE TABLE IF NOT EXISTS stylist_specialty_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    category TEXT, -- e.g., 'hair', 'makeup', 'nails', 'bridal'
    is_active BOOLEAN DEFAULT TRUE
);

-- Example data:
INSERT INTO stylist_specialty_types VALUES
('hair_cutting', 'Hair Cutting & Styling', 'hair', true),
('hair_coloring', 'Hair Coloring', 'hair', true),
('bridal_hair', 'Bridal Hair', 'bridal', true),
('bridal_makeup', 'Bridal Makeup', 'bridal', true),
('nail_art', 'Nail Art & Design', 'nails', true),
('extensions', 'Hair Extensions', 'hair', true);
```

#### **2. Make Specialties REQUIRED in Onboarding**
- Minimum 1 specialty
- Maximum 5 specialties
- Multi-select dropdown (not freeform text input)

#### **3. Add Specialty Filter to Booking Page**
Allow customers to filter stylists by specialty before booking.

---

## 🚀 IMPLEMENTATION PLAN

### **Phase 1: Fix Existing Data** (30 min)
1. Create `stylist_specialty_types` table with standard options
2. Migrate existing specialties to standard format
3. Fill empty specialties for "test stylish"

### **Phase 2: Update Onboarding** (1 hour)
1. Replace freeform text input with multi-select dropdown
2. Make field required (min 1, max 5)
3. Add validation

### **Phase 3: Add Filtering** (1 hour)
1. Add specialty filter to `/book-a-stylist` page
2. Update `get_top_stylists` and `get_featured_stylists` to accept specialty filter
3. Add UI for filter chips

---

## 🎨 UI MOCKUP: Specialty Display

### **Homepage Card**:
```
[Stylist Photo]
Sarah Johnson
Senior Hair Stylist
⭐ 4.8 | 5 years exp | 12 bookings
[Hair Coloring] [Bridal Styling] [Extensions]
```

### **Booking Page Filter**:
```
Filter by Specialty:
[All] [Hair] [Makeup] [Nails] [Bridal]

Showing 5 stylists
```

---

## 🔍 SUMMARY

**Trending Products**:
- Uses `trend_score` from `metrics.product_trending_scores`
- Fallback to new arrivals, then top-rated, then active
- Score likely based on views, cart adds, purchases

**Stylists Ordering**:
- ❌ Specialties DO NOT affect order currently
- ✅ Order by: bookings → rating → seniority/featured_at

**Specialties**:
- ✅ KEEP in onboarding (important for filtering)
- ❌ NEEDS FIXING (standardization, validation, required)
- 💡 FUTURE: Can be used for smart matching/recommendations

**Action Items**:
1. Keep specialties in onboarding
2. Standardize with dropdown (not freeform)
3. Make required (min 1, max 5)
4. Add specialty filtering on booking page
5. Consider featuring stylists WITH specialties higher priority

---

**Recommendation**: Keep specialties but make them REQUIRED and STANDARDIZED.
