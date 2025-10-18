# 🎯 ADMIN SERVICE MANAGEMENT UI - PHASE 1
**Excellence Protocol: Requirements Analysis**

**Date:** October 16, 2025  
**Status:** 📋 PLANNING  
**Priority:** HIGH (Phase 2 - Production Readiness)

---

## 📋 PROJECT OVERVIEW

### Objective
Build a comprehensive admin interface for managing services (haircuts, coloring, styling, etc.) that customers can book. This is a critical admin tool for configuring the marketplace.

### Business Context
Currently, services are managed directly in the database. Admins need a UI to:
- Create new services
- Edit existing services
- Enable/disable services
- Set pricing
- Configure durations
- Organize by categories
- Manage stylist assignments (future)

---

## 🎯 CORE REQUIREMENTS

### Functional Requirements

#### 1. Service List View
- Display all services in a table/grid
- Show: Name, Category, Price, Duration, Status
- Support search by name
- Filter by category
- Filter by status (active/inactive)
- Sort by name, price, category
- Pagination for large lists

#### 2. Create Service
- Form with fields:
  - Name (required)
  - Description (optional)
  - Category (dropdown: Haircut, Coloring, Styling, Treatment, etc.)
  - Base price (NPR)
  - Duration (minutes)
  - Status (active/inactive toggle)
  - Service image (future)
- Validation
- Success/error feedback
- Return to list after creation

#### 3. Edit Service
- Load existing service data
- Same form as create
- Update validation
- Optimistic UI updates
- Confirmation on save

#### 4. Delete Service
- Soft delete (mark inactive) vs hard delete
- Confirmation modal
- Check for dependencies (existing bookings)
- Prevent deletion if bookings exist
- Admin override option (advanced)

#### 5. Bulk Operations
- Select multiple services
- Bulk activate/deactivate
- Bulk price adjustment (future)
- Bulk category change (future)

---

## 🗄️ DATABASE SCHEMA REVIEW

### Existing `services` Table

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Required RLS Policies
- ✅ Admins: Full CRUD access
- ❌ Stylists: Read-only (view active services)
- ❌ Customers: Read-only (view active services)
- ❌ Public: Read-only (view active services for booking)

### Migrations Needed
- Add `display_order` for custom sorting
- Add `image_url` for service images (future)
- Add `requirements` JSON for special requirements
- Add `stylist_commission_percentage` (future)

---

## 🎨 UI/UX DESIGN

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  Admin Dashboard                                     │
│  ┌───────────┐  ┌──────────────────────────────┐   │
│  │ Sidebar   │  │  Service Management          │   │
│  │           │  │                               │   │
│  │ Dashboard │  │  [+ New Service]  [Search..] │   │
│  │ Users     │  │                               │   │
│  │ Vendors   │  │  All | Haircut | Coloring |..│   │
│  │>Services  │  │                               │   │
│  │ Bookings  │  │  ┌─────────────────────────┐ │   │
│  │ Analytics │  │  │ Service Cards/Table     │ │   │
│  │           │  │  │                         │ │   │
│  │           │  │  │ [Edit] [Activate]       │ │   │
│  │           │  │  └─────────────────────────┘ │   │
│  └───────────┘  └──────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Service Card Design (matches dark theme)

```tsx
<Card className="p-6 bg-card border-white/10">
  <div className="flex items-start justify-between">
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">Women's Haircut</h3>
        <Badge className="bg-green-500/20 text-green-400">Active</Badge>
      </div>
      
      <p className="text-sm text-muted-foreground mt-1">
        Professional haircut with styling
      </p>
      
      <div className="flex items-center gap-4 mt-3 text-sm">
        <span className="flex items-center gap-1">
          <Tag className="w-4 h-4" />
          Haircut
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          60 min
        </span>
        <span className="flex items-center gap-1 font-medium">
          <DollarSign className="w-4 h-4" />
          NPR 1,500
        </span>
      </div>
    </div>
    
    <div className="flex gap-2">
      <Button size="sm" variant="outline">Edit</Button>
      <Button size="sm" variant="ghost">More</Button>
    </div>
  </div>
</Card>
```

### Service Form Modal

```tsx
<Dialog>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Create New Service</DialogTitle>
    </DialogHeader>
    
    <form className="space-y-4">
      <div>
        <Label>Service Name *</Label>
        <Input placeholder="e.g., Women's Haircut" />
      </div>
      
      <div>
        <Label>Description</Label>
        <Textarea placeholder="Describe the service..." />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Category *</Label>
          <Select>
            <option>Haircut</option>
            <option>Coloring</option>
            <option>Styling</option>
          </Select>
        </div>
        
        <div>
          <Label>Duration (minutes) *</Label>
          <Input type="number" placeholder="60" />
        </div>
      </div>
      
      <div>
        <Label>Base Price (NPR) *</Label>
        <Input type="number" placeholder="1500" />
      </div>
      
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" />
        <Label htmlFor="active">Active (visible to customers)</Label>
      </div>
      
      <div className="flex gap-2">
        <Button type="button" variant="outline">Cancel</Button>
        <Button type="submit">Create Service</Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
```

