# 👥 PHASE 2: EXPERT PANEL - ADMIN SCHEDULE MANAGEMENT

**Excellence Protocol - Phase 2**  
**Date:** October 16, 2025  
**Status:** ✅ **5 EXPERTS CONSULTED**

---

## 🎓 EXPERT PANEL COMPOSITION

1. **Security Architect** - Auth, RBAC, data protection
2. **Database Architect** - Data integrity, performance, migrations  
3. **UX/Accessibility Engineer** - User experience, WCAG compliance
4. **Backend Engineer** - API design, RPCs, error handling
5. **Product Manager** - Business logic, workflow, edge cases

---

## 🔒 EXPERT 1: SECURITY ARCHITECT

### Critical Security Concerns

**FINDING 1: No RPC Functions for Schedule Management** 🔴 CRITICAL
- **Risk:** Admins must write raw SQL queries
- **Impact:** No validation, audit logging, or access control
- **CVSS:** 7.5 (High) - Privilege escalation via SQL injection
- **Recommendation:**
  ```sql
  CREATE OR REPLACE FUNCTION admin_create_schedule(...)
  RETURNS JSONB AS $$
  BEGIN
    -- 1. Verify admin role
    IF NOT user_has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;
    
    -- 2. Validate input
    -- 3. Insert with transaction
    -- 4. Audit log
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```

