import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { X, Package, DollarSign, ImageIcon, Check } from "lucide-react";

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "basic" | "pricing" | "media" | "review";

const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic Info", icon: <Package className="h-4 w-4" /> },
  { id: "pricing", label: "Pricing", icon: <DollarSign className="h-4 w-4" /> },
  { id: "media", label: "Media", icon: <ImageIcon className="h-4 w-4" /> },
  { id: "review", label: "Review", icon: <Check className="h-4 w-4" /> },
];

export default function AddProductModal({ open, onClose }: AddProductModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>("basic");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    comparePrice: "",
    inventory: "",
  });

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (!isLastStep) {
      const nextStep = steps[currentStepIndex + 1];
      setCurrentStep(nextStep.id);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      const prevStep = steps[currentStepIndex - 1];
      setCurrentStep(prevStep.id);
    }
  };

  const handleSubmit = () => {
    // TODO: Handle form submission
    console.log("Form submitted:", formData);
    onClose();
    // Reset form
    setCurrentStep("basic");
    setFormData({
      name: "",
      description: "",
      category: "",
      price: "",
      comparePrice: "",
      inventory: "",
    });
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-background p-6 shadow-xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Product/Service</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

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
                <select
                  value={formData.category}
                  onChange={(e) => updateField("category", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                >
                  <option value="">Select category</option>
                  <option value="ethnic">Ethnic</option>
                  <option value="streetwear">Streetwear</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
            </div>
          )}

          {currentStep === "pricing" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Price (NPR) *</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  placeholder="2999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Compare at Price (NPR)</label>
                <input
                  type="number"
                  value={formData.comparePrice}
                  onChange={(e) => updateField("comparePrice", e.target.value)}
                  placeholder="3999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Inventory *</label>
                <input
                  type="number"
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
                    <dd className="text-sm font-medium">{formData.category || "—"}</dd>
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
                className="rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
              >
                Create Product
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
  );
}
