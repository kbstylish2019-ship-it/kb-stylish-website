# 🔍 PHASE 1: STYLIST RATING SYSTEM - COMPLETE CODEBASE IMMERSION
**Following Universal AI Excellence Protocol v2.0**
**Date**: October 24, 2025

---

## 🎯 OBJECTIVE

Implement a stylist rating system where customers can rate stylists after completed bookings.

**Scope**:
1. Allow customers to rate stylists (1-5 stars)
2. Optional review text
3. Display ratings on stylist cards
4. Aggregate ratings in stylist profiles
5. Only allow ratings after booking completion

---

## 📊 CURRENT STATE ANALYSIS

### Database Schema - What Exists ✅

#### `stylist_profiles` Table
**Already Has Rating Infrastructure!**
```sql
rating_average NUMERIC (nullable)  ← Already exists!
total_bookings INTEGER DEFAULT 0  ← Already exists!
```

**Other Fields**:
- `user_id` (UUID, primary key)
- `display_name` (TEXT)
- `title` (TEXT nullable)
- `bio` (TEXT nullable)
- `years_experience` (INTEGER nullable)
- `specialties` (ARRAY nullable)
- `certifications` (JSONB default '[]')
- `timezone` (TEXT default 'Asia/Kathmandu')
- `is_active` (BOOLEAN default true)
- `is_featured` (BOOLEAN default false)
- `total_bookings` (INTEGER default 0)
- `metadata` (JSONB default '{}')

**Finding**: Infrastructure for storing aggregated ratings exists, but NO table for individual ratings!

---

#### `bookings` Table
**Key Fields**:
```sql
id UUID
customer_user_id UUID
stylist_user_id UUID
service_id UUID
status TEXT DEFAULT 'pending'  ← Need to check for 'completed'
payment_intent_id TEXT
start_time TIMESTAMPTZ
end_time TIMESTAMPTZ
price_cents INTEGER
created_at TIMESTAMPTZ
```

**Current Status Distribution**:
- Total bookings: 26
- Confirmed: 10
- Cancelled: 9
- Completed: 0  ← No completed bookings yet!

**Finding**: Need to ensure bookings can be marked as 'completed' before ratings

can be given.

---

#### `reviews` Table (PRODUCTS ONLY)
**NOT for stylists!**
```sql
product_id UUID  ← For products only!
user_id UUID
order_id UUID
rating INTEGER
title VARCHAR
comment TEXT
moderation_status TEXT
```

**Finding**: Separate table exists for product reviews. Need new table for stylist ratings.

---

### Frontend Analysis - What Exists ✅

#### Stylist Display Components

**1. `StylistCard.tsx`** (Homepage/Featured):
```tsx
// Line 56: Already displays rating!
<div className="inline-flex items-center gap-1">
  <Star className="h-3.5 w-3.5 text-[var(--kb-accent-gold)]" />
  <span>{stylist.rating.toFixed(1)}</span>
</div>
```

**2. TypeScript Type** (`src/lib/types.ts`):
```typescript
export interface Stylist {
  id: string;
  name: string;
  specialty: string;
  rating: number;          // 0..5 ← Already expected!
  reviewCount?: number;     // ← Already expected!
  imageUrl?: string;
  availability?: string;
  isFeatured?: boolean;
}
```

**Finding**: Frontend already expects and displays ratings!

---

#### Stylist Data Fetching

**Function**: `fetchActiveStylistsWithServices()` in `src/lib/apiClient.ts`

**Current Query** (lines 973-1011):
```typescript
const { data: stylists } = await supabase
  .from('stylist_profiles')
  .select(`
    user_id,
    display_name,
    rating_average,     ← Fetched but likely NULL
    total_bookings,     ← Fetched
    is_featured,
    user_profiles!inner (avatar_url),
    stylist_services!inner (...)
  `)
```

**Transformation** (lines 1022-1047):
```typescript
return stylists.map((stylist: any) => ({
  id: stylist.user_id,
  ratingAverage: stylist.rating_average,  ← Passed through
  totalBookings: stylist.total_bookings
}));
```

**Finding**: Backend fetches `rating_average` but it's NULL because no ratings exist yet.

---

## 🔍 WHAT'S MISSING

### Database Layer ❌
1. **`stylist_ratings` table** - Individual customer ratings
2. **Trigger/Function** - To update `stylist_profiles.rating_average` when new rating added
3. **RLS Policies** - Security for rating creation/viewing
4. **Validation** - Ensure only completed bookings can be rated
5. **One-rating-per-booking** - Prevent duplicate ratings

### API Layer ❌
1. **POST /api/stylists/rate** - Create new rating
2. **GET /api/stylists/:id/ratings** - Fetch ratings for a stylist
3. **Validation** - Check booking exists, completed, and not yet rated

### Frontend Layer ❌
1. **Rating Component** - UI for submitting ratings
2. **My Bookings Integration** - Show "Rate Stylist" button for completed bookings
3. **Stylist Profile Page** - Display reviews (if we build profile pages)
4. **Rating Modal/Form** - Stars + optional text review

