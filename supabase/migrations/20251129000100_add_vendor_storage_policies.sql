-- ============================================================================
-- VENDOR DOCUMENTS STORAGE POLICIES
-- Version: 1.0
-- Date: November 29, 2025
-- Purpose: Add storage RLS policies for vendor document uploads
-- ============================================================================

-- Vendors can upload to their own folder
CREATE POLICY "Vendors upload own docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'vendor-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Vendors can view their own documents
CREATE POLICY "Vendors view own docs"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'vendor-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Vendors can delete their own documents
CREATE POLICY "Vendors delete own docs"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'vendor-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can view all vendor documents
CREATE POLICY "Admins can view all vendor documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'vendor-documents' 
    AND public.user_has_role(auth.uid(), 'admin')
);
