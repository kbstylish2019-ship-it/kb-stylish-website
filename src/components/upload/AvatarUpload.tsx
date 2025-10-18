'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, User } from 'lucide-react';
import Image from 'next/image';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadSuccess?: (url: string) => void;
  targetUserId?: string | null;
  className?: string;
}

export default function AvatarUpload({ 
  currentAvatarUrl, 
  onUploadSuccess,
  targetUserId,
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
      
      // If targetUserId is provided (admin uploading for stylist), include it
      if (targetUserId) {
        formData.append('target_user_id', targetUserId);
      }
      
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
            aria-label="Upload profile picture"
          />
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