---

## 🗺️ USER JOURNEY (PROPOSED)

### Current Flow:
```
1. Customer books stylist ✅
2. Payment completed ✅
3. Booking confirmed ✅
4. Stylist completes service ⚠️ (manual status change)
5. Booking marked as 'completed' ⚠️
6. Customer can rate... ❌ NOT IMPLEMENTED
```

### Desired Flow:
```
1. Customer books stylist ✅
2. Payment completed ✅
3. Booking confirmed ✅
4. Stylist completes service → Status: 'completed'
5. Customer sees "Rate Your Experience" in My Bookings
6. Customer clicks → Rating modal opens
7. Customer selects stars (1-5) + optional review text
8. Submit → Rating saved
9. Stylist's rating_average updated automatically
10. Rating displays on stylist card
```

---

## 🎨 UI/UX REQUIREMENTS

### Where Ratings Should Appear:

**1. Stylist Cards** (Already exists! ✅)
- Homepage featured stylists
- Book-a-Stylist page
- Shows: ⭐ 4.8 (from `rating_average`)

**2. My Bookings Page** (Need to add ❌)
- Show "Rate Stylist" button for completed, unrated bookings
- Open rating modal on click

**3. Rating Modal** (Need to create ❌)
- Star selector (1-5)
- Optional text review field
- Character limit (e.g., 500 chars)
- Submit button
- Show stylist name/service

**4. Stylist Profile Page** (Optional - future)
- Display all reviews
- Filter/sort reviews
- Pagination

---

## 🔒 SECURITY REQUIREMENTS

### RLS Policies Needed:

**1. `stylist_ratings` Table**:
```sql
-- SELECT: Anyone can view approved ratings
CREATE POLICY "Anyone can view approved ratings"
ON stylist_ratings FOR SELECT
USING (is_approved = true);

-- INSERT: Only authenticated users who own the booking
CREATE POLICY "Users can rate their own completed bookings"
ON stylist_ratings FOR INSERT
WITH CHECK (
  auth.uid() = customer_user_id
  AND EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = booking_id
      AND bookings.customer_user_id = auth.uid()
      AND bookings.status = 'completed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM stylist_ratings
    WHERE stylist_ratings.booking_id = booking_id
  )
);

-- UPDATE: Users can edit their own ratings (within time window?)
CREATE POLICY "Users can update their own ratings"
ON stylist_ratings FOR UPDATE
USING (auth.uid() = customer_user_id)
WITH CHECK (auth.uid() = customer_user_id);

-- DELETE: Only admins can delete
CREATE POLICY "Only admins can delete ratings"
ON stylist_ratings FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM user_roles
    WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')
  )
);
```

---

## 📊 PROPOSED SCHEMA

### New Table: `stylist_ratings`

```sql
CREATE TABLE public.stylist_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stylist_user_id UUID NOT NULL REFERENCES public.stylist_profiles(user_id) ON DELETE CASCADE,
  
  -- Rating Data
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  
  -- Moderation
  is_approved BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderated_at TIMESTAMPTZ,
  moderated_by UUID REFERENCES auth.users(id),
  moderation_notes TEXT,
  
  -- Metadata
  helpful_votes INTEGER NOT NULL DEFAULT 0,
  unhelpful_votes INTEGER NOT NULL DEFAULT 0,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  last_edited_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT one_rating_per_booking UNIQUE(booking_id),
  CONSTRAINT rating_within_bounds CHECK (rating >= 1 AND rating <= 5)
);

-- Indexes
CREATE INDEX idx_stylist_ratings_stylist ON stylist_ratings(stylist_user_id) WHERE is_approved = true;
CREATE INDEX idx_stylist_ratings_customer ON stylist_ratings(customer_user_id);
CREATE INDEX idx_stylist_ratings_booking ON stylist_ratings(booking_id);
CREATE INDEX idx_stylist_ratings_moderation ON stylist_ratings(moderation_status, created_at);

-- Comments
COMMENT ON TABLE stylist_ratings IS 'Customer ratings and reviews for stylists after service completion';
COMMENT ON COLUMN stylist_ratings.booking_id IS 'One-to-one: each booking can only be rated once';
COMMENT ON COLUMN stylist_ratings.is_approved IS 'Moderation flag - only approved ratings appear publicly';
```

---

## ⚙️ PROPOSED TRIGGER

### Auto-Update Stylist Rating Average

```sql
CREATE OR REPLACE FUNCTION update_stylist_rating_average()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate average rating for the stylist
  UPDATE stylist_profiles
  SET 
    rating_average = (
      SELECT AVG(rating)::NUMERIC(3,2)
      FROM stylist_ratings
      WHERE stylist_user_id = NEW.stylist_user_id
        AND is_approved = true
    ),
    updated_at = NOW()
  WHERE user_id = NEW.stylist_user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on INSERT or UPDATE of approved ratings
CREATE TRIGGER trigger_update_stylist_rating_average
AFTER INSERT OR UPDATE OF rating, is_approved
ON stylist_ratings
FOR EACH ROW
WHEN (NEW.is_approved = true)
EXECUTE FUNCTION update_stylist_rating_average();

COMMENT ON FUNCTION update_stylist_rating_average IS 
'Automatically recalculates stylist rating_average when ratings are added/updated';
```

