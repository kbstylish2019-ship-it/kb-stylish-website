'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  optimizeImage, 
  validateImageFile, 
  generateSafeFilename 
} from '@/lib/utils/imageOptimization';

export interface UploadedImage {
  id: string; // Temporary ID for UI tracking
  file: File;
  url: string; // Storage path (e.g., "vendor-id/filename.jpg")
  publicUrl?: string; // Full public URL
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number; // 0-100
  error?: string;
}

export interface ImageForBackend {
  image_url: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
}

/**
 * Hook for managing product image uploads
 * Handles: validation, optimization, upload, state management
 * 
 * @param vendorId - UUID of the vendor (for storage path)
 * @returns Image management functions and state
 */
export function useImageUpload(vendorId: string) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const supabase = createClient();
  
  /**
   * Upload a single image to Supabase Storage
   * Handles: optimization, upload, error recovery
   */
  const uploadSingleImage = useCallback(async (
    image: UploadedImage
  ): Promise<UploadedImage> => {
    try {
      // Update status to uploading
      setImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, status: 'uploading' as const, progress: 10 } : img
      ));
      
      // Optimize image (resize + compress)
      const optimized = await optimizeImage(image.file);
      
      // Update progress
      setImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, progress: 40 } : img
      ));
      
      // Generate safe filename
      const filename = generateSafeFilename(image.file.name, vendorId);
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(filename, optimized, {
          cacheControl: '3600',
          upsert: false, // Don't overwrite existing files
        });
      
      if (error) throw error;
      
      // Update progress
      setImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, progress: 80 } : img
      ));
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filename);
      
      // Update to success
      const updatedImage: UploadedImage = {
        ...image,
        url: filename,
        publicUrl,
        status: 'success',
        progress: 100,
      };
      
      setImages(prev => prev.map(img => 
        img.id === image.id ? updatedImage : img
      ));
      
      return updatedImage;
    } catch (error: any) {
      console.error(`Upload failed for ${image.file.name}:`, error);
      
      const failedImage: UploadedImage = {
        ...image,
        status: 'error',
        progress: 0,
        error: error.message || 'Upload failed',
      };
      
      setImages(prev => prev.map(img => 
        img.id === image.id ? failedImage : img
      ));
      
      return failedImage;
    }
  }, [vendorId, supabase]);
  
  /**
   * Add files to upload queue and start uploading
   * Validates files, creates pending entries, uploads in parallel batches
   */
  const addImages = useCallback(async (files: File[]) => {
    // Validate files
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    files.forEach(file => {
      const validation = validateImageFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });
    
    // Show validation errors
    if (errors.length > 0) {
      console.error('File validation errors:', errors);
      // TODO: Show toast notification
    }
    
    if (validFiles.length === 0) return;
    
    // Create pending image entries
    const newImages: UploadedImage[] = validFiles.map((file, index) => ({
      id: `temp-${Date.now()}-${index}`,
      file,
      url: '',
      alt_text: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      sort_order: images.length + index,
      is_primary: images.length === 0 && index === 0, // First image is primary
      status: 'pending',
      progress: 0,
    }));
    
    setImages(prev => [...prev, ...newImages]);
    setIsUploading(true);
    
    // Upload in parallel (max 3 concurrent to avoid overwhelming)
    const batchSize = 3;
    for (let i = 0; i < newImages.length; i += batchSize) {
      const batch = newImages.slice(i, i + batchSize);
      await Promise.all(batch.map(img => uploadSingleImage(img)));
    }
    
    setIsUploading(false);
  }, [images.length, uploadSingleImage]);
  
  /**
   * Remove an image (and delete from storage if uploaded)
   */
  const removeImage = useCallback(async (imageId: string) => {
    const image = images.find(img => img.id === imageId);
    
    if (image && image.status === 'success' && image.url) {
      try {
        // Delete from storage
        await supabase.storage
          .from('product-images')
          .remove([image.url]);
      } catch (error) {
        console.error('Failed to delete image from storage:', error);
        // Continue anyway to remove from UI
      }
    }
    
    // Remove from state
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== imageId);
      // Reassign sort orders
      return filtered.map((img, index) => ({ ...img, sort_order: index }));
    });
  }, [images, supabase]);
  
  /**
   * Reorder images by drag and drop
   */
  const reorderImages = useCallback((startIndex: number, endIndex: number) => {
    setImages(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      
      // Update sort_order for all images
      return result.map((img, index) => ({ ...img, sort_order: index }));
    });
  }, []);
  
  /**
   * Set an image as primary
   */
  const setPrimaryImage = useCallback((imageId: string) => {
    setImages(prev => prev.map(img => ({
      ...img,
      is_primary: img.id === imageId,
    })));
  }, []);
  
  /**
   * Update image alt text
   */
  const updateAltText = useCallback((imageId: string, altText: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, alt_text: altText } : img
    ));
  }, []);
  
  /**
   * Retry failed upload
   */
  const retryUpload = useCallback(async (imageId: string) => {
    const image = images.find(img => img.id === imageId);
    if (!image || image.status !== 'error') return;
    
    await uploadSingleImage(image);
  }, [images, uploadSingleImage]);
  
  /**
   * Get successfully uploaded images formatted for backend submission
   * Returns only images with status='success' and publicUrl defined
   */
  const getUploadedImages = useCallback((): ImageForBackend[] => {
    return images
      .filter(img => img.status === 'success' && img.publicUrl)
      .map(img => ({
        image_url: img.publicUrl!,
        alt_text: img.alt_text || 'Product image',
        sort_order: img.sort_order,
        is_primary: img.is_primary,
      }));
  }, [images]);
  
  /**
   * Check if all images are successfully uploaded
   */
  const allImagesUploaded = useCallback(() => {
    if (images.length === 0) return false;
    return images.every(img => img.status === 'success');
  }, [images]);
  
  /**
   * Get upload statistics
   */
  const getStats = useCallback(() => {
    return {
      total: images.length,
      pending: images.filter(img => img.status === 'pending').length,
      uploading: images.filter(img => img.status === 'uploading').length,
      success: images.filter(img => img.status === 'success').length,
      error: images.filter(img => img.status === 'error').length,
    };
  }, [images]);
  
  return {
    images,
    isUploading,
    addImages,
    removeImage,
    reorderImages,
    setPrimaryImage,
    updateAltText,
    retryUpload,
    getUploadedImages,
    allImagesUploaded,
    getStats,
  };
}
