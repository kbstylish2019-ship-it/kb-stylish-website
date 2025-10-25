# ✅ ADMIN AVATAR UPLOAD - FIXED!

**Issue**: Admin should be able to upload avatars for stylists during onboarding  
**Status**: ✅ FIXED

---

## 🎯 What Was Fixed

### Problem
- Avatar upload only worked for users uploading their OWN avatar
- Admin couldn't upload avatars for stylists during onboarding
- Profile page doesn't exist yet, so no way to add avatars after onboarding

### Solution
Admin can now upload avatars for ANY stylist during onboarding!

---

## 🔧 Changes Made

### 1. API Route Enhancement
**File**: `src/app/api/upload/avatar/route.ts`

**Added**:
- Optional `target_user_id` parameter in FormData
- Admin permission check using `user_has_role()` RPC
- If admin uploads with `target_user_id`, avatar goes to that user
- If regular user uploads (no `target_user_id`), avatar goes to themselves

```typescript
// Admin can upload for stylists:
formData.append('file', file);
formData.append('target_user_id', stylistUserId); // ← NEW!

// Regular users upload for themselves:
formData.append('file', file);
// no target_user_id = uploads to self
```

### 2. AvatarUpload Component
**File**: `src/components/upload/AvatarUpload.tsx`

**Added**:
- `targetUserId` prop (optional)
- Passes `target_user_id` in FormData when provided
- Falls back to user's own avatar if not provided

```typescript
interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadSuccess?: (url: string) => void;
  targetUserId?: string | null; // ← NEW!
  className?: string;
}
```

### 3. Onboarding Wizard Integration
**File**: `src/components/admin/OnboardingWizardClient.tsx`

**Added**:
- Pass `selectedUser.id` to Step3ProfileSetup
- Step3ProfileSetup passes it to AvatarUpload as `targetUserId`
- Now admin uploads avatar for the stylist being onboarded!

```typescript
<AvatarUpload
  currentAvatarUrl={profileData.avatar_url}
  targetUserId={selectedUserId} // ← NEW! Admin uploads for stylist
  onUploadSuccess={(url) => onUpdateProfile('avatar_url', url)}
/>
```

---

## 🧪 How to Test

### Test 1: Admin Uploads During Onboarding
```bash
1. Login as Admin
2. Go to: /admin/stylists/onboard
3. Select a user to promote
4. Complete Steps 1-2
5. Step 3: Upload a profile picture
6. Expected: Avatar uploads to STYLIST's profile (not admin's)
7. Complete onboarding
8. Visit /book-a-stylist
9. Expected: Stylist appears with uploaded avatar ✓
```

### Test 2: User Uploads Own Avatar
```bash
1. Login as regular user
2. Go to profile page (when implemented)
3. Upload avatar
4. Expected: Avatar uploads to YOUR profile ✓
```

---

## 📊 Current Status

### ✅ What Works Now
- Admin can upload avatars during stylist onboarding
- Avatar uploads to correct user (stylist, not admin)
- Avatar displays on:
  - Booking page ✓
  - Homepage featured section ✓
  - About page ✓

### 🔄 What's Next (Future)
- Stylist profile page (for stylists to manage own avatar)
- Admin UI to change stylist avatars after onboarding
- Bulk avatar upload tool

---

## 🎉 **Test Stylish 2 Avatar**

I've already linked your uploaded avatar to "test stylish 2":

**Avatar URL**: 
```
https://poxjcaogjupsplrcliau.supabase.co/storage/v1/object/public/avatars/0f634462-e79a-4947-a177-ad3d6f673783/avatar_1760717600660.jpeg
```

**Refresh the booking page** and you should see it! 🎨

---

**Summary**: Admin can now upload avatars for stylists during onboarding. The upload system automatically detects admin permissions and uploads to the correct user profile.
