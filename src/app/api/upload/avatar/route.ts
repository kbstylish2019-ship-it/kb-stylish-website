import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Avatar upload endpoint
 * Authenticated users can upload their profile picture
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component limitation
            }
          },
        },
      }
    );
    
    // Verify authentication
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
    const targetUserId = formData.get('target_user_id') as string | null;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Determine which user's avatar we're updating
    // If target_user_id is provided, admin can upload for that user
    // Otherwise, user uploads their own avatar
    let uploadForUserId = user.id;
    
    if (targetUserId) {
      // Check if current user is admin
      const { data: isAdmin } = await supabase.rpc('user_has_role', {
        user_uuid: user.id,
        role_name: 'admin'
      });
      
      if (!isAdmin) {
        return NextResponse.json(
          { success: false, error: 'Only admins can upload avatars for other users' },
          { status: 403 }
        );
      }
      
      uploadForUserId = targetUserId;
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
      .eq('id', uploadForUserId)
      .single();
    
    const oldAvatarUrl = profile?.avatar_url;
    
    // Generate safe filename: {target_user_id}/avatar_{timestamp}.{ext}
    const timestamp = Date.now();
    const ext = file.type.split('/')[1];
    const filename = `${uploadForUserId}/avatar_${timestamp}.${ext}`;
    
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
      .eq('id', uploadForUserId);
    
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
