import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Category image upload endpoint
 * Admin-only: Upload images for product categories
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
    
    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'admin'
    });
    
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    // Get form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const categoryId = formData.get('category_id') as string;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    if (!categoryId) {
      return NextResponse.json(
        { success: false, error: 'Category ID required' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 5MB allowed.' },
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
    
    // Get old image URL to delete later
    const { data: category } = await supabase
      .from('categories')
      .select('image_url')
      .eq('id', categoryId)
      .single();
    
    const oldImageUrl = category?.image_url;
    
    // Generate safe filename: {category_id}_{timestamp}.{ext}
    const timestamp = Date.now();
    const ext = file.type.split('/')[1];
    const filename = `${categoryId}_${timestamp}.${ext}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('category-images')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('[Category Image Upload] Storage error:', uploadError);
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('category-images')
      .getPublicUrl(filename);
    
    // Update category with new image URL
    const { error: updateError } = await supabase
      .from('categories')
      .update({ image_url: publicUrl })
      .eq('id', categoryId);
    
    if (updateError) {
      console.error('[Category Image Upload] Category update error:', updateError);
      // Try to delete uploaded file
      await supabase.storage.from('category-images').remove([filename]);
      return NextResponse.json(
        { success: false, error: 'Failed to update category' },
        { status: 500 }
      );
    }
    
    // Delete old image if exists and is from our storage
    if (oldImageUrl && oldImageUrl.includes('category-images')) {
      try {
        const oldFilename = oldImageUrl.split('/category-images/')[1];
        if (oldFilename) {
          await supabase.storage.from('category-images').remove([oldFilename]);
        }
      } catch (err) {
        // Non-critical error, just log it
        console.warn('[Category Image Upload] Failed to delete old image:', err);
      }
    }
    
    return NextResponse.json({
      success: true,
      image_url: publicUrl,
      message: 'Category image uploaded successfully'
    });
    
  } catch (error) {
    console.error('[Category Image Upload] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