**FINDING 2: Missing Audit Logging** 🔴 CRITICAL  
- **Risk:** No accountability for schedule changes
- **Impact:** Cannot track who modified stylist hours
- **Recommendation:** Create `schedule_change_log` table
  ```sql
  CREATE TABLE schedule_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES stylist_schedules(id),
    changed_by UUID REFERENCES auth.users(id),
    change_type TEXT, -- 'create', 'update', 'deactivate'
    old_value JSONB,
    new_value JSONB,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

**FINDING 3: RLS Policies Missing** 🟡 MEDIUM
- **Current:** `stylist_schedules` table has no RLS
- **Risk:** Any authenticated user can read schedules
- **Recommendation:**
  ```sql
  ALTER TABLE stylist_schedules ENABLE ROW LEVEL SECURITY;
  
  -- Admins can do everything
  CREATE POLICY admin_all ON stylist_schedules
    FOR ALL USING (user_has_role(auth.uid(), 'admin'));
  
  -- Stylists can only read their own
  CREATE POLICY stylist_read_own ON stylist_schedules
    FOR SELECT USING (stylist_user_id = auth.uid());
  ```

**FINDING 4: Timezone Confusion Risk** 🟡 MEDIUM
- **Problem:** Table has both `_utc` and `_local` columns
- **Risk:** Admin sets local time, UTC calculation wrong
- **Recommendation:** 
  - Store only UTC in database
  - Convert to local in application layer
  - Or: Use PostgreSQL timezone type

**FINDING 5: No Input Sanitization** 🟢 LOW
- **Risk:** XSS via reason field (if added later)
- **Recommendation:** Server-side sanitization in RPC

### Security Checklist for Implementation

- [ ] Create SECURITY DEFINER RPCs with role checks
- [ ] Implement audit logging table
- [ ] Enable RLS on `stylist_schedules`
- [ ] Add RLS policies (admin + stylist)
- [ ] Validate all inputs server-side
- [ ] Use prepared statements (no string concatenation)
- [ ] Log all schedule mutations

---

## 🗄️ EXPERT 2: DATABASE ARCHITECT

### Data Integrity Concerns

**FINDING 1: No Unique Constraint on Day** 🔴 CRITICAL
- **Problem:** Can insert multiple schedules for same day
- **Impact:** Booking system confusion (which hours to use?)
- **Current:**
  ```sql
  -- Can insert duplicates!
  INSERT stylist_schedules (stylist_user_id, day_of_week, ...) VALUES ('user1', 1, ...);
  INSERT stylist_schedules (stylist_user_id, day_of_week, ...) VALUES ('user1', 1, ...);
  ```
- **Fix:**
  ```sql
  CREATE UNIQUE INDEX idx_stylist_schedule_unique
  ON stylist_schedules (stylist_user_id, day_of_week)
  WHERE is_active = true;
  ```

**FINDING 2: Orphaned Schedules Risk** 🟡 MEDIUM
- **Scenario:** Stylist account deleted → schedule remains
- **Impact:** Foreign key violation or orphaned records
- **Current:** FK exists but no CASCADE rule
- **Recommendation:**
  ```sql
  ALTER TABLE stylist_schedules
  DROP CONSTRAINT IF EXISTS stylist_schedules_stylist_user_id_fkey,
  ADD CONSTRAINT stylist_schedules_stylist_user_id_fkey
    FOREIGN KEY (stylist_user_id) 
    REFERENCES stylist_profiles(user_id)
    ON DELETE CASCADE;
  ```

**FINDING 3: No Index on Stylist + Date Range** 🟡 MEDIUM
- **Query Pattern:** `WHERE stylist_user_id = X AND day_of_week IN (1,2,3)`
- **Performance:** Full table scan for large datasets
- **Recommendation:**
  ```sql
  CREATE INDEX idx_stylist_schedules_lookup
  ON stylist_schedules (stylist_user_id, day_of_week)
  WHERE is_active = true;
  ```

**FINDING 4: UTC Calculation Not Automated** 🟡 MEDIUM
- **Problem:** Admin must manually calculate UTC times
- **Risk:** Human error (daylight saving, timezone offset)
- **Recommendation:** Use PostgreSQL function
  ```sql
  CREATE OR REPLACE FUNCTION local_to_utc(
    p_local_time TIME,
    p_timezone TEXT DEFAULT 'Asia/Kathmandu'
  ) RETURNS TIME AS $$
  BEGIN
    -- Convert local to UTC using timezone
    RETURN (CURRENT_DATE || ' ' || p_local_time)::TIMESTAMPTZ 
           AT TIME ZONE 'UTC' AT TIME ZONE p_timezone;
  END;
  $$ LANGUAGE plpgsql IMMUTABLE;
  ```

**FINDING 5: No CHECK Constraint on Day Range** 🟢 LOW
- **Problem:** Can insert invalid day_of_week (e.g., 99)
- **Fix:**
  ```sql
  ALTER TABLE stylist_schedules
  ADD CONSTRAINT check_valid_day_of_week
  CHECK (day_of_week >= 0 AND day_of_week <= 6);
  ```

### Database Migration Plan

**Migration 1: Add Constraints**
```sql
BEGIN;
  -- Unique day per stylist
  CREATE UNIQUE INDEX idx_stylist_schedule_unique
  ON stylist_schedules (stylist_user_id, day_of_week)
  WHERE is_active = true;
  
  -- Valid day range
  ALTER TABLE stylist_schedules
  ADD CONSTRAINT check_valid_day_of_week
  CHECK (day_of_week >= 0 AND day_of_week <= 6);
  
  -- Performance index
  CREATE INDEX idx_stylist_schedules_lookup
  ON stylist_schedules (stylist_user_id, day_of_week, is_active);
COMMIT;
```

**Migration 2: Audit Log Table**
```sql
CREATE TABLE schedule_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES stylist_schedules(id) ON DELETE CASCADE,
  stylist_user_id UUID NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'deactivate')),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_log_stylist ON schedule_change_log(stylist_user_id);
