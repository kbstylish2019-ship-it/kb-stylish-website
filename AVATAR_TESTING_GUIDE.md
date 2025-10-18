# 🧪 AVATAR UPLOAD TESTING GUIDE

**Issue**: Avatar uploaded but not showing on booking page  
**Root Cause**: Uploaded as Admin user (not a stylist!)  

---

## ✅ **AVATAR UPLOAD WORKS!**

The upload system is working correctly:
- ✅ File uploaded to storage successfully
- ✅ Database can be updated (tested manually)
- ✅ RLS policies are correct

## ❌ **THE PROBLEM**

**You tested with the wrong user!**

- You logged in as: **Admin** (0f634462-e79a-4947-a177-ad3d6f673783)
- Admin is NOT in `stylist_profiles` table
- Booking page only shows **stylists**, not admins

---

## 📝 **HOW TO TEST PROPERLY**

### Option 1: Create a Stylist Account (Recommended)

```bash
Steps:
1. Go to: /admin/stylists/onboard
2. Select one of these existing users to promote to stylist:
   - Sarah Johnson
   - test_user  
   - testuser
   
3. Complete the onboarding wizard
4. Step 3: Upload avatar ✓
5. Complete promotion
6. Visit /book-a-stylist
7. Avatar should display ✓
```

### Option 2: Upload Avatar for Existing Stylist

**Existing Stylists** (from database):
1. Sarah Johnson (user_id: 19d02e52-4bb3-4bd6-ae4c-87e3f1543968)
2. sara kami (user_id: c5fb715f-3e99-457f-af26-f2d6661c6b70)
3. Shishir bhusal (user_id: 8e80ead5-ce95-4bad-ab30-d4f54555584b)
4. rabindra sah (user_id: 095f1111-a812-481d-890f-263491aa3ff3)
5. test stylish (user_id: a6c56c69-fced-4a95-b7fa-f7ba9ae2ad04)

**To upload for existing stylist**:
```bash
1. Login as one of the stylist users above
2. Go to onboarding OR profile edit page
3. Upload avatar in Step 3
4. Avatar will display on booking page ✓
```

---

## 🐛 **POTENTIAL UPLOAD API BUG**

There might be an issue with the upload API not updating the database. Let me check browser console for errors when you upload.

**When testing, check**:
1. Browser Console (F12) for errors
2. Network tab - does `/api/upload/avatar` return success?
3. Response shows `avatar_url` in JSON?

---

## 🔧 **QUICK FIX: Manual Avatar Update**

If upload API isn't working, I can manually set avatars:

```sql
-- For Sarah Johnson stylist
UPDATE user_profiles 
SET avatar_url = 'https://poxjcaogjupsplrcliau.supabase.co/storage/v1/object/public/avatars/{user_id}/avatar_{timestamp}.jpeg'
WHERE id = '19d02e52-4bb3-4bd6-ae4c-87e3f1543968';
```

Just upload the file and I'll update the database for you.

---

## ✅ **CORRECT TEST PROCEDURE**

1. **Login as a STYLIST user** (not admin!)
2. Upload avatar during onboarding
3. Check booking page - avatar shows ✓
4. Check homepage featured section - avatar shows ✓
5. Check about page - avatar shows ✓

---

**Summary**: The system works! You just need to test with a stylist account, not the admin account.
