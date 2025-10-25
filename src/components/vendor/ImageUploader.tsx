'use client';

import React, { useCallback, useState } from 'react';
import { ImageIcon, X, Upload, AlertCircle, Check, Loader2, GripVertical, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImageUpload, type UploadedImage, type ImageForBackend } from '@/lib/hooks/useImageUpload';

interface ImageUploaderProps {
  vendorId: string;
  onChange: (images: ImageForBackend[]) => void;
}

export default function ImageUploader({ vendorId, onChange }: ImageUploaderProps) {
  const {
    images,
    isUploading,
    addImages,
    removeImage,
    setPrimaryImage,
    updateAltText,
    retryUpload,
    getUploadedImages,
    getStats,
  } = useImageUpload(vendorId);
  
  // Notify parent of changes
  React.useEffect(() => {
    onChange(getUploadedImages());
  }, [images, onChange, getUploadedImages]);
  
  // Handle file input
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addImages(files);
      e.target.value = ''; // Reset input
    }
  }, [addImages]);
  
  // Handle drag and drop
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addImages(files);
  }, [addImages]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const stats = getStats();
  
  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-xl border-2 border-dashed bg-white/5 p-8 text-center transition-colors cursor-pointer",
          isDragging 
            ? "border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10" 
            : "border-white/20 hover:border-[var(--kb-primary-brand)]/50 hover:bg-white/10"
        )}
      >
        <input
          type="file"
          id="image-upload"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        <label htmlFor="image-upload" className="cursor-pointer">
          <Upload className="mx-auto h-12 w-12 text-foreground/40" />
          <p className="mt-2 text-sm text-foreground/60">
            Drag and drop images here, or <span className="text-[var(--kb-primary-brand)] font-medium">browse</span>
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            PNG, JPG, WebP, GIF up to 10MB each • Recommended: 1920×1920px
          </p>
          {stats.total > 0 && (
            <p className="mt-2 text-xs text-foreground/60">
              {stats.success} of {stats.total} uploaded
            </p>
          )}
        </label>
      </div>
      
      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <ImagePreview
              key={image.id}
              image={image}
              onRemove={() => removeImage(image.id)}
              onSetPrimary={() => setPrimaryImage(image.id)}
              onUpdateAlt={(altText) => updateAltText(image.id, altText)}
              onRetry={() => retryUpload(image.id)}
            />
          ))}
        </div>
      )}
      
      {/* Upload Status */}
      {isUploading && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-400">
            Uploading {stats.uploading} image{stats.uploading !== 1 ? 's' : ''}...
          </span>
        </div>
      )}
      
      {/* Error Summary */}
      {stats.error > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">
            {stats.error} image{stats.error !== 1 ? 's' : ''} failed to upload. Click retry on failed images.
          </span>
        </div>
      )}
      
      {/* Validation Message */}
      {images.length === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-400">Please upload at least one product image</span>
        </div>
      )}
      
      {/* Success Message */}
      {stats.success > 0 && stats.error === 0 && !isUploading && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 flex items-center gap-3">
          <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-400">
            All {stats.success} image{stats.success !== 1 ? 's' : ''} uploaded successfully
          </span>
        </div>
      )}
    </div>
  );
}

interface ImagePreviewProps {
  image: UploadedImage;
  onRemove: () => void;
  onSetPrimary: () => void;
  onUpdateAlt: (altText: string) => void;
  onRetry: () => void;
}

function ImagePreview({ image, onRemove, onSetPrimary, onUpdateAlt, onRetry }: ImagePreviewProps) {
  const [isEditingAlt, setIsEditingAlt] = useState(false);
  const [altText, setAltText] = useState(image.alt_text);
  
  const handleAltSave = () => {
    onUpdateAlt(altText);
    setIsEditingAlt(false);
  };
  
  return (
    <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-white/5">
      {/* Image */}
      <div className="aspect-square relative">
        {image.status === 'pending' || image.status === 'uploading' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5">
            <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
            <span className="mt-2 text-xs text-foreground/60">{image.progress}%</span>
          </div>
        ) : image.status === 'success' ? (
          <>
            <img
              src={image.publicUrl}
              alt={image.alt_text}
              className="w-full h-full object-cover"
            />
            
            {/* Primary Badge */}
            {image.is_primary && (
              <div className="absolute top-2 left-2 rounded-full bg-green-500 px-2 py-1 text-xs font-medium text-white flex items-center gap-1 shadow-lg">
                <Star className="h-3 w-3 fill-white" />
                Primary
              </div>
            )}
            
            {/* Actions Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {!image.is_primary && (
                <button
                  onClick={onSetPrimary}
                  className="rounded-lg bg-white/20 p-2 hover:bg-white/30 transition-colors"
                  title="Set as primary image"
                >
                  <Star className="h-4 w-4 text-white" />
                </button>
              )}
              
              <button
                onClick={onRemove}
                className="rounded-lg bg-red-500/80 p-2 hover:bg-red-500 transition-colors"
                title="Remove image"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <span className="mt-2 text-xs text-red-400 text-center px-2">{image.error}</span>
            <button
              onClick={onRetry}
              className="mt-2 text-xs text-red-400 underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      
      {/* Alt Text Editor */}
      {image.status === 'success' && (
        <div className="p-2 bg-white/5">
          {isEditingAlt ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                placeholder="Alt text"
                autoFocus
                onBlur={handleAltSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAltSave();
                  if (e.key === 'Escape') {
                    setAltText(image.alt_text);
                    setIsEditingAlt(false);
                  }
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => setIsEditingAlt(true)}
              className="w-full text-left text-xs text-foreground/60 hover:text-foreground/80 truncate"
              title={image.alt_text || 'Click to add alt text'}
            >
              {image.alt_text || 'Add alt text...'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
