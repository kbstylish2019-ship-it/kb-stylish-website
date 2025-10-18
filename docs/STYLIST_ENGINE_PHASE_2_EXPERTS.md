# 🎯 PHASE 2: 5-EXPERT PANEL CONSULTATION

**Features**: Soft Delete + Avatar Upload
**Date**: October 17, 2025

---

## 👨‍💻 EXPERT 1: SENIOR SECURITY ARCHITECT

### Consultation on Soft Delete

**Q1: What are the security implications of soft delete?**
**A**: 
- ✅ GOOD: Prevents permanent data loss (GDPR compliance)
- ✅ GOOD: Audit trail preserved (who deactivated, when)
- ⚠️ CONCERN: Must ensure deactivated stylists cannot:
  - Login to stylist dashboard
  - Accept new bookings
  - Appear in search results
  - Access sensitive data
- ⚠️ CONCERN: Need to handle existing bookings for deactivated stylists
  - Allow completion of scheduled bookings
  - Block new booking creation

**Q2: Does soft delete violate least-privilege principle?**
**A**:
- ✅ NO - if only admins can deactivate
- ⚠️ YES - if stylists can self-deactivate (needs business decision)
- **Recommendation**: Admin-only deactivation, stylist can "request deactivation"

**Q3: Can this be exploited?**
**A**:
- ⚠️ Race condition: User books stylist WHILE admin is deactivating
  - **Mitigation**: Check is_active in booking creation transaction
  - **Use database constraint**: CHECK constraint on bookings
  
- ⚠️ Enumeration attack: Count active vs inactive stylists
  - **Mitigation**: RLS policy prevents viewing inactive stylists
  - **Only admins see full count**

**Q4: Are we exposing sensitive data?**
**A**:
- ✅ NO - deactivated stylists hidden from public view
- ✅ RLS policy already filters: `is_active = true`
- ⚠️ CHECK: Ensure ALL queries respect is_active flag
  - Booking page ✓
  - Featured stylists ✓
  - Search results ✓
  - Analytics dashboards? (needs verification)

### Consultation on Avatar Upload

**Q1: What are the security implications?**
**A**: 
- 🔴 **CRITICAL**: File upload is HIGH RISK
  - Malicious file uploads (PHP, exe disguised as images)
  - XXE attacks (XML in SVG files)
  - Image bombs (large files causing DoS)
  - EXIF data leaking GPS/personal info

**Q2: Security Requirements**:
```typescript
1. ✅ MIME Type Validation (server-side)
   - Only: image/jpeg, image/png, image/webp
   - NO GIF (can contain animations/scripts)
   - NO SVG (can contain XSS)

2. ✅ File Size Limit
   - Max 2MB (smaller than product-images)
   - Reject oversized files immediately

3. ✅ File Content Validation
   - Verify magic bytes match MIME type
   - Use image processing library to re-encode
   - Strip EXIF data (privacy)

4. ✅ Filename Sanitization
   - NEVER use user-provided filename
   - Generate: {user_id}/avatar_{timestamp}.{ext}
   - Prevent path traversal (../)

5. ✅ Storage RLS Policies
   - Users can only upload to their own folder
   - Users can only delete their own avatar
   - Everyone can read (public avatars)
   - Admins can manage all

6. ✅ Rate Limiting
   - Max 5 uploads per hour per user
   - Prevent abuse/DoS

7. ✅ CORS Configuration
   - Only allow from our domain
   - No wildcard origins
```

**Q3: Attack Vectors**:
1. **File Upload Bypass**
   - Attacker uploads malicious.php.jpg
   - **Mitigation**: Check magic bytes, re-encode image

2. **Path Traversal**
   - Upload to `../../etc/passwd`
   - **Mitigation**: Sanitize filename, use user_id in path

3. **DoS via Large Files**
   - Upload 100MB "image"
   - **Mitigation**: Enforce 2MB limit at API layer

4. **XSS via SVG**
   - SVG with embedded JavaScript
   - **Mitigation**: Block SVG completely

**Security Verdict**: ✅ SAFE if all mitigations implemented

---

## ⚡ EXPERT 2: PERFORMANCE ENGINEER

