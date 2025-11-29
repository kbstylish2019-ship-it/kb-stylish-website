-- ============================================================================
-- VENDOR DOCUMENTS SYSTEM MIGRATION
-- Version: 1.0
-- Date: November 29, 2025
-- Purpose: Add document upload capability for vendor applications
-- Documents: PAN Certificate, VAT Certificate, Business Registration
-- ============================================================================

-- STEP 1: CREATE VENDOR_DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.vendor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'pan_certificate',
        'vat_certificate', 
        'business_registration',
        'citizenship',
        'other'
    )),
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    mime_type TEXT NOT NULL CHECK (mime_type IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf'
    )),
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'verified',
        'rejected',
        'expired'
    )),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    document_number TEXT,
    expiry_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vendor_documents IS 'Vendor verification documents (PAN, VAT, etc.) for application review';

CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON public.vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_status ON public.vendor_documents(status);

-- STEP 2: ENABLE RLS
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own documents
CREATE POLICY "Vendors can view own documents"
ON public.vendor_documents FOR SELECT TO authenticated
USING (vendor_id = auth.uid());

-- Vendors can insert their own documents
CREATE POLICY "Vendors can upload own documents"
ON public.vendor_documents FOR INSERT TO authenticated
WITH CHECK (vendor_id = auth.uid());

-- Vendors can delete their own pending documents
CREATE POLICY "Vendors can delete own pending documents"
ON public.vendor_documents FOR DELETE TO authenticated
USING (vendor_id = auth.uid() AND status = 'pending');

-- Admins can view all documents
CREATE POLICY "Admins can view all documents"
ON public.vendor_documents FOR SELECT TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

-- Admins can update document status
CREATE POLICY "Admins can update documents"
ON public.vendor_documents FOR UPDATE TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

-- STEP 3: ADD FLAGS TO VENDOR_PROFILES
ALTER TABLE public.vendor_profiles
ADD COLUMN IF NOT EXISTS documents_submitted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS documents_verified BOOLEAN DEFAULT FALSE;

-- STEP 4: CREATE STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vendor-documents',
    'vendor-documents',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- STEP 5: CREATE HELPER FUNCTIONS

-- Function to get vendor documents for admin review
CREATE OR REPLACE FUNCTION public.get_vendor_documents_for_review(p_vendor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.user_has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'document_type', d.document_type,
            'file_name', d.file_name,
            'file_size', d.file_size,
            'mime_type', d.mime_type,
            'storage_path', d.storage_path,
            'status', d.status,
            'document_number', d.document_number,
            'created_at', d.created_at,
            'verified_at', d.verified_at,
            'rejection_reason', d.rejection_reason
        ) ORDER BY d.created_at DESC
    )
    INTO v_result
    FROM vendor_documents d
    WHERE d.vendor_id = p_vendor_id;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_documents_for_review TO authenticated;

-- Function to verify a document
CREATE OR REPLACE FUNCTION public.verify_vendor_document(
    p_document_id UUID,
    p_document_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    IF NOT public.user_has_role(v_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    UPDATE vendor_documents
    SET 
        status = 'verified',
        verified_at = NOW(),
        verified_by = v_admin_id,
        document_number = COALESCE(p_document_number, document_number),
        updated_at = NOW()
    WHERE id = p_document_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Document verified');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_vendor_document TO authenticated;

-- Function to reject a document
CREATE OR REPLACE FUNCTION public.reject_vendor_document(
    p_document_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    IF NOT public.user_has_role(v_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rejection reason required');
    END IF;
    
    UPDATE vendor_documents
    SET 
        status = 'rejected',
        verified_by = v_admin_id,
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_document_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Document rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_vendor_document TO authenticated;
