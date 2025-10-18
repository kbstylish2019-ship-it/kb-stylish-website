# 📐 PHASE 4: TECHNICAL BLUEPRINT - SCHEDULE MANAGEMENT

**Excellence Protocol - Phase 4**  
**Status:** 🎯 **PRODUCTION-READY DESIGN**  
**Date:** October 16, 2025

---

## 🎯 PROBLEM STATEMENT

**Current:** Stylist dashboard exists but no schedule management UI  
**Impact:** Stylists cannot view hours or request time off  
**Backend:** ✅ 100% ready (tables, RPCs, API all working)  
**Gap:** Frontend UI components only

---

## 💡 SOLUTION: 3 COMPONENTS + 1 PAGE

### MVP Scope (6-9 hours total):
1. **Schedule Page** - `/stylist/schedule/page.tsx`
2. **WeeklyScheduleView** - Display Mon-Sun hours
3. **TimeOffRequestModal** - Request day off with budget check
4. **OverrideHistoryList** - Show upcoming/past time off

---

## 🏗️ COMPONENT ARCHITECTURE

### 1. Schedule Page (Server Component)
**File:** `src/app/stylist/schedule/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StylistSidebar from '@/components/stylist/StylistSidebar';
import SchedulePageClient from '@/components/stylist/SchedulePageClient';

export default async function StylistSchedulePage() {
  // Auth check (stylist role)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  
  const { data: isStylist } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'stylist'
  });
  if (!isStylist) redirect('/');

  return (
    <DashboardLayout sidebar={<StylistSidebar />}>
      <SchedulePageClient userId={user.id} />
    </DashboardLayout>
  );
}
```

**Lines:** ~50 (simple auth wrapper)

---

### 2. SchedulePageClient (Client Component)
**File:** `src/components/stylist/SchedulePageClient.tsx`

**Purpose:** Main container for schedule features

```typescript
'use client';

export default function SchedulePageClient({ userId }: { userId: string }) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Schedule Management</h1>
          <p className="text-gray-600">Manage your working hours and time off</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          Request Time Off
        </Button>
      </div>

      <WeeklyScheduleView userId={userId} />
      <OverrideHistoryList userId={userId} />
      
      <TimeOffRequestModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        userId={userId}
      />
    </div>
  );
}
```

**Lines:** ~80

---

### 3. WeeklyScheduleView Component
**File:** `src/components/stylist/WeeklyScheduleView.tsx`

**Purpose:** Display weekly working hours (read-only)

**Data Source:** `GET /api/stylist/schedule?start=2025-10-14&end=2025-10-20`

**API Implementation:** NEW endpoint needed
```typescript
// src/app/api/stylist/schedule/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  
  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Call RPC
  const { data, error } = await supabase.rpc('get_stylist_schedule', {
    p_stylist_id: user.id,
    p_start_date: start,
    p_end_date: end
  });
  
  return NextResponse.json({ schedule: data });
}
```