---

## 🎯 BUSINESS LOGIC REQUIREMENTS

### Rating Rules:
1. ✅ **Booking Must Be Completed**
   - Check `bookings.status = 'completed'`
   - Stylists must mark service as done

2. ✅ **One Rating Per Booking**
   - Database constraint: `UNIQUE(booking_id)`
   - Prevents spam/manipulation

3. ✅ **Only Customer Can Rate**
   - Customer who made the booking
   - RLS enforces `customer_user_id = auth.uid()`

4. ⚠️ **Moderation** (Optional - can start with auto-approve)
   - Option A: Auto-approve all ratings
   - Option B: Manual approval by admin
   - Option C: AI moderation for profanity

5. ⚠️ **Edit Window** (Optional)
   - Allow customers to edit ratings within 7 days?
   - Track edits: `is_edited`, `last_edited_at`

6. ⚠️ **Response from Stylist** (Future)
   - Stylists can reply to reviews
   - Like product vendor replies

---

## 🚨 CRITICAL FINDINGS

### ⚠️ Issue 1: No 'Completed' Bookings Yet
```
Current booking statuses:
- pending
- confirmed
- cancelled

Missing: 'completed' status!
```

**Impact**: Can't implement ratings until we have a way to mark bookings complete.

**Solution**: 
- Add 'completed' status to bookings
- Stylists mark appointments done
- OR: Auto-complete based on end_time + buffer

---

### ⚠️ Issue 2: Booking Status Workflow Unclear
```
Question: How does a booking become 'completed'?
1. Stylist manually marks it? (Need UI)
2. Auto-complete after end_time?
3. Customer confirms completion?
```

**Recommendation**: Auto-complete 1 hour after `end_time`

---

### ⚠️ Issue 3: Moderation Strategy
```
Product reviews have moderation (pending/approved/rejected)
Should stylist ratings also be moderated?
```

**Options**:
- **Option A**: Auto-approve (faster, trust customers)
- **Option B**: Manual moderation (safer, slower)
- **Option C**: Hybrid (auto-approve 4-5 stars, review 1-3 stars)

**Recommendation**: Start with Option A (auto-approve)

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 8 (Implementation):

**Database**:
- [ ] Create `stylist_ratings` table
- [ ] Create indexes
- [ ] Create trigger for rating_average update
- [ ] Add RLS policies
- [ ] Add booking status 'completed' to enum (if needed)

**Backend API**:
- [ ] POST /api/stylists/rate - Create rating
- [ ] GET /api/stylists/:id/ratings - Fetch ratings
- [ ] GET /api/bookings/:id/can-rate - Check if ratable

**Frontend**:
- [ ] Create `RatingModal` component
- [ ] Add "Rate Stylist" button to My Bookings
- [ ] Update `StylistCard` to use real ratings
- [ ] Handle rating submission
- [ ] Show success toast

**Testing**:
- [ ] Test rating submission
- [ ] Test one-rating-per-booking constraint
- [ ] Test RLS policies
- [ ] Test rating_average calculation
- [ ] Test UI on different devices

---

## ✅ PHASE 1 COMPLETE - KEY FINDINGS

### What Exists ✅:
1. `stylist_profiles.rating_average` column (NULL currently)
2. `stylist_profiles.total_bookings` column
3. Frontend `StylistCard` displays ratings
4. TypeScript types expect ratings
5. Booking system fully functional
6. Product review system (can use as reference)

### What's Missing ❌:
1. `stylist_ratings` table (individual ratings)
2. Trigger to update `rating_average`
3. API endpoints for rating submission
4. Frontend rating modal/form
5. "Rate Stylist" button in My Bookings
6. 'completed' booking status workflow

### Architecture Decision ✅:
- Separate table for stylist ratings (different from product reviews)
- Similar moderation approach
- Aggregate ratings stored in `stylist_profiles`
- One rating per booking constraint

---

## 🎯 COMPLEXITY ASSESSMENT

**Overall Complexity**: 🟡 **MEDIUM**

**Why**:
- Schema design: Simple (similar to product reviews)
- Backend logic: Moderate (validation, RLS)
- Frontend: Moderate (modal component, integration)
- Testing: Moderate (ensure constraints work)

**Risk Level**: 🟢 **LOW**
- No breaking changes
- Additive feature
- Clear separation of concerns

**Time Estimate**: 
- Database: 30 minutes
- Backend: 45 minutes
- Frontend: 60 minutes
- Testing: 30 minutes
**Total**: ~2.5 hours

---

**READY FOR PHASE 2: EXPERT PANEL CONSULTATION** ✅

