# 📐 PHASE 4: SOLUTION BLUEPRINT
**Customer "My Bookings" Page Implementation**

**Date:** October 16, 2025  
**Status:** ✅ PHASE 4 COMPLETE  
**Approach:** Surgical Fix (Low Risk)

---

## 4.1 APPROACH SELECTION ✅

### ☑️ CHOSEN: Surgical Fix (Minimal Change, Low Risk)

**Rationale:**
- 80% of infrastructure already exists
- Excellent reference implementation available (BookingsListClientV2)
- Only need customer-specific adaptations
- No database changes required
- No breaking changes
- Can leverage existing patterns

**Alternative Approaches Rejected:**
- ❌ Refactor: Not needed - existing code is excellent
- ❌ Rewrite: Wasteful - can adapt existing implementation

**Risk Level:** ✅ **LOW**

---

## 4.2 IMPACT ANALYSIS ✅

### Files to CREATE:

```
d:\kb-stylish\src\
├── app\
│   └── bookings\
│       └── page.tsx                  (NEW - 75 lines)
│
├── api\
│   └── bookings\
│       └── route.ts                  (NEW - 120 lines)
│
└── components\
    └── customer\
        └── MyBookingsClient.tsx      (NEW - 450 lines)
```

**Total Lines:** ~645 lines of new code

---

### Files to MODIFY:

**NONE** - Pure addition, no modifications needed!

---

### Database Migrations:

**NONE** - All schema, RLS policies, and indexes already exist!

---

### Edge Functions:

**NONE** - Using standard API routes

---

### Breaking Changes:

**NONE** - Pure addition, no existing functionality affected

---

### Rollback Plan:

```bash
# Instant rollback (frontend-only change)
vercel rollback [deployment-id]

# Or git revert
git revert [commit-hash]
git push

# Time to rollback: <2 minutes
# Data at risk: ZERO (no DB changes)
```

---

## 4.3 TECHNICAL DESIGN DOCUMENT

### 📋 Problem Statement

**Current State:**
- Customers can book appointments via booking flow
- Bookings are stored in database
- Customers receive confirmation emails
- ❌ **Customers cannot view booking history**
- ❌ **Customers cannot rebook easily**
- ❌ **Customers must contact support for booking details**

**Business Impact:**
- Poor customer experience
- High support volume
- Missed rebook opportunities
- Incomplete feature parity

**User Story:**
```
As a customer,
I want to view my booking history,
So that I can see past and upcoming appointments
And easily rebook with my favorite stylist.
```

---

### 🎯 Proposed Solution

**High-Level Approach:**
1. Create customer-facing "My Bookings" page at `/bookings`
2. Implement API endpoint to fetch customer's bookings
3. Display bookings with filters, search, and actions
4. Add rebook functionality (redirect to booking flow)
5. Enable real-time updates for booking changes

**Components:**
```
┌─────────────────────────────────────────┐
│      Navigation Header                  │
│      [My Bookings] link added           │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│      /bookings/page.tsx                 │
│      (Server Component)                 │
│      - Auth check                       │
│      - Redirect if not logged in        │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│      MyBookingsClient.tsx               │
│      (Client Component)                 │
│      - Fetch bookings via API           │
│      - Real-time subscriptions          │
│      - Filters & search                 │
│      - Display cards                    │
│      - Action buttons                   │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│      /api/bookings/route.ts             │
│      (API Route)                        │
│      - Auth validation                  │
│      - Query bookings (RLS enforced)    │
│      - Return JSON                      │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│      Supabase Database                  │
│      - bookings table                   │
│      - RLS policies enforce ownership   │
│      - Indexes optimize queries         │
└─────────────────────────────────────────┘
```

---

### 🏗️ Architecture Changes

**NO CHANGES** - Pure addition to existing architecture

**New Data Flow:**
```
Customer
  ↓ clicks "My Bookings"
Next.js Page (Server Component)
  ↓ checks auth
  ↓ redirects if not logged in
  ↓ renders Client Component
MyBookingsClient
  ↓ fetches data
API Route /api/bookings
  ↓ validates JWT
  ↓ queries database
PostgreSQL (Supabase)
  ↓ RLS filters to customer's bookings
  ↓ returns data
API Route
  ↓ transforms & returns JSON
MyBookingsClient
  ↓ displays bookings
  ↓ subscribes to real-time updates
Supabase Real-time
  ↓ pushes booking changes
MyBookingsClient
  ↓ updates UI
```

---

### 🗄️ Database Changes

**Schema:** ✅ NO CHANGES - Already exists

