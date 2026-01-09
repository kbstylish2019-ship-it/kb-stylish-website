"use client";

import React, { useState, useRef, useEffect } from "react";
import FocusTrap from "focus-trap-react";
import { X, Package, Info, Check, Image as ImageIcon, Loader2, Grid } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createVendorProduct } from "@/app/actions/vendor";
import { createClient } from "@/lib/supabase/client";
import ImageUploader from "@/components/vendor/ImageUploader";
import VariantBuilder from "@/components/vendor/VariantBuilder";
import CustomSelect from "@/components/ui/CustomSelect";
import type { ImageForBackend } from "@/lib/hooks/useImageUpload";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: (product: any) => void;
}

type Step = "basic" | "media" | "variants" | "review";

const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic Info", icon: <Package className="h-4 w-4" /> },
  { id: "media", label: "Images", icon: <ImageIcon className="h-4 w-4" /> },
  { id: "variants", label: "Variants", icon: <Grid className="h-4 w-4" /> },
  { id: "review", label: "Review", icon: <Check className="h-4 w-4" /> },
];

// REMOVED: Hardcoded CATEGORY_MAP - now loading dynamically from database

export default function AddProductModal({ open, onClose, userId, onSuccess }: AddProductModalProps) {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
  });
  const [images, setImages] = useState<ImageForBackend[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);

  const currentStep = steps[currentStepIndex].id;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  const canSubmit = isLastStep;

  // Get vendor ID from auth
  useEffect(() => {
    if (!open) return;
    
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setVendorId(user.id);
      }
    };
    
    getUser();
  }, [open]);

  // Set initial focus when modal opens
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  // Fetch categories dynamically from database
  useEffect(() => {
    if (!open) return; // Don't fetch if modal closed
    
    const fetchCategories = async () => {
      setLoadingCategories(true);
      setCategoryError(null);
      
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true)
          .order('name', { ascending: true });
        
        if (error) throw error;
        
        setCategories(data || []);
      } catch (err: any) {
        console.error('Error fetching categories:', err);
        setCategoryError('Failed to load categories');
      } finally {
        setLoadingCategories(false);
      }
    };
    
    fetchCategories();
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleNext = () => {
    if (!canSubmit) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      // Validation
      if (!formData.name.trim()) {
        setError('Please enter a product name');
        setIsSubmitting(false);
        return;
      }
      
      if (!formData.category) {
        setError('Please select a category');
        setIsSubmitting(false);
        return;
      }
      
      if (images.length === 0) {
        setError('Please upload at least one product image');
        setCurrentStepIndex(1); // Go back to images step
        setIsSubmitting(false);
        return;
      }
      
      if (variants.length === 0) {
        setError('Please configure at least one variant');
        setCurrentStepIndex(2); // Go back to variants step
        setIsSubmitting(false);
        return;
      }
      
      // Validate all variants have SKU and price
      const invalidVariants = variants.filter(v => !v.sku || v.price <= 0);
      if (invalidVariants.length > 0) {
        setError('All variants must have a SKU and price greater than 0');
        setCurrentStepIndex(2); // Go back to variants step
        setIsSubmitting(false);
        return;
      }
      
      // Create product data
      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category_id: formData.category,
        variants: variants,
        images: images,
      };
      
      console.log('Creating product with data:', productData);
      const result = await createVendorProduct(productData);
      
      if (result?.success) {
        console.log('Product created successfully:', result);
        
        // Show success message
        setSuccessMessage(`Product "${formData.name}" created successfully!`);
        
        // Reset form
        setFormData({ name: "", description: "", category: "" });
        setImages([]);
        setVariants([]);
        setCurrentStepIndex(0);
        setIsSubmitting(false);
        
        // Close modal after short delay to show success
        setTimeout(() => {
          onClose();
          // Refresh page data
          router.refresh();
        }, 1500);
      } else {
        console.error('Product creation failed:', result?.message);
        setError(result?.message || 'Failed to create product');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error('Product creation error:', err);
      setError(err.message || 'An unexpected error occurred');
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!open) return null;

  return (
    <FocusTrap active={open}>
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close overlay"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
        />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <h2 id="add-product-title" className="text-xl font-semibold text-gray-900">Add Product/Service</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 text-gray-500"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        {/* Success Display */}
        {successMessage && (
          <div className="mx-6 mb-4 rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-600">{successMessage}</p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full ring-2 transition-colors",
                    idx <= currentStepIndex
                      ? "bg-[#1976D2] ring-[#1976D2] text-white"
                      : "bg-gray-100 ring-gray-200 text-gray-400"
                  )}
                >
                  {step.icon}
                </div>
                <div className="ml-3 hidden sm:block">
                  <p className={cn("text-sm font-medium", idx <= currentStepIndex ? "text-gray-900" : "text-gray-400")}>
                    {step.label}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div className={cn("mx-4 h-px w-12 transition-colors", idx < currentStepIndex ? "bg-[#1976D2]" : "bg-gray-200")} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {currentStep === "basic" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g., Premium Cotton Kurta"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-[#1976D2]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Describe your product..."
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-[#1976D2]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                {loadingCategories ? (
                  <div className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-gray-500">Loading categories...</span>
                  </div>
                ) : categoryError ? (
                  <div className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {categoryError}
                  </div>
                ) : (
                  <CustomSelect
                    value={formData.category}
                    onChange={(value) => setFormData({ ...formData, category: value })}
                    options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
                    placeholder="Select a category"
                    required
                    disabled={loadingCategories}
                  />
                )}
              </div>
            </div>
          )}

          {currentStep === "media" && (
            <div className="space-y-4">
              {vendorId ? (
                <ImageUploader
                  vendorId={vendorId}
                  onChange={setImages}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Loading...
                </div>
              )}
            </div>
          )}

          {currentStep === "variants" && (
            <div className="space-y-4">
              <VariantBuilder
                productName={formData.name}
                onChange={setVariants}
              />
            </div>
          )}

          {currentStep === "review" && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Review Your Product</h3>
              
              {/* Basic Info */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3">Basic Information</h4>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Name:</dt>
                    <dd className="text-sm font-medium text-gray-900">{formData.name || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Category:</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {formData.category 
                        ? categories.find(c => c.id === formData.category)?.name || "Unknown"
                        : "—"}
                    </dd>
                  </div>
                  {formData.description && (
                    <div className="pt-2 border-t border-gray-200">
                      <dt className="text-sm text-gray-500 mb-1">Description:</dt>
                      <dd className="text-sm text-gray-700">{formData.description}</dd>
                    </div>
                  )}
                </dl>
              </div>
              
              {/* Images */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3">
                  Images ({images.length})
                </h4>
                {images.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                        <img src={img.image_url} alt={img.alt_text} className="w-full h-full object-cover" />
                        {img.is_primary && (
                          <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">Primary</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No images uploaded</p>
                )}
              </div>
              
              {/* Variants */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3">
                  Variants ({variants.length})
                </h4>
                {variants.length > 0 ? (
                  <div className="space-y-2">
                    {variants.slice(0, 5).map((variant, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                        <span className="text-sm text-gray-700">{variant.sku}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">NPR {variant.price}</span>
                          <span className="text-xs text-gray-500">Stock: {variant.quantity}</span>
                        </div>
                      </div>
                    ))}
                    {variants.length > 5 && (
                      <p className="text-xs text-gray-500 text-center pt-2">
                        + {variants.length - 5} more variants
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No variants configured</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            onClick={handlePrev}
            disabled={isFirstStep}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isFirstStep
                ? "cursor-not-allowed text-gray-300"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            Previous
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Creating...' : 'Create Product'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="rounded-full bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1565C0]"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