### Consultation on Soft Delete

**Q1: Will this scale to 10M+ rows?**
**A**:
- ✅ YES - soft delete just updates one boolean column
- ✅ Minimal performance impact

**Q2: Index Requirements**:
```sql
-- CRITICAL: Add index for query performance
CREATE INDEX idx_stylist_profiles_active 
ON stylist_profiles (is_active) 
WHERE is_active = true;

-- Composite index for featured + active filter
CREATE INDEX idx_stylist_profiles_featured_active 
ON stylist_profiles (is_featured, is_active) 
WHERE is_active = true;
```

**Q3: Query Performance**:
```sql
-- BEFORE (no filtering)
SELECT * FROM stylist_profiles; -- Returns ALL (active + inactive)

-- AFTER (filtered)
SELECT * FROM stylist_profiles WHERE is_active = true;
-- Uses index, fast even with millions of rows
```

**Q4: Caching Strategy**:
- ✅ Cache featured stylists list (5 min TTL)
- ✅ Invalidate cache on deactivation
- ⚠️ Check: Does toggle-stylist API invalidate cache? (needs verification)

### Consultation on Avatar Upload

**Q1: Will uploads scale?**
**A**:
- ⚠️ **CONCERN**: File uploads block the API route
- ⚠️ Direct uploads to Supabase = better performance
- ✅ **RECOMMENDATION**: Client-side upload to Supabase Storage
  - Get signed URL from API
  - Upload directly from browser
  - No server bottleneck

**Q2: Storage Performance**:
```
File Size: 2MB max
Expected: 10,000 stylists × 2MB = 20GB
Cost: $0.021/GB/month = $0.42/month
Performance: Supabase Storage uses S3, handles millions of files
Verdict: ✅ NO PERFORMANCE CONCERNS
```

**Q3: Image Optimization**:
- ⚠️ **CRITICAL**: Don't serve 2MB images to users!
- ✅ **SOLUTION**: Use Next.js Image component with Supabase transformations
- ✅ Generate thumbnails: 150x150px for cards, 400x400px for profiles
- ✅ Lazy loading for performance

**Q4: CDN Strategy**:
- ✅ Supabase Storage has built-in CDN
- ✅ Automatic caching, edge distribution
- ✅ No additional config needed

**Performance Verdict**: ✅ EXCELLENT if client-side upload used

---

## 🗄️ EXPERT 3: DATA ARCHITECT

### Consultation on Soft Delete

**Q1: Is schema design sound?**
**A**:
- ✅ YES - `is_active` boolean is correct approach
- ✅ Add `deactivated_at` timestamp for audit
- ✅ Add `deactivated_by` UUID for accountability

**Schema Update Required**:
```sql
ALTER TABLE stylist_profiles 
ADD COLUMN deactivated_at TIMESTAMPTZ,
ADD COLUMN deactivated_by UUID REFERENCES auth.users(id);

-- Add CHECK constraint to ensure consistency
ALTER TABLE stylist_profiles
ADD CONSTRAINT check_deactivated_consistency
CHECK (
  (is_active = true AND deactivated_at IS NULL AND deactivated_by IS NULL)
  OR
  (is_active = false AND deactivated_at IS NOT NULL AND deactivated_by IS NOT NULL)
);
```

**Q2: Can data become inconsistent?**
**A**:
- ⚠️ **RISK**: Bookings for inactive stylists
- ✅ **SOLUTION**: Add database trigger
```sql
CREATE OR REPLACE FUNCTION prevent_booking_inactive_stylist()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stylist_profiles 
    WHERE user_id = NEW.stylist_user_id 
    AND is_active = false
  ) THEN
    RAISE EXCEPTION 'Cannot create booking for inactive stylist';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_stylist_active_before_booking
BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION prevent_booking_inactive_stylist();
```

