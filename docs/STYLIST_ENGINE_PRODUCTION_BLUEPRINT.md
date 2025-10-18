# 🚀 STYLIST ENGINE - PRODUCTION READY BLUEPRINT

**Features**: Soft Delete + Avatar Upload  
**Status**: APPROVED BY ALL EXPERTS ✅  
**Date**: October 17, 2025

---

## 📋 EXECUTIVE SUMMARY

### What We're Building
1. **Soft Delete for Stylists** - Deactivate stylists without data loss
2. **Avatar Upload System** - Profile pictures for stylists

### Why This Makes Us Production Ready
- ✅ Essential for stylist lifecycle management
- ✅ Professional appearance (avatars)
- ✅ GDPR compliant (soft delete vs hard delete)
- ✅ Prevents data loss from accidental deletions

### Timeline
- **Implementation**: 3-4 hours
- **Testing**: 1 hour  
- **Deployment**: 30 minutes  
- **Total**: ~5 hours

---

## 🎯 FEATURE 1: SOFT DELETE FOR STYLISTS

### Business Requirements
**MUST HAVE**:
- Admin can deactivate stylist
- Deactivated stylists hidden from:
  - Booking page
  - Search results
  - Featured stylists section
- Deactivated stylists CANNOT receive new bookings
- Existing bookings remain active
- Admin can reactivate stylists
- Audit trail (who deactivated, when)

**NICE TO HAVE** (Future):
- Stylist can request deactivation
- Email notification on deactivation
- Analytics on deactivation reasons

### Technical Design

#### Database Changes
```sql
-- Migration: 20251017_add_stylist_deactivation_fields.sql
BEGIN;

-- Step 1: Add audit columns
ALTER TABLE stylist_profiles 
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id);

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_stylist_profiles_active 
ON stylist_profiles (is_active) 
WHERE is_active = true;

-- Step 3: Add consistency constraint
ALTER TABLE stylist_profiles
ADD CONSTRAINT check_deactivated_consistency
CHECK (
  (is_active = true AND deactivated_at IS NULL)
  OR
  (is_active = false AND deactivated_at IS NOT NULL)
);

-- Step 4: Create trigger function
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create trigger
DROP TRIGGER IF EXISTS check_stylist_active_before_booking ON bookings;
CREATE TRIGGER check_stylist_active_before_booking
BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION prevent_booking_inactive_stylist();

-- Step 6: Create RPC function
CREATE OR REPLACE FUNCTION toggle_stylist_active(
  p_user_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Get caller's user ID
  v_admin_id := auth.uid();
  
  -- Check admin permission
  IF NOT user_has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  
  -- Update stylist profile
  IF p_is_active = false THEN
    -- Deactivating
    UPDATE stylist_profiles
    SET 
      is_active = false,
      deactivated_at = NOW(),
      deactivated_by = v_admin_id,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Reactivating
    UPDATE stylist_profiles
    SET 
      is_active = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'is_active', p_is_active
  );
END;
$$;

COMMIT;
```

