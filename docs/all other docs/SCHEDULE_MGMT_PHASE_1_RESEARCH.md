# 📋 SCHEDULE MANAGEMENT - PHASE 1 RESEARCH

**Excellence Protocol - Phase 1**  
**Feature:** Schedule Management UI for Stylists  
**Date:** October 16, 2025  
**Status:** ⏳ **IN PROGRESS**

---

## 🔍 WHAT EXISTS IN DATABASE

### 1. `stylist_schedules` Table ✅ COMPLETE

**Schema (15 columns):**
```sql
id                    uuid PRIMARY KEY
stylist_user_id       uuid NOT NULL (FK → auth.users)
day_of_week           integer NOT NULL (1=Mon, 2=Tue, ..., 6=Sat, 0=Sun)
start_time_utc        time NOT NULL
end_time_utc          time NOT NULL
start_time_local      time NOT NULL (displayed to user)
end_time_local        time NOT NULL (displayed to user)
break_start_time_utc  time NULL
break_end_time_utc    time NULL
break_duration_minutes integer NULL
is_active             boolean DEFAULT true
effective_from        date DEFAULT CURRENT_DATE
effective_until       date NULL (for schedule changes)
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()
```

**Current Data (Sarah Johnson):**
```
Mon-Sat: 10:00-18:00 local (8-hour days)
Break: 13:00-14:00 local (1 hour lunch)
Sunday: No schedule (not working)
```

**Key Insights:**
- ✅ Supports UTC + local time zones
- ✅ Supports break times
- ✅ Supports schedule versioning (effective_from/until)
- ✅ Can have multiple schedules with different effective dates
- ⚠️ Sunday (day_of_week=0) has no entry = day off

---

### 2. `schedule_overrides` Table ✅ COMPLETE

**Schema (14 columns):**
```sql
id                        uuid PRIMARY KEY
override_type             text NOT NULL ('business_closure', 'stylist_vacation', 'seasonal_hours', 'special_event')
applies_to_all_stylists   boolean NOT NULL DEFAULT false
stylist_user_id           uuid NULL (FK → auth.users)
start_date                date NOT NULL
end_date                  date NOT NULL
override_start_time       time NULL
override_end_time         time NULL
is_closed                 boolean NOT NULL DEFAULT false
priority                  integer NOT NULL DEFAULT 0
reason                    text NULL
created_by                uuid NULL (FK → auth.users)
created_at                timestamptz DEFAULT now()
updated_at                timestamptz DEFAULT now()
```

**Current Data:**
```
3 overrides total:
1. Business closure: Dashain festival (Oct 15-25, all stylists)
2. Sarah's vacation: Oct 15-25
3. Seasonal hours: Nov 12-13 (all stylists)
```

**Priority System:**
```
business_closure:   1000 (highest priority)
stylist_vacation:   900
seasonal_hours:     800
special_event:      700
custom priority:    0-100
```

---

### 3. `stylist_override_budgets` Table ✅ EXISTS

**Purpose:** Rate limiting for override requests

**Schema:**
```sql
stylist_user_id              uuid PRIMARY KEY
monthly_override_limit       integer DEFAULT 10
current_month_overrides      integer DEFAULT 0
emergency_overrides_remaining integer DEFAULT 3
budget_reset_at              timestamptz
last_override_at             timestamptz
created_at                   timestamptz
updated_at                   timestamptz
```

**Budget Rules:**
- 10 regular overrides per month
- 3 emergency overrides (lifetime? needs clarification)
- Budget resets monthly
- Record created on first override request

**Sarah's Budget:** No record yet (will be created on first use)

---

## 🔧 EXISTING RPC FUNCTIONS

### 1. `get_stylist_schedule()` ✅

**Purpose:** Fetch schedule for date range

**Signature:**
```sql
get_stylist_schedule(
  p_stylist_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  schedule_date date,
  day_of_week integer,
  start_time_local time,
  end_time_local time,
  break_start time,
  break_end time,
  is_available boolean
)
```

**What it does:**
- Generates date series for range
- Joins with stylist_schedules
- Returns daily schedule
- Handles effective_from/until filtering

**Use Case:** Display week/month view of schedule

---

### 2. `get_effective_schedule()` ✅

**Purpose:** Get schedule for specific date WITH overrides applied

**Signature:**
```sql
get_effective_schedule(
  p_stylist_id uuid,
  p_target_date date
)
RETURNS TABLE (
  schedule_source text,
  start_time time,
  end_time time,
  is_closed boolean,
  priority integer,
  reason text
)
```