**Q3: Is migration safe?**
**A**:
```sql
-- SAFE Migration Plan:
BEGIN;
  -- Step 1: Add columns (nullable first)
  ALTER TABLE stylist_profiles 
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id);
  
  -- Step 2: Backfill existing inactive stylists (if any)
  UPDATE stylist_profiles
  SET deactivated_at = NOW(),
      deactivated_by = (SELECT id FROM auth.users WHERE email = 'admin@kbstylish.com' LIMIT 1)
  WHERE is_active = false 
  AND deactivated_at IS NULL;
  
  -- Step 3: Add constraint (after backfill)
  ALTER TABLE stylist_profiles
  ADD CONSTRAINT check_deactivated_consistency
  CHECK (
    (is_active = true AND deactivated_at IS NULL)
    OR
    (is_active = false AND deactivated_at IS NOT NULL)
  );
  
  -- Step 4: Add trigger
  CREATE TRIGGER check_stylist_active_before_booking
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_booking_inactive_stylist();
COMMIT;
```

**Q4: Cascading Deletes?**
**A**:
- ❌ NO cascading deletes (soft delete = preserve data)
- ✅ Keep all related records:
  - Bookings ✓
  - Reviews ✓
  - Services ✓
  - Schedules ✓
- ⚠️ Business rule: How to handle active bookings?
  - Option A: Allow completion (recommended)
  - Option B: Cancel and refund
  - **Decision needed from product team**

### Consultation on Avatar Upload

**Q1: Schema changes needed?**
**A**:
- ✅ `user_profiles.avatar_url` ALREADY EXISTS
- ❌ NO schema migration needed
- ✅ Just populate the field

**Q2: Data integrity?**
**A**:
```sql
-- Add constraint to ensure valid URLs
ALTER TABLE user_profiles
ADD CONSTRAINT check_avatar_url_format
CHECK (
  avatar_url IS NULL 
  OR avatar_url ~* '^https://[a-z0-9\-]+\.supabase\.co/storage/v1/object/public/avatars/.+'
);

-- This prevents invalid URLs being saved
```

**Q3: Orphaned files?**
**A**:
- ⚠️ **RISK**: User uploads new avatar, old file not deleted
- ✅ **SOLUTION**: Delete old avatar before uploading new one
```typescript
// Pseudo-code
async function updateAvatar(userId, newFile) {
  // 1. Get old avatar URL
  const { avatar_url } = await getUser(userId);
  
  // 2. Upload new avatar
  const newUrl = await uploadToStorage(newFile);
  
  // 3. Update database
  await updateUser(userId, { avatar_url: newUrl });
  
  // 4. Delete old file (if exists)
  if (avatar_url) {
    await deleteFromStorage(avatar_url);
  }
}
```

**Q4: Backup strategy?**
**A**:
- ✅ Supabase Storage has automatic backups
- ✅ No manual backup needed
- ⚠️ Consider: Keep old avatars for 30 days before deletion (rollback)

**Data Architecture Verdict**: ✅ SOUND with suggested improvements

---

## 🎨 EXPERT 4: FRONTEND/UX ENGINEER

### Consultation on Soft Delete

**Q1: Is the UX intuitive?**
**A**:
- ⚠️ **CONCERN**: Two toggles on same row (Featured + Active) = confusing
- ✅ **BETTER UX**: 
  ```
  Featured: [Toggle]
  Status: [Active ▼] (dropdown with Active/Inactive)
  ```
  OR
  ```
  Featured: [Toggle]
  Active: [Toggle] (with confirmation dialog)
  ```

**Q2: Should we show deactivated stylists?**
**A**:
- ❌ NO - Don't show in main table (clutters UI)
- ✅ YES - Add "View Deactivated" tab/filter
```
[Active (5)] [Deactivated (0)]
```

**Q3: Confirmation dialog UX**:
```
┌─────────────────────────────────────┐
│ ⚠️  Deactivate Stylist?              │
│                                     │
│ Are you sure you want to deactivate │
│ Sarah Johnson?                      │
│                                     │
│ This will:                          │
│ • Hide from booking page            │
│ • Prevent new bookings              │
│ • Keep existing bookings active     │
│                                     │
│ [Cancel]  [Deactivate]              │
└─────────────────────────────────────┘
```

**Q4: Loading states?**
**A**:
- ✅ Optimistic UI update (immediate feedback)
- ✅ Disable toggle during API call
- ✅ Revert on error
- ✅ Show success message (3s auto-dismiss)

### Consultation on Avatar Upload