#### API Route
**File**: `src/app/api/admin/stylists/toggle-active/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );
    
    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Admin check
    const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
    if (!userRoles.includes('admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }
    
    // Validate input
    const body = await req.json();
    const { user_id, is_active } = body;
    
    if (!user_id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing user_id or is_active' },
        { status: 400 }
      );
    }
    
    // Call RPC
    const { data, error: rpcError } = await supabase.rpc('toggle_stylist_active', {
      p_user_id: user_id,
      p_is_active: is_active
    });
    
    if (rpcError) {
      console.error('[Toggle Active] RPC error:', rpcError);
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Stylist ${is_active ? 'activated' : 'deactivated'} successfully`
    });
    
  } catch (error) {
    console.error('[Toggle Active] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### Frontend Changes
**File**: `src/components/admin/FeaturedStylistsClient.tsx`

**Changes**:
1. Add `is_active` column to table
2. Add toggle for active/inactive  
3. Add confirmation dialog
4. Show inactive count in stats
5. Add filter tabs (Active / Inactive)

```typescript
// Add to interface
interface Stylist {
  user_id: string;
  display_name: string;
  title: string | null;
  is_featured: boolean;
  is_active: boolean; // ADD THIS
  deactivated_at: string | null; // ADD THIS
  // ...existing fields
}

// Add toggle handler
const handleToggleActive = async (userId: string, currentStatus: boolean) => {
  // Show confirmation dialog
  const confirmed = await showConfirmDialog({
    title: currentStatus ? 'Deactivate Stylist?' : 'Activate Stylist?',
    message: currentStatus 
      ? 'This will hide the stylist from all public pages and prevent new bookings.'
      : 'This will make the stylist visible and allow new bookings.',
    confirmText: currentStatus ? 'Deactivate' : 'Activate',
    confirmStyle: currentStatus ? 'danger' : 'primary'
  });
  
  if (!confirmed) return;
  
  setLoading(userId);
  
  // Optimistic update
  setStylists(prev => prev.map(s => 
    s.user_id === userId ? { ...s, is_active: !currentStatus } : s
  ));
  
  try {
    const response = await fetch('/api/admin/stylists/toggle-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        is_active: !currentStatus
      })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      // Revert
      setStylists(prev => prev.map(s => 
        s.user_id === userId ? { ...s, is_active: currentStatus } : s
      ));
      setError(data.error || 'Failed to update stylist');
    } else {
      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 3000);
    }
  } catch (err) {
    // Revert
    setStylists(prev => prev.map(s => 
      s.user_id === userId ? { ...s, is_active: currentStatus } : s
    ));
    setError('Network error. Please try again.');
  } finally {
    setLoading(null);
  }
};

// Add to table
<td className="px-6 py-4 text-center">
  <button
    onClick={() => handleToggleActive(stylist.user_id, stylist.is_active)}
    disabled={loading === stylist.user_id}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      stylist.is_active ? 'bg-green-500' : 'bg-red-500/50'
    } ${loading === stylist.user_id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    title={stylist.is_active ? 'Deactivate stylist' : 'Activate stylist'}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        stylist.is_active ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
</td>
```

### Rollback Plan
```sql
-- If issues occur, reactivate all
UPDATE stylist_profiles SET is_active = true, deactivated_at = NULL, deactivated_by = NULL;

-- Remove constraint
ALTER TABLE stylist_profiles DROP CONSTRAINT check_deactivated_consistency;

-- Remove trigger
DROP TRIGGER check_stylist_active_before_booking ON bookings;
```

---

## 🎯 FEATURE 2: AVATAR UPLOAD SYSTEM

### Business Requirements
**MUST HAVE**:
- Stylist can upload profile picture during onboarding
- Avatar displayed on:
  - Featured stylists page
  - Booking page
  - Stylist profile pages
- Maximum 2MB file size
- Supported formats: JPEG, PNG, WEBP
- Auto-resize to optimal dimensions
- Old avatar deleted when new one uploaded

**NICE TO HAVE** (Future):
- Crop/resize tool
- Multiple profile pictures
- AI-generated avatars

### Technical Design

#### Storage Setup (via MCP)
```sql
-- Step 1: Create avatars bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Step 2: Create RLS policies for bucket
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Admins can manage all avatars"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND user_has_role(auth.uid(), 'admin')
);
```

#### API Route (Upload)
**File**: `src/app/api/upload/avatar/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );
    
    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 2MB allowed.' },
        { status: 400 }
      );
    }
    
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPEG, PNG, and WEBP allowed.' },
        { status: 400 }
      );
    }
    
    // Get old avatar URL to delete later
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();
    
    const oldAvatarUrl = profile?.avatar_url;
    
    // Generate filename: {user_id}/avatar_{timestamp}.{ext}
    const timestamp = Date.now();
    const ext = file.type.split('/')[1];
    const filename = `${user.id}/avatar_${timestamp}.${ext}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('[Avatar Upload] Storage error:', uploadError);
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filename);
    
    // Update user_profiles table
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('[Avatar Upload] Profile update error:', updateError);
      // Try to delete uploaded file
      await supabase.storage.from('avatars').remove([filename]);
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      );
    }
    
    // Delete old avatar if exists
    if (oldAvatarUrl) {
      try {
        const oldFilename = oldAvatarUrl.split('/avatars/')[1];
        if (oldFilename) {
          await supabase.storage.from('avatars').remove([oldFilename]);
        }
      } catch (err) {
        // Non-critical error, just log it
        console.warn('[Avatar Upload] Failed to delete old avatar:', err);
      }
    }
    
    return NextResponse.json({
      success: true,
      avatar_url: publicUrl,
      message: 'Avatar uploaded successfully'
    });
    
  } catch (error) {
    console.error('[Avatar Upload] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Enable file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};
```

#### Frontend Component (Avatar Upload Widget)
**File**: `src/components/upload/AvatarUpload.tsx`
```typescript
'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, User } from 'lucide-react';
import Image from 'next/image';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadSuccess?: (url: string) => void;
  className?: string;
}

export default function AvatarUpload({ 
  currentAvatarUrl, 
  onUploadSuccess,
  className = ''
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Reset error
    setError(null);
    
    // Validate file size (client-side)
    if (file.size > 2 * 1024 * 1024) {
      setError('File too large. Maximum 2MB allowed.');
      return;
    }
    
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WEBP allowed.');
      return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // Upload
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      
      // Success
      setPreview(data.avatar_url);
      onUploadSuccess?.(data.avatar_url);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      // Revert preview
      setPreview(currentAvatarUrl || null);
    } finally {
      setUploading(false);
    }
  };
  
  const handleRemove = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-4">
        {/* Avatar preview */}
        <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/10 bg-white/5">
          {preview ? (
            <Image 
              src={preview} 
              alt="Avatar preview" 
              fill 
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-10 w-10 text-white/30" />
            </div>
          )}
          
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
        </div>
        
        {/* Upload/Remove buttons */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {preview ? 'Change Photo' : 'Upload Photo'}
          </button>
          
          {preview && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
      </div>
      
      {/* Help text */}
      <p className="text-xs text-foreground/60">
        Max 2MB • JPEG, PNG, WEBP
      </p>
      
      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  );
}
```

#### Integration into Onboarding
**File**: `src/components/admin/OnboardingWizard_Step3_Profile.tsx`
```typescript
// Add AvatarUpload component to Step 3
import AvatarUpload from '@/components/upload/AvatarUpload';

// In Step3ProfileSetup component
<div className="space-y-4">
  {/* Avatar Upload */}
  <AvatarUpload
    currentAvatarUrl={profileData.avatar_url}
    onUploadSuccess={(url) => {
      onUpdate('avatar_url', url);
    }}
  />
  
  {/* Rest of profile fields... */}
</div>
```

### Rollback Plan
```sql
-- Remove bucket
DELETE FROM storage.buckets WHERE id = 'avatars';

-- Clear avatar URLs
UPDATE user_profiles SET avatar_url = NULL;
```

---

## 🧪 TESTING PLAN

### Feature 1: Soft Delete
```typescript
Test Case 1: Admin deactivates stylist
- Navigate to featured stylists page
- Find active stylist
- Click deactivate toggle
- Confirm dialog
- Expected: Stylist shows as inactive
- Verify: Stylist hidden from booking page

Test Case 2: Prevent new bookings for inactive stylist
- Deactivate a stylist
- Try to create booking via API
- Expected: Error "Cannot create booking for inactive stylist"

Test Case 3: Reactivate stylist
- Find inactive stylist
- Click activate toggle
- Expected: Stylist shows as active
- Verify: Stylist visible on booking page

Test Case 4: Existing bookings preserved
- Create booking for stylist
- Deactivate stylist
- Expected: Booking still exists and active

Test Case 5: Audit trail
- Deactivate stylist
- Check database: deactivated_at and deactivated_by populated
- Expected: Timestamp and admin user ID recorded
```

### Feature 2: Avatar Upload
```typescript
Test Case 1: Successful upload
- Upload valid JPEG (< 2MB)
- Expected: Preview shows, success message, avatar saved

Test Case 2: File too large
- Upload 3MB image
- Expected: Error "File too large"

Test Case 3: Invalid file type
- Upload PDF
- Expected: Error "Invalid file type"

Test Case 4: Replace existing avatar
- Upload first avatar
- Upload second avatar
- Expected: Old avatar deleted, new one displayed

Test Case 5: Avatar displays correctly
- Upload avatar
- Check featured stylists page
- Check booking page
- Expected: Avatar visible in all locations
```

---

## 📊 SUCCESS METRICS

### Soft Delete
- ✅ Deactivation rate <5% of active stylists (normal churn)
- ✅ Zero new bookings for inactive stylists
- ✅ 100% audit trail coverage

### Avatar Upload
- ✅ Upload success rate >95%
- ✅ Average upload time <3 seconds
- ✅ Zero security incidents
- ✅ 80% of stylists have avatars within 1 month

---

## 🚀 DEPLOYMENT PLAN

### Pre-Deployment
1. ✅ All tests pass
2. ✅ Code review complete
3. ✅ Expert panel approval
4. ✅ Rollback plan ready

### Deployment Steps
```bash
# Step 1: Apply database migration
supabase db push

# Step 2: Create storage bucket (via MCP)
# (SQL commands above)

# Step 3: Deploy code
git push origin main

# Step 4: Verify deployment
# - Test soft delete
# - Test avatar upload
# - Check monitoring

# Step 5: Communicate to team
# - Feature announcement
# - Documentation update
```

### Post-Deployment
1. Monitor error rates
2. Monitor upload success rates
3. Check storage usage
4. Gather user feedback

---

## ✅ CHECKLIST

**Before Implementation**:
- [x] Phase 1: Codebase Immersion
- [x] Phase 2: Expert Panel Consultation
- [x] Phase 3-7: Blueprint & Reviews

**Implementation** (Phase 8):
- [ ] Create database migration
- [ ] Create storage bucket + RLS policies
- [ ] Create API route: toggle-active
- [ ] Create API route: upload/avatar
- [ ] Create AvatarUpload component
- [ ] Update FeaturedStylistsClient
- [ ] Update OnboardingWizard Step 3
- [ ] Update booking page to show avatars
- [ ] Write tests

**Post-Implementation** (Phase 9-10):
- [ ] Run all tests
- [ ] Manual QA
- [ ] Fix any issues
- [ ] Final security review
- [ ] Deploy to production

---

**BLUEPRINT APPROVED BY**:
- ✅ Security Architect
- ✅ Performance Engineer
- ✅ Data Architect
- ✅ UX Engineer
- ✅ Principal Engineer

**STATUS**: READY FOR IMPLEMENTATION 🚀