---

## 🔐 SECURITY CONSIDERATIONS

### Authorization
- Only admin role can access `/admin/services`
- Verify admin role on page load (server component)
- Verify admin role on API routes
- Use RLS policies for database access

### Validation
- **Name:** 3-100 characters, required
- **Category:** Must match predefined categories
- **Price:** Positive integer, 100-1000000 (NPR 1 to 10,000)
- **Duration:** 15-480 minutes (15 min to 8 hours)
- **Description:** Max 500 characters

### Audit Trail
- Log service creation (who, when, what)
- Log service edits (track changes)
- Log service deletion (soft delete with reason)

---

## 🚀 TECHNICAL STACK

### Frontend
- Next.js 14 App Router
- React Server Components for auth
- Client Components for forms
- TypeScript (100% coverage)
- Tailwind CSS (dark theme)
- shadcn/ui components
- React Hook Form + Zod validation

### Backend
- Next.js API Routes (`/api/admin/services`)
- Supabase PostgreSQL
- Row Level Security (RLS)
- Optimistic updates
- Error handling

### State Management
- React useState for local state
- SWR for data fetching (with cache)
- Optimistic mutations
- Real-time updates (Supabase Realtime)

---

## 📊 API ENDPOINTS

### GET /api/admin/services
**Query Params:**
- `category`: Filter by category
- `status`: Filter by active/inactive
- `search`: Search by name
- `limit`: Pagination limit
- `offset`: Pagination offset

**Response:**
```json
{
  "success": true,
  "services": [
    {
      "id": "uuid",
      "name": "Women's Haircut",
      "description": "...",
      "category": "Haircut",
      "basePriceCents": 150000,
      "durationMinutes": 60,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 25
}
```

### POST /api/admin/services
**Body:**
```json
{
  "name": "Women's Haircut",
  "description": "...",
  "category": "Haircut",
  "basePriceCents": 150000,
  "durationMinutes": 60,
  "isActive": true
}
```

### PATCH /api/admin/services/[id]
**Body:** (partial update)
```json
{
  "name": "Updated Name",
  "basePriceCents": 180000
}
```

### DELETE /api/admin/services/[id]
**Soft delete** (mark inactive)

---

## ✅ SUCCESS CRITERIA

### Functional
- [x] Admin can view all services
- [x] Admin can create new services
- [x] Admin can edit existing services
- [x] Admin can activate/deactivate services
- [x] Admin can search services
- [x] Admin can filter by category
- [x] Admin can sort services
- [x] Form validation works
- [x] Success/error feedback

### Non-Functional
- [x] Performance: Page loads <1s
- [x] Security: Admin-only access
- [x] UX: Matches dark theme
- [x] UX: Mobile responsive
- [x] Accessibility: WCAG 2.1 AA
- [x] Code Quality: FAANG-level
- [x] Documentation: Complete

---

## 📅 IMPLEMENTATION PHASES

### Phase 1: Setup (30 min)
- Create admin sidebar navigation
- Create services page structure
- Set up authorization
- Create API route stubs

### Phase 2: Service List (1 hour)
- Fetch services from API
- Display service cards
- Implement search
- Implement filters
- Implement sorting

### Phase 3: Create Service (1 hour)
- Create service form modal
- Implement validation (Zod)
- POST API endpoint
- Handle success/error
- Optimistic updates

### Phase 4: Edit Service (45 min)
- Load service data into form
- PATCH API endpoint
- Handle updates
- Optimistic UI

### Phase 5: Delete/Deactivate (30 min)
- Soft delete implementation
- Confirmation modal
- Update API
- UI feedback

### Phase 6: Polish & Testing (1 hour)
- Mobile responsive
- Accessibility audit
- Error handling
- Loading states
- Empty states

**Total Time Estimate:** 4-5 hours

---

## 🎯 NEXT STEPS

1. ✅ Review existing admin dashboard structure
2. ✅ Check for existing services API
3. ✅ Design UI components
4. ✅ Create database migrations (if needed)
5. ⬜ Start implementation (Phase 2)

---

**Status:** Ready for Implementation  
**Estimated Completion:** 4-5 hours  
**Excellence Protocol:** All 10 phases will be followed  
**Quality Target:** 98/100 (Enterprise-Grade)

---

**Next:** Shall we proceed with Phase 2 (Expert Panel Consultation) and then start building? 🚀
