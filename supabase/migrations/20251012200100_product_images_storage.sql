-- ============================================================================
-- PRODUCT IMAGES STORAGE BUCKET
-- ============================================================================
-- Purpose: Create storage bucket for vendor product images
-- Security: RLS policies ensure vendors can only access their own folders
-- ============================================================================

BEGIN;

-- Create Storage bucket for product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,  -- Public bucket (images accessible via URL)
  5242880,  -- 5MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Policy 1: Vendors can upload to their own folder
CREATE POLICY "Vendors can upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.user_has_role('vendor')
);

-- Policy 2: Everyone can view product images
CREATE POLICY "Anyone can view product images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Policy 3: Vendors can delete their own images
CREATE POLICY "Vendors can delete own product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.user_has_role('vendor')
);

-- Policy 4: Vendors can update their own images
CREATE POLICY "Vendors can update own product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.user_has_role('vendor')
);

COMMIT;
