"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, FileText, Image, Check, XCircle, Loader2, Download, Eye, AlertCircle, Building2, Phone, Mail, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createBrowserClient } from '@supabase/ssr';

/**
 * VENDOR DETAILS MODAL
 * Purpose: Admin view of vendor application details including documents
 * Features:
 * - View business info
 * - View/verify/reject documents
 * - Document preview
 */

interface VendorDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  status: 'pending' | 'verified' | 'rejected';
  document_number?: string;
  created_at: string;
  verified_at?: string;
  rejection_reason?: string;
}

interface VendorDetails {
  user_id: string;
  business_name: string;
  business_type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  verification_status: string;
  application_state?: string;
  application_notes?: string;
  created_at: string;
  documents_submitted?: boolean;
  documents_verified?: boolean;
}

interface VendorDetailsModalProps {
  vendor: VendorDetails;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  pan_certificate: 'PAN Certificate',
  vat_certificate: 'VAT Certificate',
  business_registration: 'Business Registration',
  citizenship: 'Citizenship/ID',
  other: 'Other Document',
};

export default function VendorDetailsModal({ vendor, onClose, onApprove, onReject }: VendorDetailsModalProps) {
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<VendorDocument | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Full vendor profile state
  const [vendorProfile, setVendorProfile] = useState<VendorDetails>(vendor);

  // Fetch vendor documents and full profile
  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Fetch full vendor profile with contact details
        const { data: profileData, error: profileError } = await supabase
          .from('vendor_profiles')
          .select('contact_name, contact_email, contact_phone, application_notes, application_state, documents_submitted, documents_verified')
          .eq('user_id', vendor.user_id)
          .single();

        if (!profileError && profileData) {
          setVendorProfile(prev => ({
            ...prev,
            contact_name: profileData.contact_name,
            contact_email: profileData.contact_email,
            contact_phone: profileData.contact_phone,
            application_notes: profileData.application_notes,
            application_state: profileData.application_state,
            documents_submitted: profileData.documents_submitted,
            documents_verified: profileData.documents_verified,
          }));
        }

        // Fetch documents
        const { data: docsData, error: rpcError } = await supabase.rpc('get_vendor_documents_for_review', {
          p_vendor_id: vendor.user_id
        });

        if (rpcError) throw rpcError;
        setDocuments(docsData || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [vendor.user_id]);


  // Get signed URL for document preview
  const getDocumentUrl = useCallback(async (doc: VendorDocument) => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.storage
      .from('vendor-documents')
      .createSignedUrl(doc.storage_path, 3600); // 1 hour expiry

    if (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
    return data.signedUrl;
  }, []);

  // Preview document
  const handlePreview = useCallback(async (doc: VendorDocument) => {
    const url = await getDocumentUrl(doc);
    if (url) {
      setPreviewUrl(url);
      setPreviewDoc(doc);
    }
  }, [getDocumentUrl]);

  // Download document
  const handleDownload = useCallback(async (doc: VendorDocument) => {
    const url = await getDocumentUrl(doc);
    if (url) {
      window.open(url, '_blank');
    }
  }, [getDocumentUrl]);

  // Verify document
  const handleVerifyDocument = useCallback(async (doc: VendorDocument) => {
    const docNumber = prompt('Enter document number (optional):');
    
    setActionLoading(doc.id);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase.rpc('verify_vendor_document', {
        p_document_id: doc.id,
        p_document_number: docNumber || null
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Verification failed');

      // Update local state
      setDocuments(prev => prev.map(d => 
        d.id === doc.id 
          ? { ...d, status: 'verified', document_number: docNumber || d.document_number }
          : d
      ));
    } catch (err) {
      console.error('Error verifying document:', err);
      alert('Failed to verify document');
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Reject document
  const handleRejectDocument = useCallback(async (doc: VendorDocument) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason || reason.length < 5) {
      alert('Please provide a valid rejection reason (min 5 characters)');
      return;
    }
    
    setActionLoading(doc.id);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase.rpc('reject_vendor_document', {
        p_document_id: doc.id,
        p_reason: reason
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Rejection failed');

      // Update local state
      setDocuments(prev => prev.map(d => 
        d.id === doc.id 
          ? { ...d, status: 'rejected', rejection_reason: reason }
          : d
      ));
    } catch (err) {
      console.error('Error rejecting document:', err);
      alert('Failed to reject document');
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Check if all required documents are verified
  const allDocsVerified = documents.length > 0 && documents.every(d => d.status === 'verified');
  const hasPendingDocs = documents.some(d => d.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--kb-card-bg)] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold">{vendor.business_name}</h2>
            <p className="text-sm text-foreground/60">Vendor Application Details</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Business Info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Business Information
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <span className="text-foreground/60">Business Name</span>
                <p className="font-medium">{vendorProfile.business_name}</p>
              </div>
              <div>
                <span className="text-foreground/60">Business Type</span>
                <p className="font-medium">{vendorProfile.business_type || 'N/A'}</p>
              </div>
              <div>
                <span className="text-foreground/60">Contact Name</span>
                <p className="font-medium">{vendorProfile.contact_name || 'N/A'}</p>
              </div>
              <div>
                <span className="text-foreground/60">Status</span>
                <p className={cn(
                  "font-medium",
                  vendorProfile.verification_status === 'verified' && "text-emerald-400",
                  vendorProfile.verification_status === 'pending' && "text-amber-400",
                  vendorProfile.verification_status === 'rejected' && "text-red-400"
                )}>
                  {vendorProfile.verification_status}
                </p>
              </div>
              {vendorProfile.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-foreground/40" />
                  <span>{vendorProfile.contact_email}</span>
                </div>
              )}
              {vendorProfile.contact_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-foreground/40" />
                  <span>{vendorProfile.contact_phone}</span>
                </div>
              )}
            </div>
            {vendorProfile.application_notes && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <span className="text-foreground/60 text-sm">Admin Notes</span>
                <p className="text-sm mt-1">{vendorProfile.application_notes}</p>
              </div>
            )}
          </div>


          {/* Documents Section */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Verification Documents
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>{error}</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-foreground/60">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No documents uploaded</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3",
                      doc.status === 'verified' && "border-emerald-500/20 bg-emerald-500/5",
                      doc.status === 'pending' && "border-amber-500/20 bg-amber-500/5",
                      doc.status === 'rejected' && "border-red-500/20 bg-red-500/5"
                    )}
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      {doc.mime_type === 'application/pdf' ? (
                        <FileText className="h-8 w-8 text-foreground/60" />
                      ) : (
                        <Image className="h-8 w-8 text-foreground/60" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </p>
                      <p className="text-xs text-foreground/60 truncate">{doc.file_name}</p>
                      {doc.document_number && (
                        <p className="text-xs text-foreground/60">Doc #: {doc.document_number}</p>
                      )}
                      {doc.rejection_reason && (
                        <p className="text-xs text-red-400 mt-1">Reason: {doc.rejection_reason}</p>
                      )}
                    </div>

                    {/* Status Badge */}
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full",
                      doc.status === 'verified' && "bg-emerald-500/20 text-emerald-400",
                      doc.status === 'pending' && "bg-amber-500/20 text-amber-400",
                      doc.status === 'rejected' && "bg-red-500/20 text-red-400"
                    )}>
                      {doc.status}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePreview(doc)}
                        className="p-2 hover:bg-white/10 rounded-lg"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-2 hover:bg-white/10 rounded-lg"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      
                      {doc.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleVerifyDocument(doc)}
                            disabled={actionLoading === doc.id}
                            className="p-2 hover:bg-emerald-500/20 rounded-lg text-emerald-400"
                            title="Verify"
                          >
                            {actionLoading === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectDocument(doc)}
                            disabled={actionLoading === doc.id}
                            className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Document Status Summary */}
            {documents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 text-sm">
                {allDocsVerified ? (
                  <p className="text-emerald-400 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    All documents verified
                  </p>
                ) : hasPendingDocs ? (
                  <p className="text-amber-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {documents.filter(d => d.status === 'pending').length} document(s) pending review
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg ring-1 ring-white/10 hover:bg-white/5"
          >
            Close
          </button>
          
          {vendorProfile.verification_status === 'pending' && (
            <div className="flex items-center gap-2">
              <button
                onClick={onReject}
                className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                Reject Application
              </button>
              <button
                onClick={onApprove}
                disabled={hasPendingDocs}
                className={cn(
                  "px-4 py-2 text-sm rounded-lg",
                  hasPendingDocs 
                    ? "bg-white/10 text-foreground/40 cursor-not-allowed"
                    : "bg-emerald-500 text-white hover:bg-emerald-600"
                )}
                title={hasPendingDocs ? "Review all documents before approving" : "Approve vendor"}
              >
                Approve Vendor
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewUrl && previewDoc && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => { setPreviewUrl(null); setPreviewDoc(null); }}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full">
            <button
              onClick={() => { setPreviewUrl(null); setPreviewDoc(null); }}
              className="absolute -top-10 right-0 p-2 text-white hover:text-white/80"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="text-center text-white mb-2">
              <p className="font-medium">{DOCUMENT_TYPE_LABELS[previewDoc.document_type]}</p>
              <p className="text-sm text-white/60">{previewDoc.file_name}</p>
            </div>
            {previewDoc.mime_type === 'application/pdf' ? (
              <iframe 
                src={previewUrl} 
                className="w-full h-[80vh] rounded-lg"
                title={previewDoc.file_name}
              />
            ) : (
              <img 
                src={previewUrl} 
                alt={previewDoc.file_name}
                className="max-w-full max-h-[80vh] mx-auto rounded-lg object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