CREATE INDEX idx_schedule_log_date ON schedule_change_log(changed_at DESC);
```

---

## 🎨 EXPERT 3: UX/ACCESSIBILITY ENGINEER

### User Experience Findings

**FINDING 1: Time Input UX is Critical** 🔴 CRITICAL
- **Problem:** Native `<input type="time">` has poor UX
- **Issues:**
  - Browser inconsistencies
  - Difficult for touch devices
  - No validation feedback
  - Confusing 12/24 hour format
- **Recommendation:** Use custom time picker
  ```typescript
  // Option 1: react-time-picker (lightweight)
  import TimePicker from 'react-time-picker';
  
  // Option 2: Build custom dropdown
  <select>{hours}</select> : <select>{minutes}</select>
  
  // Option 3: Mask input
  <Input mask="99:99" placeholder="HH:MM" />
  ```

**FINDING 2: "Day Off" UX Pattern** 🟡 MEDIUM
- **Problem:** How to indicate a day is off?
- **Options:**
  1. Checkbox: "[ ] Day Off" → Clear, simple
  2. Empty time fields → Ambiguous
  3. Special value: "00:00 - 00:00" → Confusing
- **Recommendation:** Checkbox pattern
  ```tsx
  {DAYS.map(day => (
    <div key={day}>
      <Checkbox 
        checked={!schedule[day].isOff}
        onChange={() => toggleDay(day)}
      />
      {!schedule[day].isOff && (
        <TimeInput start={schedule[day].start} end={schedule[day].end} />
      )}
    </div>
  ))}
  ```

**FINDING 3: Default Template Needed** 🟡 MEDIUM
- **Problem:** Empty form is intimidating
- **UX:** Pre-fill with common schedule (Mon-Fri 9-5)
- **Recommendation:**
  ```typescript
  const DEFAULT_SCHEDULE = {
    monday: { start: '09:00', end: '17:00', isOff: false },
    tuesday: { start: '09:00', end: '17:00', isOff: false },
    // ... weekdays same
    saturday: { isOff: true },
    sunday: { isOff: true }
  };
  ```

**FINDING 4: Validation Feedback** 🟡 MEDIUM
- **Must validate:**
  - Start < End time
  - Break within working hours
  - At least one working day
- **UX:** Real-time inline validation
  ```tsx
  {error && (
    <p className="text-sm text-red-600 mt-1">
      ⚠️ End time must be after start time
    </p>
  )}
  ```

**FINDING 5: Keyboard Navigation** 🟢 WCAG AA
- **Requirement:** Tab through all time inputs
- **Pattern:**
  ```tsx
  <input 
    type="time" 
    tabIndex={dayIndex * 2 + 1}
    aria-label="Start time for Monday"
  />
  ```

### Accessibility Checklist

- [ ] Semantic HTML (table for schedule grid)
- [ ] ARIA labels on all time inputs
- [ ] Keyboard navigation (tab order logical)
- [ ] Screen reader announcements for errors
- [ ] Focus management (auto-focus first input)
- [ ] Color contrast WCAG AA (3:1 minimum)
- [ ] Loading states announced

---

## ⚡ EXPERT 4: BACKEND ENGINEER

### API Design Recommendations

**FINDING 1: RESTful API Structure** ✅ RECOMMENDED
```
GET    /api/admin/schedules              → List all stylists + schedules
GET    /api/admin/schedules/:stylistId   → Get schedule for one stylist
POST   /api/admin/schedules               → Create new schedule (all 7 days)
PUT    /api/admin/schedules/:stylistId   → Update entire schedule
DELETE /api/admin/schedules/:stylistId   → Deactivate schedule
```

**FINDING 2: Batch vs Individual Day Endpoints** 🤔 DECISION NEEDED
- **Option A:** Bulk endpoint (all 7 days in one call)
  - ✅ Atomic transaction
  - ✅ Simpler API
  - ❌ Harder to update single day
  
- **Option B:** Individual day endpoints
  - ✅ Granular updates
  - ❌ 7 API calls to create schedule
  - ❌ Partial failure scenarios

- **Recommendation:** Hybrid approach
  ```typescript
  POST /api/admin/schedules          → Create full week (7 days)
  PATCH /api/admin/schedules/:id/day/:dayOfWeek → Update single day
  ```

**FINDING 3: Response Format Standardization** ✅
```typescript
// Success
{
  success: true,
  data: {
    scheduleId: 'uuid',
    stylistId: 'uuid',
    schedules: [...]
  },
  message: 'Schedule created successfully'
}