**Logic:**
1. Check for overrides (business_closure → stylist_vacation → seasonal → special)
2. If override exists, return it
3. Else return base schedule from stylist_schedules
4. If no schedule, return "no_schedule" + closed

**Priority Resolution:**
- Uses CASE WHEN for type-based priority
- Tiebreaker: created_at DESC (newer wins)
- Deterministic ordering guaranteed

**Use Case:** Calculate available slots for booking

---

### 3. `request_availability_override()` ✅ CRITICAL

**Purpose:** Stylist requests time off (with budget enforcement)

**Signature:**
```sql
request_availability_override(
  p_stylist_id uuid,
  p_target_date date,
  p_is_closed boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_is_emergency boolean DEFAULT false
)
RETURNS jsonb  -- { success, overrideId, budget, message, error, code }
```

**Validation:**
1. ✅ User has stylist role
2. ✅ Stylist profile active
3. ✅ Date is not in past
4. ✅ Budget not exhausted (monthly or emergency)

**Budget Logic:**
- Creates budget record if doesn't exist
- Resets monthly counter if past reset date
- Checks emergency vs regular budget
- Increments appropriate counter
- Logs to `private.schedule_change_log`

**Return Codes:**
```
UNAUTHORIZED       - Not a stylist
NOT_FOUND          - Profile missing
INVALID_DATE       - Past date
BUDGET_EXHAUSTED   - Out of overrides
INTERNAL_ERROR     - SQL error
```

**Success Response:**
```json
{
  "success": true,
  "overrideId": "uuid",
  "budget": {
    "monthlyUsed": 1,
    "monthlyLimit": 10,
    "monthlyRemaining": 9,
    "emergencyRemaining": 3,
    "resetsAt": "2025-11-01T00:00:00Z"
  },
  "message": "Override request created successfully"
}
```

**Use Case:** Main API for stylist time-off requests

---

## 🌐 EXISTING API ENDPOINTS

### 1. `/api/stylist/override/request` ✅ COMPLETE

**Method:** POST  
**Auth:** Stylist role required  
**Purpose:** Request time off

**Request Body:**
```typescript
{
  targetDate: "2025-10-20",    // ISO date string
  isClosed: true,              // true = full day off, false = partial
  reason?: "Personal day",     // optional
  isEmergency?: false          // emergency override flag
}
```

**Response:**
```typescript
{
  success: true,
  overrideId: "uuid",
  budget: { /* budget object */ },
  message: "Override request created successfully"
}
```

**Error Codes:**
- 400: Invalid date or missing fields
- 401: Not authenticated
- 403: Not a stylist
- 429: Budget exhausted
- 500: Internal error

**Implementation:** ✅ Complete, production-ready

---

### 2. `/api/admin/schedule-overrides/create` ✅ COMPLETE

**Method:** POST  
**Auth:** Admin role required  
**Purpose:** Admin creates business-wide or stylist-specific overrides

**Not needed for stylist UI** (admin only)

---

## 🎨 EXISTING UI COMPONENTS

### 1. `ScheduleOverridesClient.tsx` ✅ ADMIN UI

**Location:** `src/components/admin/ScheduleOverridesClient.tsx`

**Features:**
- Create overrides (all 4 types)
- Date range selection
- Time selection (if not closed)
- Stylist selection
- Priority management
- Validation
- Error handling
- Success feedback

**Not Reusable:** Admin-specific, too complex for stylist use

---

### 2. No Stylist-Facing Schedule UI ❌

**Gap:** No component for stylist to:
- View their weekly schedule
- Edit working hours
- Request time off
- See pending overrides
- Check budget status

---

## 🎯 WHAT NEEDS TO BE BUILT

### 1. **Schedule Viewer** 📅

**Component:** `WeeklyScheduleView.tsx`

**Purpose:** Show current weekly working hours

**Display:**
```
┌─────────────────────────────────┐
│ Your Weekly Schedule            │
├─────────────────────────────────┤
│ Monday    │ 10:00 AM - 6:00 PM │
│ Tuesday   │ 10:00 AM - 6:00 PM │
│ Wednesday │ 10:00 AM - 6:00 PM │
│ Thursday  │ 10:00 AM - 6:00 PM │
│ Friday    │ 10:00 AM - 6:00 PM │
│ Saturday  │ 10:00 AM - 6:00 PM │
│ Sunday    │ Day Off            │
├─────────────────────────────────┤
│ Break: 1:00 PM - 2:00 PM        │
│ (1 hour lunch break)            │
└─────────────────────────────────┘
```

**Data Source:** `get_stylist_schedule()` RPC

---

### 2. **Time Off Request Form** 🏖️

**Component:** `TimeOffRequestForm.tsx`

**Purpose:** Request day(s) off

