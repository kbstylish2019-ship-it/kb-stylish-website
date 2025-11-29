"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, FileText, Image, AlertCircle, Check, Loader2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

/**
 * VENDOR DOCUMENT UPLOADER
 * Purpose: Upload PAN, VAT, and business registration documents
 * Features:
 * - Rate limiting (max 5 uploads per minute)
 * - File validation (type, size)
 * - Progress tracking
 * - Preview support
 */

export type DocumentType = 'pan_certificate' | 'vat_certificate' | 'business_registration' | 'citizenship' | 'other';

interface UploadedDocument {
  id: string;
  document_type: DocumentType;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  preview_url?: string;
}

interface DocumentUploaderProps {
  onChange: (documents: UploadedDocument[]) => void;
  required?: DocumentType[];
}

const DOCUMENT_LABELS: Record<DocumentType, { label: string; description: string }> = {
  pan_certificate: {
    label: 'PAN Certificate',
    description: 'Permanent Account Number certificate from IRD',
  },
  vat_certificate: {
    label: 'VAT Certificate (Optional)',
    description: 'VAT registration certificate if applicable',
  },
  business_registration: {
    label: 'Business Registration',
    description: 'Company registration or sole proprietorship certificate',
  },
  citizenship: {
    label: 'Citizenship/ID',
    description: 'Owner citizenship or national ID',
  },
  other: {
    label: 'Other Document',
    description: 'Any additional supporting document',
  },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_UPLOADS_PER_WINDOW = 5;

export default function DocumentUploader({ onChange, required = ['pan_certificate'] }: DocumentUploaderProps) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploadTimestamps, setUploadTimestamps] = useState<number[]>([]);
  const [selectedType, setSelectedType] = useState<DocumentType>('pan_certificate');
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);

  // Notify parent of changes
  useEffect(() => {
    onChange(documents.filter(d => d.status === 'success'));
  }, [documents, onChange]);

  // Rate limiting check
  const canUpload = useCallback(() => {
    const now = Date.now();
    const recentUploads = uploadTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    return recentUploads.length < MAX_UPLOADS_PER_WINDOW;
  }, [uploadTimestamps]);

  // Validate file
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload JPG, PNG, WebP, or PDF.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File too large. Maximum size is 10MB.';
    }
    return null;
  };


  // Upload file to Supabase Storage
  const uploadFile = useCallback(async (file: File, docType: DocumentType) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('You must be logged in to upload documents');
    }

    // Create unique file path: {user_id}/{doc_type}_{timestamp}_{filename}
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${user.id}/${docType}_${timestamp}_${safeName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('vendor-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    // Create database record
    const { data: docRecord, error: dbError } = await supabase
      .from('vendor_documents')
      .insert({
        vendor_id: user.id,
        document_type: docType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        status: 'pending',
      })
      .select()
      .single();

    if (dbError) {
      // Cleanup storage if DB insert fails
      await supabase.storage.from('vendor-documents').remove([storagePath]);
      throw new Error(dbError.message);
    }

    return { storagePath, docId: docRecord.id };
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      // Rate limit check
      if (!canUpload()) {
        alert('Too many uploads. Please wait a minute before uploading more files.');
        return;
      }

      // Validate
      const validationError = validateFile(file);
      if (validationError) {
        alert(validationError);
        continue;
      }

      // Create temp ID and add to state
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newDoc: UploadedDocument = {
        id: tempId,
        document_type: selectedType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: '',
        status: 'uploading',
        progress: 0,
        preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      };

      setDocuments(prev => [...prev, newDoc]);
      setUploadTimestamps(prev => [...prev, Date.now()]);

      try {
        // Simulate progress
        const progressInterval = setInterval(() => {
          setDocuments(prev => prev.map(d => 
            d.id === tempId && d.progress < 90 
              ? { ...d, progress: d.progress + 10 }
              : d
          ));
        }, 200);

        const { storagePath, docId } = await uploadFile(file, selectedType);

        clearInterval(progressInterval);

        // Update with success
        setDocuments(prev => prev.map(d => 
          d.id === tempId 
            ? { ...d, id: docId, storage_path: storagePath, status: 'success', progress: 100 }
            : d
        ));
      } catch (error) {
        // Update with error
        setDocuments(prev => prev.map(d => 
          d.id === tempId 
            ? { ...d, status: 'error', error: (error as Error).message }
            : d
        ));
      }
    }
  }, [selectedType, canUpload, uploadFile]);

  // Remove document
  const removeDocument = useCallback(async (doc: UploadedDocument) => {
    if (doc.status === 'success' && doc.storage_path) {
      const supabase = createClient();
      
      // Delete from storage
      await supabase.storage.from('vendor-documents').remove([doc.storage_path]);
      
      // Delete from database
      await supabase.from('vendor_documents').delete().eq('id', doc.id);
    }

    // Revoke preview URL
    if (doc.preview_url) {
      URL.revokeObjectURL(doc.preview_url);
    }

    setDocuments(prev => prev.filter(d => d.id !== doc.id));
  }, []);

  // Drag and drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Check if required documents are uploaded
  const missingRequired = required.filter(
    reqType => !documents.some(d => d.document_type === reqType && d.status === 'success')
  );

  return (
    <div className="space-y-4">
      {/* Document Type Selector */}
      <div>
        <label className="text-sm font-medium">Document Type</label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as DocumentType)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50 [&>option]:bg-[var(--kb-surface-dark)] [&>option]:text-foreground"
        >
          {Object.entries(DOCUMENT_LABELS).map(([type, { label }]) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-foreground/60">
          {DOCUMENT_LABELS[selectedType].description}
        </p>
      </div>

      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
          isDragging 
            ? "border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10" 
            : "border-white/20 bg-white/5 hover:border-[var(--kb-primary-brand)]/50 hover:bg-white/10"
        )}
      >
        <input
          type="file"
          id="document-upload"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          className="hidden"
        />
        <label htmlFor="document-upload" className="cursor-pointer">
          <Upload className="mx-auto h-10 w-10 text-foreground/40" />
          <p className="mt-2 text-sm text-foreground/60">
            Drag and drop or <span className="text-[var(--kb-primary-brand)] font-medium">browse</span>
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            JPG, PNG, WebP, or PDF up to 10MB
          </p>
        </label>
      </div>


      {/* Uploaded Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Documents</h4>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3",
                doc.status === 'success' && "border-emerald-500/20 bg-emerald-500/10",
                doc.status === 'uploading' && "border-blue-500/20 bg-blue-500/10",
                doc.status === 'error' && "border-red-500/20 bg-red-500/10"
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                {doc.mime_type === 'application/pdf' ? (
                  <FileText className="h-8 w-8 text-foreground/60" />
                ) : doc.preview_url ? (
                  <img 
                    src={doc.preview_url} 
                    alt={doc.file_name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <Image className="h-8 w-8 text-foreground/60" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                <p className="text-xs text-foreground/60">
                  {DOCUMENT_LABELS[doc.document_type].label} • {(doc.file_size / 1024).toFixed(1)} KB
                </p>
                {doc.status === 'uploading' && (
                  <div className="mt-1 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${doc.progress}%` }}
                    />
                  </div>
                )}
                {doc.status === 'error' && (
                  <p className="text-xs text-red-400 mt-1">{doc.error}</p>
                )}
              </div>

              {/* Status & Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {doc.status === 'uploading' && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                )}
                {doc.status === 'success' && (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    {doc.preview_url && (
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="p-1 hover:bg-white/10 rounded"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4 text-foreground/60" />
                      </button>
                    )}
                  </>
                )}
                {doc.status === 'error' && (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
                <button
                  onClick={() => removeDocument(doc)}
                  className="p-1 hover:bg-white/10 rounded"
                  title="Remove"
                >
                  <X className="h-4 w-4 text-foreground/60" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Required Documents Warning */}
      {missingRequired.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-400">
            <p className="font-medium">Required documents missing:</p>
            <ul className="mt-1 list-disc list-inside text-xs">
              {missingRequired.map(type => (
                <li key={type}>{DOCUMENT_LABELS[type].label}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Success Message */}
      {missingRequired.length === 0 && documents.some(d => d.status === 'success') && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-400">All required documents uploaded</span>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && previewDoc.preview_url && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewDoc(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-white/80"
            >
              <X className="h-6 w-6" />
            </button>
            <img 
              src={previewDoc.preview_url} 
              alt={previewDoc.file_name}
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