// Error
{
  success: false,
  error: 'Validation failed',
  code: 'INVALID_TIME_RANGE',
  details: {
    field: 'monday.end_time',
    message: 'End time must be after start time'
  }
}
```

**FINDING 4: RPC Function Design Pattern** ✅

**Admin Create Schedule RPC:**
```sql
CREATE OR REPLACE FUNCTION admin_create_stylist_schedule(
  p_stylist_id UUID,
  p_schedules JSONB  -- Array of {day_of_week, start, end, break_start, break_end}
) RETURNS JSONB AS $$
DECLARE
  v_day_schedule JSONB;
  v_created_count INTEGER := 0;
BEGIN
  -- 1. Auth check
  IF NOT user_has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Unauthorized',
      'code', 'FORBIDDEN'
    );
  END IF;
  
  -- 2. Verify stylist exists
  IF NOT EXISTS (
    SELECT 1 FROM stylist_profiles WHERE user_id = p_stylist_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist not found',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  -- 3. Begin transaction
  FOR v_day_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    -- Validate
    IF (v_day_schedule->>'start_time')::TIME >= (v_day_schedule->>'end_time')::TIME THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid time range',
        'code', 'INVALID_TIME'
      );
    END IF;
    
    -- Insert
    INSERT INTO stylist_schedules (
      stylist_user_id,
      day_of_week,
      start_time_local,
      end_time_local,
      start_time_utc,
      end_time_utc,
      is_active
    ) VALUES (
      p_stylist_id,
      (v_day_schedule->>'day_of_week')::INTEGER,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      -- TODO: UTC conversion
      (v_day_schedule->>'start_time')::TIME, 
      (v_day_schedule->>'end_time')::TIME,
      true
    );
    
    v_created_count := v_created_count + 1;
  END LOOP;
  
  -- 4. Audit log
  INSERT INTO schedule_change_log (
    stylist_user_id,
    changed_by,
    change_type,
    new_value
  ) VALUES (
    p_stylist_id,
    auth.uid(),
    'create',
    p_schedules
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'message', 'Schedule created successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**FINDING 5: Error Handling Strategy** ✅
```typescript
// API Route error handling
try {
  const result = await supabase.rpc('admin_create_stylist_schedule', {...});
  
  if (!result.success) {
    // Map RPC errors to HTTP status codes
    const statusCode = {
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'INVALID_TIME': 400,
      'INTERNAL_ERROR': 500
    }[result.code] || 500;
    
    return NextResponse.json(result, { status: statusCode });
  }
  
  return NextResponse.json(result);
} catch (err) {
  logError('AdminSchedule', 'Unexpected error', { error: err });
  return NextResponse.json(
    { success: false, error: 'Internal server error' },
    { status: 500 }
  );
}
```

---

## 📊 EXPERT 5: PRODUCT MANAGER

### Business Logic & Edge Cases

**FINDING 1: Schedule Conflict Detection** 🔴 CRITICAL
- **Scenario:** Admin creates overlapping schedules
  - Stylist has Mon 9-5 (active)
  - Admin creates Mon 10-6 (new)
- **Question:** Should this be allowed?
- **Recommendation:** NO - enforce unique active schedule per day
  ```sql
  -- Already recommended by DB Architect
  CREATE UNIQUE INDEX idx_stylist_schedule_unique
  ON stylist_schedules (stylist_user_id, day_of_week)
  WHERE is_active = true;
  ```

**FINDING 2: Schedule Change vs Override** 🟡 IMPORTANT
- **Use Case Clarity:**
  - **Base Schedule:** "Stylist normally works Mon-Fri 9-5"
  - **Override:** "But on Dec 25, stylist is off (Christmas)"
- **Admin Workflow:**
  1. Create base schedule (one-time)
  2. Create overrides for exceptions
- **Should NOT:**
  - Create new base schedule every time hours change
  - Use overrides for permanent changes

**FINDING 3: Effective Date Range** 🟡 IMPORTANT
- **Use Case:** "Summer hours start June 1"
- **Solution:** Use `effective_from` and `effective_until`
  ```sql
  -- Winter schedule (Oct - May)
  INSERT INTO stylist_schedules (..., effective_from = '2025-10-01', effective_until = '2026-05-31');
  
  -- Summer schedule (Jun - Sep)
  INSERT INTO stylist_schedules (..., effective_from = '2026-06-01', effective_until = '2026-09-30');
  ```
- **Edge Case:** What if ranges overlap?
- **Solution:** Use `priority` field or prevent overlaps

**FINDING 4: Booking Impact Communication** 🟡 IMPORTANT
- **Scenario:** Admin changes stylist hours
- **Impact:** Existing bookings may become invalid
- **Recommendation:**
  - Show warning: "3 bookings affected by this change"
  - Require confirmation
  - Send notifications to affected customers

**FINDING 5: Bulk Operations** 🟢 NICE-TO-HAVE
- **Use Case:** "Copy Sarah's schedule to new stylist Shishir"
- **MVP:** Not needed, can add later
- **Future Feature:**
  ```typescript
  POST /api/admin/schedules/copy
  Body: { sourceId: 'sarah', targetIds: ['shishir', 'rabindra'] }
  ```

### User Stories - Priority Order

**P0 (Must Have):**
1. As admin, I can CREATE a schedule for a stylist (all 7 days)
2. As admin, I can VIEW which stylists have/don't have schedules
3. As admin, I can EDIT an existing schedule
4. As admin, schedule changes are VALIDATED (start < end)

**P1 (Should Have):**
5. As admin, I can see AUDIT LOG of schedule changes
6. As admin, I can DEACTIVATE a schedule
7. As admin, I get WARNING if change affects bookings

**P2 (Nice to Have):**
8. As admin, I can COPY schedule between stylists
9. As admin, I can set EFFECTIVE DATE ranges
10. As admin, I can BULK edit multiple stylists

---

## 📋 CONSOLIDATED EXPERT RECOMMENDATIONS

### 🔴 CRITICAL (Must Fix Before Launch)

1. **Create RPC Functions** (Security + Backend)
   - `admin_create_stylist_schedule()`
   - `admin_update_stylist_schedule()`
   - `admin_get_all_schedules()`

2. **Add Unique Constraint** (Database)
   - One active schedule per stylist per day

3. **Implement Audit Logging** (Security)
   - Track all schedule changes

4. **Custom Time Picker** (UX)
   - Native `<input type="time">` has poor UX

5. **Enable RLS** (Security)
   - Prevent unauthorized access

### 🟡 HIGH PRIORITY (Should Include)

6. **Add Indexes** (Database)
   - Performance optimization

7. **Default Template** (UX)
   - Pre-fill Mon-Fri 9-5 schedule

8. **Validation Feedback** (UX)
   - Real-time error messages

9. **UTC Conversion Function** (Database)
   - Automate timezone calculations

10. **Error Handling** (Backend)
    - Standardized error responses

### 🟢 NICE TO HAVE (Future)

11. **Copy Schedule Feature** (Product)
12. **Effective Date Ranges** (Product)
13. **Booking Impact Warning** (Product)

---

## ✅ PHASE 2 COMPLETE

**Expert Consultations:** 5  
**Critical Issues Found:** 5  
**High Priority Items:** 5  
**Nice-to-Have Features:** 3  

**Consensus:** All experts agree system is feasible and valuable. Critical security and data integrity issues identified and solutions proposed.

**Next Phase:** Phase 3 - Consistency Check

**Status:** ✅ **READY FOR PHASE 3**