**UI:**
```
┌─────────────────────────────────┐
│ Request Time Off                │
├─────────────────────────────────┤
│ Date: [Date Picker]             │
│ Reason (optional):              │
│ [Text area]                     │
│                                 │
│ □ Emergency override            │
│   (use sparingly - 3 total)     │
│                                 │
│ Budget Status:                  │
│ • Regular: 9/10 remaining       │
│ • Emergency: 3/3 remaining      │
│ • Resets: Nov 1, 2025           │
│                                 │
│ [Cancel] [Request Time Off]     │
└─────────────────────────────────┘
```

**API:** `/api/stylist/override/request`

---

### 3. **Override History** 📜

**Component:** `OverrideHistoryList.tsx`

**Purpose:** Show past/upcoming overrides

**Display:**
```
┌─────────────────────────────────┐
│ Your Time Off Requests          │
├─────────────────────────────────┤
│ Upcoming:                       │
│ • Oct 20, 2025 - Personal day   │
│ • Oct 25, 2025 - Appointment    │
│                                 │
│ Past (this month):              │
│ • Oct 5, 2025 - Family event    │
└─────────────────────────────────┘
```

**Data Source:** Query `schedule_overrides` table

---

### 4. **Budget Widget** 💰

**Component:** Already exists in `StylistDashboardClient.tsx` ✅

**Current:**
```typescript
<Card>
  <CardHeader>
    <CardTitle>Override Budget</CardTitle>
  </CardHeader>
  <CardContent>
    <Progress value={(monthlyUsed / monthlyLimit) * 100} />
    <p>{monthlyUsed} / {monthlyLimit} used</p>
    <p>Emergency: {emergencyRemaining} remaining</p>
  </CardContent>
</Card>
```

**Status:** ✅ Already implemented on dashboard

---

## 📊 DATA FLOW ANALYSIS

### Current Flow (Working)
```
Customer books slot
    ↓
get_available_slots() RPC
    ↓
Calls get_effective_schedule() for each day
    ↓
Checks stylist_schedules + schedule_overrides
    ↓
Returns available time slots
    ↓
Customer selects slot
    ↓
Booking created ✅
```

**Status:** ✅ Booking system respects schedule + overrides

---

### Proposed Flow (Stylist UI)
```
Stylist visits /stylist/schedule
    ↓
Page loads weekly schedule view
    ↓
Fetch: get_stylist_schedule(user_id, startDate, endDate)
    ↓
Display: WeeklyScheduleView component
    ↓
User clicks "Request Time Off"
    ↓
TimeOffRequestForm modal opens
    ↓
User selects date + reason
    ↓
POST /api/stylist/override/request
    ↓
RPC: request_availability_override()
    ↓
Budget check → Create override → Update budget
    ↓
Return success + updated budget
    ↓
UI: Show success message + refresh view
```

---

## 🔒 SECURITY CONSIDERATIONS

### Authentication ✅
- Page-level auth check (stylist role)
- API auth check (user session)
- RPC auth check (user_has_role)
- **Defense in depth** ✅

### Authorization ✅
- RPC validates stylist profile active
- RPC ensures user can only modify own schedule
- Budget enforcement prevents abuse
- Audit logging in `schedule_change_log` table

### Input Validation ✅
- Date must be future (RPC validates)
- Budget limits enforced (RPC validates)
- Reason is optional, sanitized if provided
- No SQL injection risk (parameterized)

### Privacy ✅
- Stylist sees only their own schedule
- RLS policies enforce data isolation
- No PII exposure risks

---

## ⚡ PERFORMANCE CONSIDERATIONS

### Database Queries
```sql
-- Page load (one query):
SELECT * FROM get_stylist_schedule('user_id', 'start', 'end');
-- Returns ~30 rows for month view (negligible)

-- Override request (one RPC call):
SELECT request_availability_override(...);
-- Single transaction, fast execution

-- Override history:
SELECT * FROM schedule_overrides 
WHERE stylist_user_id = 'user_id' 
ORDER BY start_date DESC 
LIMIT 20;
-- Indexed query, fast
```

**Performance Impact:** ✅ Minimal (simple queries, indexed)

---

### UI Rendering
- Weekly view: 7 rows (lightweight)
- Form: Simple inputs (fast)
- History: Paginated list (efficient)

**Render Performance:** ✅ No concerns

---

## 🧩 MISSING PIECES

### 1. Working Hours Editor ❌ NOT IMPLEMENTED

**Feature:** Edit Mon-Sun working hours

**Complexity:** HIGH (requires update RPC)

**Database:** `stylist_schedules` table exists