**Component:**
```typescript
export default function WeeklyScheduleView({ userId }: { userId: string }) {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    loadSchedule();
  }, []);
  
  async function loadSchedule() {
    const start = format(startOfWeek(new Date()), 'yyyy-MM-dd');
    const end = format(endOfWeek(new Date()), 'yyyy-MM-dd');
    
    const response = await fetch(`/api/stylist/schedule?start=${start}&end=${end}`);
    const { schedule } = await response.json();
    setSchedule(schedule);
    setIsLoading(false);
  }
  
  if (isLoading) return <Loader />;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left">Day</th>
              <th className="text-left">Hours</th>
              <th className="text-left">Break</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day => {
              const daySchedule = schedule.find(s => s.day_of_week === day.value);
              return (
                <tr key={day.value}>
                  <td>{day.label}</td>
                  <td>
                    {daySchedule ? 
                      `${formatTime(daySchedule.start_time_local)} - ${formatTime(daySchedule.end_time_local)}` :
                      'Day Off'
                    }
                  </td>
                  <td>
                    {daySchedule?.break_start ? 
                      `${formatTime(daySchedule.break_start)} - ${formatTime(daySchedule.break_end)}` :
                      '-'
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

**Lines:** ~120

---

### 4. TimeOffRequestModal Component
**File:** `src/components/stylist/TimeOffRequestModal.tsx`

**Purpose:** Form to request time off with budget validation

**Key Features:**
- Date picker (disable past dates)
- Reason field (optional, max 200 chars)
- Emergency checkbox
- Budget status display
- Real-time validation
- Optimistic UI update

```typescript
export default function TimeOffRequestModal({ 
  isOpen, 
  onClose, 
  userId 
}: ModalProps) {
  const [targetDate, setTargetDate] = useState('');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  
  // Load budget on mount
  useEffect(() => {
    if (isOpen) loadBudget();
  }, [isOpen]);
  
  async function loadBudget() {
    const response = await fetch('/api/stylist/override/budget');
    const data = await response.json();
    setBudget(data.budget);
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetDate) {
      setError('Please select a date');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/stylist/override/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          reason: reason.trim() || undefined,
          isEmergency,
          isClosed: true
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Request failed');
      }
      
      const result = await response.json();
      toast.success('Time off request submitted!');
      setBudget(result.budget); // Update budget
      onClose();
      
      // Trigger parent refresh
      window.dispatchEvent(new Event('override-created'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Budget Display */}
          {budget && (
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="font-medium">Budget Status:</p>
              <p>Regular: {budget.monthlyRemaining}/{budget.monthlyLimit} remaining</p>
              <p>Emergency: {budget.emergencyRemaining} remaining</p>
              <p className="text-xs text-gray-600">Resets: {formatDate(budget.resetsAt)}</p>
            </div>
          )}
          
          {/* Date Input */}
          <div>
            <Label htmlFor="date">Date</Label>
            <input
              type="date"
              id="date"
              min={minDate}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              required
            />
          </div>
          
          {/* Reason */}
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="e.g., Personal appointment"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              {reason.length}/200 characters
            </p>
          </div>
          
          {/* Emergency Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="emergency"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
            />
            <Label htmlFor="emergency">
              Emergency override (use sparingly)
            </Label>
          </div>
          
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Request Time Off'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Lines:** ~180

---

### 5. OverrideHistoryList Component
**File:** `src/components/stylist/OverrideHistoryList.tsx`

**Purpose:** Display upcoming and past time off requests

```typescript
export default function OverrideHistoryList({ userId }: { userId: string }) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    loadOverrides();
    
    // Listen for new overrides
    window.addEventListener('override-created', loadOverrides);
    return () => window.removeEventListener('override-created', loadOverrides);
  }, []);
  
  async function loadOverrides() {
    const response = await fetch('/api/stylist/override/list');
    const { overrides } = await response.json();
    setOverrides(overrides);
    setIsLoading(false);
  }
  
  const upcoming = overrides.filter(o => new Date(o.start_date) >= new Date());
  const past = overrides.filter(o => new Date(o.start_date) < new Date());
  
  if (isLoading) return <Loader />;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Off History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upcoming */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Upcoming</h4>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming time off</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(override => (
                <div key={override.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{formatDate(override.start_date)}</p>
                    {override.reason && (
                      <p className="text-sm text-gray-600">{override.reason}</p>
                    )}
                  </div>
                  <Badge>{override.override_type === 'stylist_vacation' ? 'Approved' : 'System'}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Past */}
        {past.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Past</h4>
            <div className="space-y-2">
              {past.slice(0, 5).map(override => (
                <div key={override.id} className="flex justify-between items-center p-2 bg-gray-50 rounded opacity-60">
                  <p className="text-sm">{formatDate(override.start_date)}</p>
                  <p className="text-xs text-gray-500">{override.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Lines:** ~100

---

## 🌐 NEW API ENDPOINTS NEEDED

### 1. GET `/api/stylist/schedule` ✅ NEW
**Purpose:** Fetch weekly schedule  
**Auth:** Stylist role  
**Returns:** Array of schedule days

### 2. GET `/api/stylist/override/budget` ✅ NEW
**Purpose:** Get current budget status  
**Auth:** Stylist role  
**Query:** `stylist_override_budgets` table

### 3. GET `/api/stylist/override/list` ✅ NEW
**Purpose:** List stylist's overrides  
**Auth:** Stylist role  
**Query:** `schedule_overrides WHERE stylist_user_id = user.id`

### 4. POST `/api/stylist/override/request` ✅ EXISTS
**Purpose:** Request time off  
**Already implemented!** No changes needed.

---

## 🔒 SECURITY IMPLEMENTATION

### CSRF Protection
```typescript
// Add to all forms:
const [csrfToken] = useState(() => crypto.randomUUID());

<input type="hidden" name="_csrf" value={csrfToken} />

// Server validates:
if (body._csrf !== expectedToken) {
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}
```

### Input Sanitization
```typescript
// Server-side:
function sanitizeReason(reason: string): string {
  return reason
    .trim()
    .replace(/<[^>]*>/g, '') // Strip HTML
    .slice(0, 200); // Max length
}
```

### Rate Limiting
```typescript
// Use Upstash Redis or in-memory Map:
const rateLimiter = new Map<string, number>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const lastRequest = rateLimiter.get(userId) || 0;
  
  if (now - lastRequest < 60000) { // 1 min
    return false; // Too fast
  }
  
  rateLimiter.set(userId, now);
  return true;
}
```

---

## 📊 DATABASE CHANGES NEEDED

### Add Constraints (Migration)
```sql
-- File: supabase/migrations/20251016_schedule_constraints.sql

-- Prevent duplicate override requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_no_duplicate_override
ON schedule_overrides (stylist_user_id, start_date)
WHERE override_type = 'stylist_vacation' 
  AND applies_to_all_stylists = false;

-- Validate date ranges
ALTER TABLE schedule_overrides
ADD CONSTRAINT IF NOT EXISTS check_valid_date_range
CHECK (end_date >= start_date);

-- Validate working hours
ALTER TABLE stylist_schedules
ADD CONSTRAINT IF NOT EXISTS check_valid_work_hours
CHECK (end_time_local > start_time_local);

-- Add break time validation
ALTER TABLE stylist_schedules
ADD CONSTRAINT IF NOT EXISTS check_break_within_hours
CHECK (
  break_start_time_utc IS NULL OR (
    break_start_time_utc >= start_time_utc AND
    break_end_time_utc <= end_time_utc
  )
);
```

**Deployment:** Run via Supabase MCP `apply_migration()`

---

## ⚡ PERFORMANCE OPTIMIZATIONS

### React Query Integration
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

function useSchedule(userId: string) {
  return useQuery({
    queryKey: ['schedule', userId],
    queryFn: () => fetchSchedule(userId),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

function useRequestTimeOff() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: requestTimeOff,
    onSuccess: () => {
      queryClient.invalidateQueries(['overrides']);
      toast.success('Request submitted!');
    },
  });
}
```

### Optimistic Updates
```typescript
const mutation = useMutation({
  mutationFn: requestTimeOff,
  onMutate: async (newOverride) => {
    // Cancel ongoing queries
    await queryClient.cancelQueries(['overrides']);
    
    // Snapshot previous value
    const previous = queryClient.getQueryData(['overrides']);
    
    // Optimistically update
    queryClient.setQueryData(['overrides'], (old: Override[]) => [
      ...old,
      { ...newOverride, id: 'temp', status: 'pending' }
    ]);
    
    return { previous };
  },
  onError: (err, variables, context) => {
    // Revert on error
    queryClient.setQueryData(['overrides'], context.previous);
  },
});
```

---

## 🧪 TESTING STRATEGY

### Unit Tests
```typescript
describe('TimeOffRequestModal', () => {
  it('validates date is in future', () => {
    render(<TimeOffRequestModal />);
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2020-01-01' }
    });
    fireEvent.click(screen.getByText('Request Time Off'));
    expect(screen.getByText(/date must be in future/i)).toBeInTheDocument();
  });
  
  it('shows budget status', async () => {
    mockFetch({ budget: { monthlyRemaining: 9 } });
    render(<TimeOffRequestModal isOpen={true} />);
    await waitFor(() => {
      expect(screen.getByText(/9.*remaining/i)).toBeInTheDocument();
    });
  });
});
```

### Integration Tests
```typescript
describe('Schedule Management Flow', () => {
  it('completes full time-off request', async () => {
    // 1. Load page
    render(<SchedulePageClient userId="test-id" />);
    await waitFor(() => screen.getByText('Weekly Schedule'));
    
    // 2. Open modal
    fireEvent.click(screen.getByText('Request Time Off'));
    
    // 3. Fill form
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2025-12-25' }
    });
    
    // 4. Submit
    fireEvent.click(screen.getByText('Request Time Off'));
    
    // 5. Verify success
    await waitFor(() => {
      expect(screen.getByText(/submitted/i)).toBeInTheDocument();
    });
  });
});
```

---

## 🚀 DEPLOYMENT PLAN

### Step 1: Database Migration
```bash
# Run migration via Supabase MCP
mcp1_apply_migration({
  project_id: "poxjcaogjupsplrcliau",
  name: "schedule_constraints",
  query: "-- SQL from above --"
})
```

### Step 2: API Endpoints
1. Create `/api/stylist/schedule/route.ts`
2. Create `/api/stylist/override/budget/route.ts`
3. Create `/api/stylist/override/list/route.ts`

### Step 3: Components
1. Create `SchedulePageClient.tsx`
2. Create `WeeklyScheduleView.tsx`
3. Create `TimeOffRequestModal.tsx`
4. Create `OverrideHistoryList.tsx`

### Step 4: Page
1. Update `/stylist/schedule/page.tsx`

### Step 5: Testing
1. Run `npm run build` (TypeScript check)
2. Run `npm run lint`
3. Manual testing locally
4. Deploy to staging

### Step 6: Production
1. Deploy to production
2. Monitor error logs
3. Check performance metrics

---

## 📋 IMPLEMENTATION CHECKLIST

### Database ✅
- [ ] Run migration (constraints)
- [ ] Verify indexes exist
- [ ] Test RPC functions

### API Endpoints 🆕
- [ ] GET /api/stylist/schedule
- [ ] GET /api/stylist/override/budget
- [ ] GET /api/stylist/override/list
- [ ] Add CSRF protection
- [ ] Add rate limiting
- [ ] Add input sanitization

### Components 🆕
- [ ] SchedulePageClient.tsx
- [ ] WeeklyScheduleView.tsx
- [ ] TimeOffRequestModal.tsx
- [ ] OverrideHistoryList.tsx

### Security 🔒
- [ ] CSRF tokens
- [ ] Input sanitization
- [ ] Rate limiting
- [ ] Error messages don't leak info

### Testing 🧪
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual QA
- [ ] Accessibility audit

---

## ✅ BLUEPRINT COMPLETE

**Status:** ✅ **READY FOR PHASE 5 (Expert Review)**  
**Files to Create:** 8 total (3 APIs + 4 components + 1 migration)  
**Lines of Code:** ~650 lines  
**Estimated Time:** 6-9 hours  
**Risk Level:** 🟢 **LOW**

**Next Phase:** Phase 5 (Blueprint Expert Review)
