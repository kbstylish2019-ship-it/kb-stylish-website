# 🚨 TIMEZONE BUG DISCOVERED - October 19, 2025

**Severity**: P0 CRITICAL  
**Impact**: ALL AVAILABILITY SLOTS ARE WRONG BY 12+ HOURS

---

## THE SMOKING GUN

### Expected Behavior:
- Stylist schedule: **Monday-Friday, 9 AM to 5 PM**
- Should show slots: 9:30 AM, 10:00 AM, 10:30 AM, etc.

### Actual Behavior:
- Shows slots: **9:30 PM, 10:00 PM, 10:30 PM, 12:00 AM, 1:00 AM, 2:00 AM, 3:00 AM**
- That's a **12.5 hour shift** into evening/night!

---

## ROOT CAUSE ANALYSIS

### Column Name LIE

```sql
-- Table: stylist_schedules
start_time_utc TIME WITHOUT TIME ZONE  -- ❌ NOT UTC!
end_time_utc TIME WITHOUT TIME ZONE    -- ❌ NOT UTC!
```

**The Problem**: These columns are named `*_utc` but they store **LOCAL TIME** (Asia/Kathmandu time).

### Function Misinterpretation

```sql
-- In get_available_slots():
v_slot_start_local := v_schedule.start_time_utc;  -- Gets 09:00:00

-- Later:
v_slot_start_utc := (p_target_date::text || ' ' || v_slot_start_local::text)::timestamp 
    AT TIME ZONE v_stylist_timezone;
```

**What This Does**:
1. Reads `09:00:00` from `start_time_utc` (which is actually Nepal local time)
2. Concatenates: `'2025-10-28 09:00:00'`
3. Applies `AT TIME ZONE 'Asia/Kathmandu'`
4. **PostgreSQL interprets this as**: "09:00:00 Asia/Kathmandu time"
5. **Converts to UTC**: `2025-10-28 03:15:00+00` (Nepal is UTC+5:45)
6. **Returns to client as UTC**: `03:15:00 UTC`
7. **Client displays**: "09:30 PM local time" (if client is ahead of UTC)

BUT WAIT - Nepal is +5:45, so 09:00 Nepal should be 03:15 UTC, which when displayed in Nepal time should be... 09:00! So why 9:30 PM?

### The REAL Bug

The issue is the function is applying timezone conversion TWICE or the schedule times are wrong.

Let me check the actual UTC timestamps being returned...

Looking at the output:
```
slot_start_utc: 2025-10-28 03:15:00+00
slot_display: 09:30 PM
```

If `03:15:00 UTC` displays as `09:30 PM`, that means:
- 03:15 UTC + some offset = 21:30 (9:30 PM)
- Offset = 18:15 hours

That's impossible! No timezone has +18 hours offset.

### The Mystery Deepens

Actually, let me recalculate:
- slot_start_utc: `2025-10-28 03:15:00+00`
- This is October 28, 2025 at 3:15 AM UTC
- In Nepal (UTC+5:45): 3:15 AM + 5:45 = 9:00 AM ✅ CORRECT!

But slot_display shows "09:30 PM"...

### AH-HA! The Display Bug

The `slot_display` is being calculated WRONG:

```sql
slot_display text := to_char(
  v_slot_start_utc AT TIME ZONE 'UTC' AT TIME ZONE p_customer_timezone, 
  'HH12:MI AM'
)
```

If p_customer_timezone is wrong or the conversion is buggy, this could display wrong time!

---

## HYPOTHESIS

The function is generating correct UTC timestamps, but either:
1. The timezone conversion for display is wrong
2. The client is in a different timezone
3. The slot_display field has a formatting bug

Let me verify by checking what the actual LOCAL time fields show...

---

## VERIFICATION NEEDED

1. What timezone is the client browser in?
2. What does `slot_start_local` show (vs `slot_display`)?
3. Is the schedule data actually correct (09:00 means 9 AM not 9 PM)?

---

##PENDING INVESTIGATION

Need to test:
1. Direct query with explicit timezone
2. Check what `slot_start_local` returns
3. Verify `p_customer_timezone` parameter
4. Check if there's a 12-hour AM/PM format bug