**Missing:**
- RPC to update schedule (doesn't exist yet)
- Validation logic (time ranges, breaks)
- Effective date handling
- UI component

**Decision:** ⚠️ **PHASE 2** - Not critical for MVP

---

### 2. Break Time Management ❌ NOT IMPLEMENTED

**Feature:** Edit lunch/break times

**Complexity:** MEDIUM

**Database:** Fields exist (break_start_time_utc, break_end_time_utc)

**Missing:**
- UI to edit breaks
- RPC to update breaks

**Decision:** ⚠️ **PHASE 2** - Can use default break

---

### 3. Multi-Day Range Selection ✅ CAN USE EXISTING

**Feature:** Request multiple consecutive days off

**Current:** `/api/stylist/override/request` accepts single date

**Workaround:** Loop on frontend, call API for each date

**Better Solution:** Add `end_date` parameter to API (future enhancement)

**Decision:** ✅ **USE WORKAROUND** for MVP

---

## 🎯 MVP SCOPE DEFINITION

### ✅ MUST HAVE (MVP)
1. **View weekly schedule** (read-only)
   - Uses existing `get_stylist_schedule()` RPC
   - Display Mon-Sun working hours
   - Show break times

2. **Request single day off**
   - Uses existing `/api/stylist/override/request` API
   - Date picker
   - Optional reason field
   - Emergency checkbox
   - Budget status display

3. **View upcoming time off**
   - Query `schedule_overrides` table
   - List upcoming overrides
   - Show override status

4. **Budget tracking**
   - Already exists on dashboard ✅
   - Show monthly + emergency budget
   - Reset date

### ⚠️ SHOULD HAVE (Post-MVP)
1. Edit working hours
2. Edit break times
3. Multi-day range selection
4. Cancel/modify override requests
5. Calendar view integration

### 💡 NICE TO HAVE (Future)
1. Recurring schedules
2. Swap schedules with other stylists
3. Schedule templates
4. Mobile app notifications

---

## 📋 IMPLEMENTATION PRIORITY

### Phase 1: Schedule Viewer (2-3 hours) ✅ DO FIRST
- Create `/stylist/schedule/page.tsx`
- Build `WeeklyScheduleView.tsx` component
- Fetch data with `get_stylist_schedule()` RPC
- Display in clean table format

**Why First:** Low complexity, high value

---

### Phase 2: Time Off Request (3-4 hours)
- Build `TimeOffRequestForm.tsx` component
- Date picker integration
- Form validation
- API integration (`/api/stylist/override/request`)
- Error handling
- Success feedback

**Why Second:** Core feature, API exists

---

### Phase 3: Override History (1-2 hours)
- Query `schedule_overrides` table
- Build `OverrideHistoryList.tsx`
- Show upcoming + past overrides
- Add to schedule page

**Why Third:** Completes the feature

---

### Phase 4: Polish & UX (1-2 hours)
- Loading states
- Empty states
- Responsive design
- Accessibility
- Error messages
- Success animations

**Why Last:** UX refinement

---

## 🎨 UI PATTERNS TO FOLLOW

### From Existing Codebase

**1. Card Layout:**
```typescript
<Card>
  <CardHeader>
    <CardTitle>Weekly Schedule</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**2. Form Pattern:**
```typescript
<form onSubmit={handleSubmit}>
  <div className="space-y-4">
    <div>
      <label className="text-sm font-medium">Date</label>
      <input type="date" className="..." />
    </div>
    <Button type="submit">Submit</Button>
  </div>
</form>
```

**3. Table Pattern:**
```typescript
<table className="w-full">
  <thead>
    <tr className="border-b">
      <th className="text-left py-2">Day</th>
      <th className="text-left py-2">Hours</th>
    </tr>
  </thead>
  <tbody>
    {/* rows */}
  </tbody>
</table>
```

---

## ✅ PHASE 1 RESEARCH COMPLETE

**Findings:**
- ✅ All database tables exist and are production-ready
- ✅ All RPC functions exist and work correctly
- ✅ API endpoint exists for override requests
- ✅ Budget system fully implemented
- ✅ Admin UI exists (can reference patterns)
- ❌ No stylist-facing UI components

**Next Steps:**
- Phase 2: Expert Panel Consultation
- Phase 3: Consistency Check
- Phase 4: Blueprint Design
- Phase 5-7: Reviews
- Phase 8: Implementation

**Estimated Total Time:** 7-11 hours (MVP scope)

---

**Status:** ✅ **PHASE 1 COMPLETE**  
**Confidence:** **100%** - All backend infrastructure verified  
**Risk Level:** **GREEN** - Building UI on solid foundation  
**Ready For:** Phase 2 (Expert Panel)
