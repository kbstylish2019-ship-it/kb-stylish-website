# 🚨 URGENT: price_cents Error Debug Protocol

## What We Know:
- ✅ Database has `base_price_cents` column
- ✅ Functions return `price_cents` correctly
- ✅ API transforms correctly
- ✅ Code is correct
- ❌ Error still appears in UI

## 🔬 DEBUGGING STEPS (DO THESE IN ORDER):

### Step 1: Check Browser Console
1. Open browser (Chrome/Edge)
2. Press `F12` to open DevTools
3. Go to **Console** tab
4. **Clear all logs**
5. Go to `localhost:3000/book-a-stylist`
6. Click any stylist
7. Select any service
8. Pick a date (Nov 3, 2025)

**SCREENSHOT the FULL console output and send to me!**

### Step 2: Check Network Tab  
1. In DevTools, go to **Network** tab
2. Clear network log
3. Repeat: Click stylist → Select service → Pick date
4. Find the request to `/api/bookings/available-slots`
5. Click on it
6. Go to **Preview** or **Response** tab

**SCREENSHOT the response body and send to me!**

### Step 3: Test Direct API Call
Open browser console and run:
```javascript
aakriti bhandari third time

confirmed
Facial Treatment
•
60 min
•
NPR 2000.00
Oct 27, 2025
1:00 PM - 2:00 PM
📞 9847585080
📧 aakriti@gmail.com
📍 johand, baspata, gulmi, Bagmati Province 44600
```

**SCREENSHOT the console output!**

### Step 4: Check if Error is from Service List
1. On booking page, BEFORE clicking any stylist
2. Open console
3. Check if there are ANY errors already

**Does the error appear BEFORE you click a stylist?**

### Step 5: Check Build Cache
Run these commands:
```bash
# Stop dev server (Ctrl+C)

# Delete Next.js cache
rm -rf .next
# Or on Windows:
rmdir /s /q .next

# Delete node_modules (nuclear option)
rm -rf node_modules
npm install

# Restart dev server
npm run dev
```

**Does error still appear after rebuild?**

### Step 6: Test with Hardcoded Stylist ID
Edit `src/components/booking/BookingModal.tsx` line 92-97:

REPLACE:
```typescript
const slots = await fetchAvailableSlots({
  stylistId: stylist.id,
  serviceId: selectedService.id,
  targetDate,
  customerTimezone: 'Asia/Kathmandu'
});
```

WITH:
```typescript
console.log('Fetching slots with:', {
  stylistId: stylist.id,
  serviceId: selectedService.id,
  targetDate,
  customerTimezone: 'Asia/Kathmandu'
});

const slots = await fetchAvailableSlots({
  stylistId: stylist.id,
  serviceId: selectedService.id,
  targetDate,
  customerTimezone: 'Asia/Kathmandu'
});

console.log('Received slots:', slots);
```

Then test again and **SCREENSHOT the console logs!**

---

## 🎯 What I'm Looking For:

1. **WHERE** is the error coming from? (Network? Console? UI?)
2. **WHEN** does it appear? (On page load? After clicking? After selecting date?)
3. **WHAT** is the EXACT error message? (Full stack trace)
4. **WHICH** API call is failing? (Stylists? Slots? Other?)

---

## 💡 My Hypotheses (in order of likelihood):

### Hypothesis #1: PostgREST Column Reference Bug
**Possible Cause**: PostgREST `.select()` query has a typo or wrong column name somewhere
**Test**: Check Network tab response

### Hypothesis #2: Next.js Build Cache
**Possible Cause**: Old compiled code in `.next` folder  
**Test**: Delete `.next` and rebuild

### Hypothesis #3: Hot Module Replacement Issue
**Possible Cause**: Dev server didn't reload properly after code changes
**Test**: Full server restart

### Hypothesis #4: Hidden Error Source
**Possible Cause**: Error is from a DIFFERENT API call (not slots)
**Test**: Check all Network requests

### Hypothesis #5: Browser Extension Interference
**Possible Cause**: Ad blocker or extension modifying requests
**Test**: Try in Incognito mode with extensions disabled

---

## ⚠️ IMPORTANT:

**DO NOT SKIP ANY STEPS!** Each step gives me critical information to solve this.

**SEND ME**:
1. All screenshots from Steps 1-6
2. The EXACT error message (copy-paste the text)
3. Whether error appears BEFORE or AFTER clicking date
4. Whether error persists after `.next` deletion

---

## 🔧 If You Want to Try a Nuclear Fix:

Replace the ENTIRE `fetchAvailableSlots` function in `src/lib/api/bookingClient.ts`:

```typescript
export async function fetchAvailableSlots(params: {
  stylistId: string;
  serviceId: string;
  targetDate: string;
  customerTimezone?: string;
}): Promise<AvailableSlot[]> {
  try {
    console.log('[fetchAvailableSlots] Calling API with:', params);
    
    const queryParams = new URLSearchParams({
      stylistId: params.stylistId,
      serviceId: params.serviceId,
      targetDate: params.targetDate,
      customerTimezone: params.customerTimezone || 'Asia/Kathmandu'
    });

    const url = `/api/bookings/available-slots?${queryParams}`;
    console.log('[fetchAvailableSlots] URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('[fetchAvailableSlots] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fetchAvailableSlots] HTTP Error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const slots = await response.json();
    console.log('[fetchAvailableSlots] Received slots:', slots);
    
    return slots;
  } catch (error) {
    console.error('[fetchAvailableSlots] Exception:', error);
    throw error; // Re-throw to let caller handle
  }
}
```

This adds EXTENSIVE logging. Then check console for the exact failure point.

---

**Status**: 🔴 BLOCKED - Need debugging info from user
**Next**: Analyze screenshots to identify exact error source
