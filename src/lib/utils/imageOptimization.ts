/**
 * Client-side image optimization utility
 * Compresses and resizes images before upload to reduce bandwidth and storage costs
 * 
 * Security: Validates file types and sizes
 * Performance: Reduces 5MB images to ~300-500KB
 */

export interface OptimizationOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0-1
  maxSizeMB: number;
}

const DEFAULT_OPTIONS: OptimizationOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  maxSizeMB: 0.5, // 500KB target
};

/**
 * Optimizes an image file by resizing and compressing
 * @param file - Original image file
 * @param options - Optimization parameters
 * @returns Optimized Blob ready for upload
 */
export async function optimizeImage(
  file: File,
  options: Partial<OptimizationOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        
        if (width > opts.maxWidth) {
          height = Math.round((height * opts.maxWidth) / width);
          width = opts.maxWidth;
        }
        
        if (height > opts.maxHeight) {
          width = Math.round((width * opts.maxHeight) / height);
          height = opts.maxHeight;
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Use better quality image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to Blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            
            // Check if blob is under size limit
            const sizeMB = blob.size / (1024 * 1024);
            if (sizeMB <= opts.maxSizeMB) {
              resolve(blob);
            } else {
              // If still too large, reduce quality and try again
              const reducedQuality = Math.max(0.5, opts.quality * 0.7);
              canvas.toBlob(
                (retryBlob) => {
                  if (!retryBlob) {
                    reject(new Error('Failed to compress image sufficiently'));
                    return;
                  }
                  resolve(retryBlob);
                },
                'image/jpeg',
                reducedQuality
              );
            }
          },
          'image/jpeg',
          opts.quality
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validates image file before upload
 * Security: Prevents malicious file uploads
 * @param file - File to validate
 * @returns Validation result
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const maxSize = 10 * 1024 * 1024; // 10MB (before compression)
  
  if (!validTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF.' 
    };
  }
  
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.` 
    };
  }
  
  return { valid: true };
}

/**
 * Generates a safe filename for storage
 * Security: Sanitizes filename to prevent XSS and path traversal
 * @param originalName - Original file name
 * @param vendorId - Vendor UUID
 * @returns Sanitized filename with timestamp
 */
export function generateSafeFilename(originalName: string, vendorId: string): string {
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  // Sanitize: remove special characters except dash and underscore
  const safeName = originalName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace special chars with dash
    .substring(0, 30) // Limit length
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
  
  // Format: {vendorId}/{safeName}-{timestamp}-{random}.{ext}
  return `${vendorId}/${safeName || 'product'}-${timestamp}-${random}.${extension}`;
}

/**
 * Validates that an image URL is from the product-images bucket
 * Security: Prevents external URL injection
 * @param url - Image URL to validate
 * @returns true if URL is from product-images bucket
 */
export function isValidProductImageUrl(url: string): boolean {
  // Must contain the storage path for product-images
  return url.includes('/storage/v1/object/public/product-images/');
}

/**
 * Estimates upload time based on file size
 * @param fileSizeBytes - File size in bytes
 * @param connectionSpeedMbps - Estimated connection speed (default: 5 Mbps)
 * @returns Estimated seconds
 */
export function estimateUploadTime(
  fileSizeBytes: number, 
  connectionSpeedMbps: number = 5
): number {
  const fileSizeMb = fileSizeBytes / (1024 * 1024);
  const seconds = (fileSizeMb * 8) / connectionSpeedMbps;
  return Math.ceil(seconds);
}