**Q1: Where should upload UI be?**
**A**:
```
Priority 1: Onboarding Wizard (Step 3: Profile Setup)
├── Upload during account creation
├── Optional (can skip)
└── Shows placeholder if skipped

Priority 2: Stylist Profile Edit Page
├── Replace existing avatar
├── Crop/resize UI
└── Preview before saving

Priority 3: Admin Curation Page (Future)
├── Admin uploads for stylist
└── Lower priority
```

**Q2: Upload UX Flow**:
```
┌─────────────────────────────────────┐
│   Profile Picture                   │
│                                     │
│   ┌─────────────┐                  │
│   │             │                  │
│   │  [Preview]  │  [Upload Photo]  │
│   │             │  [Remove]        │
│   └─────────────┘                  │
│                                     │
│   📷 Click or drag to upload        │
│   Max 2MB • JPG, PNG, WEBP         │
└─────────────────────────────────────┘
```

**Q3: Accessibility (WCAG 2.1)?**
**A**:
```html
<button aria-label="Upload profile picture">
  <input 
    type="file" 
    accept="image/jpeg,image/png,image/webp"
    aria-describedby="avatar-upload-help"
  />
</button>
<p id="avatar-upload-help" class="sr-only">
  Upload a profile picture. Maximum 2MB. Accepted formats: JPEG, PNG, WEBP.
</p>
```

**Q4: Mobile experience?**
**A**:
- ✅ Use native file picker (works on mobile)
- ✅ Allow camera capture on mobile
```html
<input type="file" accept="image/*" capture="user" />
```
- ✅ Show upload progress (especially on slow connections)
- ✅ Optimize image before upload (reduce size)

**Q5: Error handling UX**:
```typescript
Errors to handle:
1. File too large
   → "Image must be under 2MB. Try compressing it."
   
2. Wrong file type
   → "Please upload a JPEG, PNG, or WEBP image."
   
3. Network error
   → "Upload failed. Check your connection and try again."
   
4. No permission
   → "You don't have permission to upload images."
```

**UX Verdict**: ✅ EXCELLENT with proper implementation

---

## 🔬 EXPERT 5: PRINCIPAL ENGINEER (Integration & Systems)

### End-to-End Flow Analysis

**Feature 1: Soft Delete Flow**
```
USER ACTION: Admin clicks "Deactivate" toggle
    ↓
1. Frontend (FeaturedStylistsClient.tsx)
   ├── Show confirmation dialog
   ├── User confirms
   ├── Optimistic UI update
   └── Call API: POST /api/admin/stylists/toggle-active
    ↓
2. API Route (toggle-active/route.ts)
   ├── Verify JWT authentication
   ├── Check admin role
   ├── Validate input (user_id, is_active)
   └── Call RPC: toggle_stylist_active()
    ↓
3. Database RPC (toggle_stylist_active)
   ├── Check current is_active status
   ├── Update stylist_profiles SET is_active = false
   ├── Set deactivated_at = NOW()
   ├── Set deactivated_by = auth.uid()
   └── RETURN success
    ↓
4. Database Trigger (check_stylist_active_before_booking)
   ├── On future booking INSERT
   ├── Check if stylist is_active = true
   └── REJECT if inactive
    ↓
5. Frontend Response
   ├── Success → Keep UI update, show message
   └── Error → Revert UI update, show error
    ↓
RESULT: Stylist deactivated, hidden from public, no new bookings allowed
```

**Edge Cases**:
1. ⚠️ **Concurrent booking while deactivating**
   - User books at 10:00:00
   - Admin deactivates at 10:00:01
   - **Solution**: Database trigger rejects booking if processed after deactivation

2. ⚠️ **Existing bookings for deactivated stylist**
   - Keep existing bookings active ✓
   - Allow stylist to complete them ✓
   - Show in stylist dashboard with notice ✓

3. ⚠️ **Reactivation flow**
   - Same toggle (admin can reactivate)
   - Clear deactivated_at and deactivated_by
   - Stylist appears in search again

---

