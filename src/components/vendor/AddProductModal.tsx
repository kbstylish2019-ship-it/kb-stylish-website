"use client";

import React, { useState, useRef, useEffect } from "react";
import FocusTrap from "focus-trap-react";
import { X, Package, Info, Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createVendorProduct } from "@/app/actions/vendor";
import { createClient } from "@/lib/supabase/client";

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

type Step = "basic" | "pricing" | "media" | "review";

const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic Info", icon: <Package className="h-4 w-4" /> },
  { id: "pricing", label: "Pricing", icon: <Info className="h-4 w-4" /> },
  { id: "media", label: "Media", icon: <ImageIcon className="h-4 w-4" /> },
  { id: "review", label: "Review", icon: <Check className="h-4 w-4" /> },
];

// REMOVED: Hardcoded CATEGORY_MAP - now loading dynamically from database

export default function AddProductModal({ open, onClose, userId, onSuccess }: AddProductModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    comparePrice: "",
    inventory: "",
    sku: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const currentStep = steps[currentStepIndex].id;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  const canSubmit = isLastStep;

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
    
    try {
      // Validate category selected (formData.category now contains UUID)
      if (!formData.category) {
        setError('Please select a category');
        setIsSubmitting(false);
        return;
      }
      
      // Create product data matching backend schema
      const productData = {
        name: formData.name,
        description: formData.description,
        category_id: formData.category, // Already a UUID from select value
        variants: [{
          sku: formData.sku || `SKU-${Date.now()}`,
          price: parseFloat(formData.price),
          compare_at_price: formData.comparePrice ? parseFloat(formData.comparePrice) : null,
          quantity: parseInt(formData.inventory) || 0,
        }],
        images: [], // TODO: Add image upload support
      };
      
      console.log('Creating product with data:', productData);
      const result = await createVendorProduct(productData);
      console.log('Product creation result:', result);
      
      if (result?.success) {
        console.log('Product created successfully', result);
        
        // ✅ FIX: Just trigger page refresh via router and close modal
        // The parent component will refetch data automatically
        
        // Reset form state
        setError(null);
        setIsSubmitting(false);
        setCurrentStepIndex(0);
        setFormData({
          name: "",
          description: "",
          category: "",
          price: "",
          comparePrice: "",
          inventory: "",
          sku: "",
        });
        
        // Close modal immediately - parent will refetch via revalidatePath
        onClose();
        
        // Show success message
        alert(`Product "${formData.name}" created successfully!`);
        
        // Trigger page refresh to show new product
        window.location.reload();
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
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-background p-6 shadow-xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="add-product-title" className="text-xl font-semibold">Add Product/Service</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full ring-2 transition-colors",
                    idx <= currentStepIndex
                      ? "bg-[var(--kb-primary-brand)] ring-[var(--kb-primary-brand)] text-white"
                      : "bg-white/5 ring-white/20 text-foreground/60"
                  )}
                >
                  {step.icon}
                </div>
                <div className="ml-3">
                  <p className={cn("text-sm font-medium", idx <= currentStepIndex ? "text-foreground" : "text-foreground/60")}>
                    {step.label}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div className={cn("mx-4 h-px w-12 transition-colors", idx < currentStepIndex ? "bg-[var(--kb-primary-brand)]" : "bg-white/20")} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[300px] mb-6">
          {currentStep === "basic" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g., Premium Cotton Kurta"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Describe your product..."
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Category *</label>
                {loadingCategories ? (
                  <div className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-foreground/60">Loading categories...</span>
                  </div>
                ) : categoryError ? (
                  <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {categoryError}
                  </div>
                ) : (
                  <select
                    value={formData.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                    disabled={categories.length === 0}
                  >
                    <option value="">Select category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {currentStep === "pricing" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">SKU *</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => updateField("sku", e.target.value)}
                  placeholder="PROD-001"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
                <p className="mt-1 text-xs text-foreground/60">Unique product identifier</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Selling Price (NPR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  placeholder="2999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
                <p className="text-xs text-[var(--kb-text-secondary)] mt-1">Current selling price for customers</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Original Price (NPR) - Optional</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.comparePrice}
                  onChange={(e) => updateField("comparePrice", e.target.value)}
                  placeholder="3999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
                <p className="text-xs text-[var(--kb-text-secondary)] mt-1">
                  Original/MSRP price before discount. Must be higher than selling price. Example: "Was NPR 3999, now NPR 2999"
                </p>
                {formData.comparePrice && formData.price && parseFloat(formData.comparePrice) < parseFloat(formData.price) && (
                  <p className="text-xs text-red-400 mt-1">⚠️ Original price must be higher than selling price</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Inventory *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.inventory}
                  onChange={(e) => updateField("inventory", e.target.value)}
                  placeholder="50"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
            </div>
          )}

          {currentStep === "media" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Product Images</label>
                <div className="rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-8 text-center">
                  <ImageIcon className="mx-auto h-12 w-12 text-foreground/40" />
                  <p className="mt-2 text-sm text-foreground/60">
                    Drag and drop images here, or <span className="text-[var(--kb-primary-brand)]">browse</span>
                  </p>
                  <p className="mt-1 text-xs text-foreground/40">PNG, JPG, GIF up to 10MB each</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === "review" && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Review Your Product</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-foreground/70">Name:</dt>
                    <dd className="text-sm font-medium">{formData.name || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-foreground/70">Category:</dt>
                    <dd className="text-sm font-medium">
                      {formData.category 
                        ? categories.find(c => c.id === formData.category)?.name || "Unknown"
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-foreground/70">Price:</dt>
                    <dd className="text-sm font-medium">{formData.price ? `NPR ${formData.price}` : "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-foreground/70">Inventory:</dt>
                    <dd className="text-sm font-medium">{formData.inventory || "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={isFirstStep}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isFirstStep
                ? "cursor-not-allowed text-foreground/40"
                : "text-foreground hover:bg-white/5"
            )}
          >
            Previous
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-foreground hover:bg-white/5"
            >
              Cancel
            </button>
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Creating...' : 'Create Product'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
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
