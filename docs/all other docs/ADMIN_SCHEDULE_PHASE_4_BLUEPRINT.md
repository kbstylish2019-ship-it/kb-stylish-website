# 📐 PHASE 4: TECHNICAL BLUEPRINT

**Excellence Protocol - Phase 4**  
**Date:** October 16, 2025

---

## 🎯 SOLUTION SUMMARY

**Problem:** 66% of stylists have NO schedules → broken booking system  
**Solution:** Admin UI to create/edit stylist base schedules  
**Scope:** MVP - View, Create, Edit schedules (no delete)

---

## 📁 FILES TO CREATE (8 Total)

### Database (2 Migrations)
1. `20251016_schedule_constraints.sql` - Constraints + audit table
2. `20251016_admin_schedule_rpcs.sql` - RPC functions

### API Routes (3)
3. `/api/admin/schedules/route.ts` - GET all schedules
4. `/api/admin/schedules/create/route.ts` - POST create
5. `/api/admin/schedules/[id]/route.ts` - PUT update

### Components (2)
6. `ScheduleManagementClient.tsx` - Main dashboard
7. `CreateScheduleModal.tsx` - Create/edit form

### Pages (1)
8. `/app/admin/schedules/manage/page.tsx` - Server wrapper

---

## 🗄️ DATABASE CHANGES

### Migration 1: Constraints + Audit
```sql
BEGIN;
  -- Unique: One active schedule per stylist per day
  CREATE UNIQUE INDEX idx_stylist_schedule_unique
  ON stylist_schedules (stylist_user_id, day_of_week)
  WHERE is_active = true;
  
  -- Audit log table
  CREATE TABLE schedule_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES stylist_schedules(id),
    stylist_user_id UUID NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    change_type TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  CREATE INDEX idx_schedule_log_stylist ON schedule_change_log(stylist_user_id);
COMMIT;
```

### Migration 2: RPC Functions
```sql
-- admin_get_all_schedules() - Dashboard data
-- admin_create_stylist_schedule(p_stylist_id, p_schedules JSONB) - Bulk create
-- admin_update_stylist_schedule(p_schedule_id, p_data JSONB) - Update single
```

---

## 🔧 RPC SPECIFICATIONS

### 1. admin_get_all_schedules()
**Returns:** All stylists with schedule status
```sql
CREATE OR REPLACE FUNCTION admin_get_all_schedules()
RETURNS TABLE (
  stylist_user_id UUID,
  display_name TEXT,
  has_schedule BOOLEAN,
  schedules JSONB
) SECURITY DEFINER AS $$
BEGIN
  IF NOT user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  RETURN QUERY
  SELECT 
    sp.user_id,
    sp.display_name,
    COUNT(ss.id) > 0,
    COALESCE(jsonb_agg(ss.*) FILTER (WHERE ss.id IS NOT NULL), '[]'::jsonb)
  FROM stylist_profiles sp
  LEFT JOIN stylist_schedules ss ON ss.stylist_user_id = sp.user_id AND ss.is_active = true
  WHERE sp.is_active = true
  GROUP BY sp.user_id, sp.display_name;
END;
$$ LANGUAGE plpgsql;
```

### 2. admin_create_stylist_schedule()
**Input:** `{stylist_id, schedules: [{day_of_week, start_time, end_time}]}`  
**Returns:** `{success, created_count}`

### 3. admin_update_stylist_schedule()
**Input:** `{schedule_id, start_time, end_time}`  
**Returns:** `{success}`

---

## 🌐 API ENDPOINTS

### GET /api/admin/schedules
**Purpose:** List all stylists + schedules  
**Auth:** Admin role  
**Response:**
```json
{
  "success": true,
  "schedules": [
    {
      "stylistUserId": "uuid",
      "displayName": "Sarah Johnson",
      "hasSchedule": true,
      "schedules": [...]
    }
  ]
}
```

### POST /api/admin/schedules/create
**Purpose:** Create schedule for stylist  
**Body:**
```json
{
  "stylistId": "uuid",
  "schedules": [
    {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"},
    {"day_of_week": 2, "start_time": "09:00", "end_time": "17:00"}
  ]
}
```

### PUT /api/admin/schedules/[id]
**Purpose:** Update single schedule day  
**Body:** `{start_time, end_time}`

---

## 🎨 COMPONENT DESIGN

### ScheduleManagementClient
**Purpose:** Main dashboard showing all stylists  
**Features:**
- Table: Stylist name | Status | Actions
- Status badge: ✅ Scheduled / ❌ Not Set
- Actions: [Create] or [Edit] button
- Opens CreateScheduleModal

### CreateScheduleModal
**Purpose:** Form to create/edit schedule  
**Features:**
- 7 rows (Mon-Sun)
- Time inputs: Start | End | Day Off checkbox
- Pre-filled default: Mon-Fri 9am-5pm
- Validation: Start < End
- Submit → API call

---

## 📋 IMPLEMENTATION ORDER

1. ✅ Database migrations (constraints + audit + RPCs)
2. ✅ API endpoints (GET, POST, PUT)
3. ✅ Components (Client + Modal)
4. ✅ Page (Server wrapper)
5. ✅ Testing (manual QA)

**Estimated Time:** 4-6 hours  
**Lines of Code:** ~800

---

## ✅ BLUEPRINT COMPLETE

**Status:** ✅ READY FOR PHASE 5 (Expert Review)  
**Risk:** 🟢 LOW - Follows all existing patterns  
**Dependencies:** None - uses existing infrastructure