**Feature 2: Avatar Upload Flow**
```
USER ACTION: Stylist uploads avatar in onboarding
    ↓
1. Frontend (OnboardingWizard Step 3)
   ├── User selects image file
   ├── Client-side validation (type, size)
   ├── Show preview
   ├── User confirms
   └── Call API: POST /api/upload/avatar
    ↓
2. API Route (upload/avatar/route.ts)
   ├── Verify JWT authentication
   ├── Extract user_id from JWT
   ├── Validate file (type, size, magic bytes)
   ├── Generate safe filename: {user_id}/avatar_{timestamp}.webp
   ├── Get old avatar URL (if exists)
   └── Generate signed upload URL from Supabase
    ↓
3. Frontend receives signed URL
   ├── Upload file directly to Supabase Storage
   ├── Show progress bar
   └── On success, call: POST /api/upload/avatar/confirm
    ↓
4. API Route (upload/avatar/confirm/route.ts)
   ├── Verify upload completed
   ├── Get public URL for avatar
   ├── Update user_profiles SET avatar_url = public_url
   ├── Delete old avatar file (if exists)
   └── RETURN success + public URL
    ↓
5. Frontend Response
   ├── Update preview with new avatar
   ├── Save to onboarding state
   └── Continue to next step
    ↓
RESULT: Avatar uploaded, database updated, old file cleaned up
```

**Edge Cases**:
1. ⚠️ **Upload starts but user closes browser**
   - Orphaned file in storage
   - **Solution**: Cleanup job deletes files >1 hour old without DB record

2. ⚠️ **Multiple rapid uploads**
   - User uploads 5 images in 10 seconds
   - **Solution**: Rate limit (max 5/hour per user)

3. ⚠️ **Storage quota exceeded**
   - 10GB free tier limit reached
   - **Solution**: Monitor usage, upgrade plan if needed

4. ⚠️ **Malicious file upload**
   - Disguised PHP/exe as JPEG
   - **Solution**: Magic bytes check + re-encode image

---

### Monitoring & Observability

**Metrics to Track**:
```typescript
1. Soft Delete
   - Total stylists deactivated (count)
   - Deactivation rate (per day/week)
   - Reactivation rate
   - Average time inactive

2. Avatar Upload
   - Upload success rate (%)
   - Upload failure reasons (file size, type, network)
   - Average upload time (latency)
   - Storage usage (GB)
```

**Alerts**:
- 🚨 Upload failure rate >10%
- 🚨 Storage approaching quota (>80%)
- 🚨 Deactivation spike (>5 in 1 hour)

---

### Rollback Strategy

**If soft delete causes issues**:
```sql
-- Emergency rollback: reactivate all
UPDATE stylist_profiles 
SET is_active = true,
    deactivated_at = NULL,
    deactivated_by = NULL
WHERE is_active = false;

-- Remove constraint
ALTER TABLE stylist_profiles 
DROP CONSTRAINT IF EXISTS check_deactivated_consistency;

-- Remove trigger
DROP TRIGGER IF EXISTS check_stylist_active_before_booking ON bookings;
```

**If avatar upload causes issues**:
```sql
-- Clear all avatar URLs
UPDATE user_profiles SET avatar_url = NULL;

-- Delete avatars bucket
DROP STORAGE BUCKET avatars;
```

---

## 📊 EXPERT PANEL SUMMARY

### ✅ APPROVED Features
1. **Soft Delete** - All experts approve with mitigations
2. **Avatar Upload** - All experts approve with security measures

### ⚠️ CONCERNS Raised
1. **Security**: File upload needs comprehensive validation
2. **Performance**: Use client-side upload for better UX
3. **Data**: Add audit fields (deactivated_at, deactivated_by)
4. **UX**: Confirmation dialog + clear messaging
5. **Integration**: Handle edge cases (concurrent bookings, orphaned files)

### 🔧 REQUIRED CHANGES
1. Add database columns (deactivated_at, deactivated_by)
2. Add database trigger (prevent bookings for inactive)
3. Add database constraint (consistency check)
4. Create avatars storage bucket with RLS
5. Implement comprehensive file validation
6. Add rate limiting
7. Implement cleanup job for orphaned files

---

**PHASE 2 COMPLETE ✅**
**Next**: Phase 3 - Consistency Check