**RLS Policies:** ✅ NO CHANGES - Already exist

**Indexes:** ✅ NO CHANGES - Already optimized

**Verification Query:**
```sql
-- Existing index (already optimal)
CREATE INDEX idx_bookings_customer ON bookings(customer_user_id, start_time DESC);

-- Existing RLS policy (already enforced)
CREATE POLICY "Customers view own bookings" ON bookings
    FOR SELECT USING (customer_user_id = auth.uid());
```

**Result:** ✅ Database fully ready, zero changes needed

---

### 🔌 API Changes

#### New Endpoint: `GET /api/bookings`

**Purpose:** Fetch customer's bookings with optional filters

**Authentication:** Required (JWT)

**Authorization:** Customer can only view their own bookings (RLS)

**Request:**
```http
GET /api/bookings?status=upcoming&limit=50 HTTP/1.1
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter: 'all', 'upcoming', 'past', 'cancelled' |
| search | string | No | Search by service or stylist name |
| limit | number | No | Max results (default: 100) |
| offset | number | No | Pagination offset (default: 0) |

**Response (Success):**
```json
{
  "success": true,
  "bookings": [
    {
      "id": "uuid",
      "customerName": "John Doe",
      "customerPhone": "+1234567890",
      "customerEmail": "john@example.com",
      "startTime": "2025-10-20T10:00:00Z",
      "endTime": "2025-10-20T11:00:00Z",
      "status": "confirmed",
      "priceCents": 5000,
      "service": {
        "name": "Haircut & Style",
        "durationMinutes": 60,
        "category": "hair"
      },
      "stylist": {
        "displayName": "Sarah Johnson",
        "avatarUrl": "https://..."
      },
      "customerNotes": "Short on sides",
      "createdAt": "2025-10-10T15:00:00Z"
    }
  ],
  "total": 1
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized (not logged in)
- 500: Server error

**Implementation Details:**
```typescript
export async function GET(request: NextRequest) {
  // 1. Create Supabase client with SSR cookies
  const supabase = await createServerClient(...);
  
  // 2. Verify authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 401;
  
  // 3. Parse query params
  const { status, search, limit, offset } = parseParams(request);
  
  // 4. Build query (RLS automatically filters to customer's bookings)
  let query = supabase
    .from('bookings')
    .select(`
      *,
      service:service_id(name, durationMinutes, category),
      stylist:stylist_user_id(displayName, avatarUrl)
    `)
    .eq('customer_user_id', user.id)
    .order('start_time', { ascending: false });
    
  // 5. Apply filters
  if (status === 'upcoming') {
    query = query
      .gte('start_time', new Date().toISOString())
      .in('status', ['pending', 'confirmed']);
  } else if (status === 'past') {
    query = query
      .lt('start_time', new Date().toISOString())
      .not('status', 'eq', 'cancelled');
  } else if (status === 'cancelled') {
    query = query.eq('status', 'cancelled');
  }
  
  if (limit) query = query.limit(limit);
  if (offset) query = query.range(offset, offset + limit - 1);
  
  // 6. Execute
  const { data, error } = await query;
  
  // 7. Return
  return NextResponse.json({
    success: true,
    bookings: data,
    total: data.length
  });
}
```

---

### 🎨 Frontend Changes

#### 1. Page Component: `/bookings/page.tsx`

**Purpose:** Server Component for auth & layout

**Code Structure:**
```typescript
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MyBookingsClient from '@/components/customer/MyBookingsClient';

async function createClient() {
  // Standard Supabase SSR client creation
}

export default async function MyBookingsPage() {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    redirect('/login?redirect=/bookings');
  }
  
  // Render
  return (
    <DashboardLayout>
      <div className="p-6">
        <MyBookingsClient userId={user.id} />
      </div>
    </DashboardLayout>
  );
}
```

**Lines:** ~75

---

#### 2. Client Component: `MyBookingsClient.tsx`

**Purpose:** Interactive booking list with filters, search, actions

**Features:**
- ✅ Fetch bookings from API
- ✅ Real-time updates via WebSocket
- ✅ Client-side filtering (instant)
- ✅ Debounced search (300ms)
- ✅ Status badges (color-coded)
- ✅ Booking cards (responsive)
- ✅ Actions: View Details, Rebook, Cancel
- ✅ Empty states
- ✅ Loading skeletons
- ✅ Error handling
- ✅ Accessibility (WCAG 2.1)

**State Management:**
```typescript
const [bookings, setBookings] = useState<Booking[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [filter, setFilter] = useState<FilterType>('upcoming');
const [searchInput, setSearchInput] = useState('');
const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
```

**UI Structure:**
```tsx
<div className="space-y-6">
  {/* Header */}
  <div>
    <h1>My Bookings</h1>
    <p>{filteredBookings.length} bookings</p>
  </div>
  
  {/* Filters */}
  <div className="flex gap-2">
    <Button filter="all">All</Button>
    <Button filter="upcoming">Upcoming</Button>
    <Button filter="past">Past</Button>
    <Button filter="cancelled">Cancelled</Button>
  </div>
  
  {/* Search */}
  <Input 
    placeholder="Search by service or stylist..."
    value={searchInput}
    onChange={handleSearch}
  />
  
  {/* Booking List */}
  <div className="grid gap-4">
    {filteredBookings.map(booking => (
      <BookingCard
        key={booking.id}
        booking={booking}
        onRebook={handleRebook}
        onCancel={handleCancel}
        onViewDetails={handleViewDetails}
      />
    ))}
  </div>
  
  {/* Empty State */}
  {filteredBookings.length === 0 && (
    <EmptyState filter={filter} />
  )}
  
  {/* Details Modal */}
  <BookingDetailsModal
    booking={selectedBooking}
    onClose={() => setSelectedBooking(null)}
  />
</div>
```

**Booking Card Design:**
```tsx
<Card className="p-4">
  <div className="flex items-start justify-between">
    {/* Left: Service & Stylist */}
    <div className="flex gap-3">
      <Avatar src={booking.stylist.avatarUrl} />
      <div>
        <h3>{booking.service.name}</h3>
        <p>with {booking.stylist.displayName}</p>
        <p className="text-sm">
          {formatDate(booking.startTime)}
        </p>
      </div>
    </div>
    
    {/* Right: Status & Price */}
    <div className="text-right">
      <Badge status={booking.status} />
      <p className="font-bold">
        NPR {booking.priceCents / 100}
      </p>
    </div>
  </div>
  
  {/* Actions */}
  <div className="flex gap-2 mt-4">
    <Button onClick={onViewDetails}>Details</Button>
    <Button onClick={onRebook}>Rebook</Button>
    {canCancel && (
      <Button variant="destructive" onClick={onCancel}>
        Cancel
      </Button>
    )}
  </div>
</Card>
```

**Lines:** ~450

---

### 🔒 Security Considerations

#### 1. Authentication
```typescript
// Server Component
if (!user) {
  redirect('/login?redirect=/bookings');
}

// API Route
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

#### 2. Authorization (RLS)
```sql
-- Automatic enforcement by Supabase
CREATE POLICY "Customers view own bookings" ON bookings
    FOR SELECT USING (customer_user_id = auth.uid());
```

#### 3. Input Validation
```typescript
// API Route
const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
const status = ['all', 'upcoming', 'past', 'cancelled'].includes(status) ? status : 'all';
```

#### 4. Output Sanitization
```typescript
// React escapes by default
<p>{booking.customerName}</p>  // Safe

// If using dangerouslySetInnerHTML (we're not)
// Must sanitize with DOMPurify
```

#### 5. CSRF Protection
```typescript
// JWT in HTTP-only cookie (not accessible to JS)
// Same-origin policy enforced
// No additional CSRF token needed
```

#### 6. Rate Limiting
```typescript
// Vercel Edge Config (already configured)
// 100 requests/minute per IP
```

---

### ⚡ Performance Considerations

#### 1. Database Query Optimization
```sql
-- Existing index (already optimal)
CREATE INDEX idx_bookings_customer 
  ON bookings(customer_user_id, start_time DESC);

-- Query plan (sub-10ms)
Index Scan using idx_bookings_customer
  Index Cond: (customer_user_id = 'user-id')
  Time: 0.05ms
```

#### 2. API Response Caching
```typescript
// No caching (data changes frequently + personalized)
// Fast query (<10ms) makes caching unnecessary
```

#### 3. Client-Side Filtering
```typescript
// Filter 1000 bookings: <50ms (instant)
const filtered = useMemo(() => {
  return bookings.filter(b => {
    if (filter === 'upcoming') return isFuture(b.startTime);
    if (filter === 'past') return isPast(b.startTime);
    return true;
  }).filter(b => 
    b.service.name.includes(search) ||
    b.stylist.displayName.includes(search)
  );
}, [bookings, filter, search]);
```

#### 4. Debounced Search
```typescript
// Wait 300ms after typing stops
const debouncedSearch = useDebouncedValue(searchInput, 300);
```

#### 5. Real-time Updates
```typescript
// WebSocket (not polling)
// Only updates when booking changes
// Minimal bandwidth usage
```

---

### 🧪 Testing Strategy

#### Unit Tests
```typescript
// MyBookingsClient.test.tsx
describe('MyBookingsClient', () => {
  test('fetches bookings on mount', async () => {
    render(<MyBookingsClient userId="user-123" />);
    await waitFor(() => {
      expect(screen.getByText('Haircut')).toBeInTheDocument();
    });
  });
  
  test('filters by status', () => {
    render(<MyBookingsClient userId="user-123" />);
    fireEvent.click(screen.getByText('Upcoming'));
    expect(screen.queryByText('Past booking')).not.toBeInTheDocument();
  });
  
  test('searches bookings', async () => {
    render(<MyBookingsClient userId="user-123" />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'Haircut' }
    });
    await waitFor(() => {
      expect(screen.getByText('Haircut')).toBeInTheDocument();
      expect(screen.queryByText('Manicure')).not.toBeInTheDocument();
    });
  });
});
```

#### Integration Tests
```typescript
// api/bookings.test.ts
describe('GET /api/bookings', () => {
  test('returns bookings for authenticated user', async () => {
    const response = await fetch('/api/bookings', {
      headers: { Authorization: 'Bearer valid-token' }
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.bookings)).toBe(true);
  });
  
  test('returns 401 for unauthenticated user', async () => {
    const response = await fetch('/api/bookings');
    expect(response.status).toBe(401);
  });
});
```

#### E2E Tests
```typescript
// e2e/my-bookings.spec.ts
test('customer can view and rebook', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'customer@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Navigate to My Bookings
  await page.click('text=My Bookings');
  await expect(page).toHaveURL('/bookings');
  
  // Verify bookings load
  await expect(page.locator('text=Haircut')).toBeVisible();
  
  // Filter to upcoming
  await page.click('text=Upcoming');
  
  // Search
  await page.fill('[placeholder*="Search"]', 'Sarah');
  await expect(page.locator('text=Sarah Johnson')).toBeVisible();
  
  // Rebook
  await page.click('text=Rebook');
  await expect(page).toHaveURL(/\/book/);
  await expect(page.locator('[name="stylist"]')).toHaveValue('sarah-johnson');
});
```

---

### 🚀 Deployment Plan

#### Step 1: Pre-Deployment Checks
```bash
# Run all tests
npm test

# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build
```

#### Step 2: Deploy to Staging
```bash
# Deploy to preview
vercel deploy

# Run E2E tests against staging
npm run test:e2e:staging
```

#### Step 3: Deploy to Production
```bash
# Deploy to production
vercel deploy --prod

# Monitor logs
vercel logs --follow
```

#### Step 4: Post-Deployment Verification
```bash
# Health check
curl https://kb-stylish.com/api/health

# Test booking page
curl https://kb-stylish.com/bookings

# Monitor errors
# Vercel Dashboard → Analytics → Errors
```

---

### 🔄 Rollback Plan

#### Scenario 1: Critical Bug Found

```bash
# Instant rollback (< 2 minutes)
vercel rollback [previous-deployment-id]

# Or via dashboard
# Vercel Dashboard → Deployments → Previous → Promote to Production
```

#### Scenario 2: Performance Issues

```bash
# Rollback to previous version
vercel rollback

# Investigate offline
git checkout -b fix/performance-issue
# Fix issue
# Re-deploy after verification
```

#### Scenario 3: Database Issues

```bash
# No database changes made
# Just rollback frontend
vercel rollback

# No data migration needed
# No data at risk
```

**Rollback Time:** < 2 minutes  
**Data at Risk:** ZERO (no DB changes)  
**Blast Radius:** Isolated to /bookings page

---

## ✅ PHASE 4 COMPLETE: BLUEPRINT READY

### 📊 Blueprint Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Approach Selected | ✅ Surgical Fix | Low risk, high confidence |
| Files Identified | ✅ 3 new files | Page, API, Component |
| Database Changes | ✅ NONE | Already ready |
| Breaking Changes | ✅ NONE | Pure addition |
| Security Design | ✅ Complete | Auth + RLS |
| Performance Design | ✅ Complete | Optimized |
| Testing Strategy | ✅ Complete | Unit + E2E |
| Deployment Plan | ✅ Complete | Step-by-step |
| Rollback Plan | ✅ Complete | < 2 min |

**Blueprint Status:** ✅ **READY FOR EXPERT REVIEW**

---

**Next:** PHASE 5 - Expert Panel Review of Blueprint

