"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "accent" | "white";
  className?: string;
  showText?: boolean;
  text?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6", 
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

const variantClasses = {
  primary: "text-[var(--kb-primary-brand)]",
  accent: "text-[var(--kb-accent-gold)]", 
  white: "text-white",
};

/**
 * Premium LoadingSpinner component with KB Stylish branding
 * Features smooth animations and brand-consistent styling
 * 
 * @param size - Spinner size preset
 * @param variant - Color variant based on brand colors
 * @param showText - Whether to show loading text
 * @param text - Custom loading text
 * @param className - Additional CSS classes
 */
export default function LoadingSpinner({ 
  size = "md", 
  variant = "primary",
  className,
  showText = false,
  text = "Loading..."
}: LoadingSpinnerProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-3">
        {/* Premium spinner with dual rings */}
        <div className="relative">
          {/* Outer ring */}
          <div className={cn(
            "animate-spin rounded-full border-2 border-transparent border-t-current border-r-current opacity-75",
            sizeClasses[size],
            variantClasses[variant]
          )} />
          
          {/* Inner ring - counter rotation for premium effect */}
          <div className={cn(
            "absolute inset-1 animate-spin rounded-full border border-transparent border-b-current border-l-current opacity-50",
            "animate-reverse-spin",
            variantClasses[variant]
          )} 
          style={{
            animationDirection: "reverse",
            animationDuration: "1s"
          }} />
          
          {/* Center dot pulse */}
          <div className={cn(
            "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse",
            size === "sm" ? "w-1 h-1" : size === "md" ? "w-1.5 h-1.5" : size === "lg" ? "w-2 h-2" : "w-3 h-3",
            "bg-current opacity-60",
            variantClasses[variant]
          )} />
        </div>
        
        {/* Loading text */}
        {showText && (
          <div className={cn(
            "text-sm font-medium animate-pulse",
            variantClasses[variant]
          )}>
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Product Detail Loading Skeleton
 * Matches the ProductDetailClient layout structure
 */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-6 bg-white/10 rounded-lg w-64 mb-6" />
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Image gallery skeleton */}
        <div className="space-y-4">
          <div className="aspect-square bg-gradient-to-br from-white/10 to-white/5 rounded-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shimmer" />
            <div className="absolute inset-0 flex items-center justify-center">
              <LoadingSpinner size="lg" variant="accent" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-square bg-white/5 rounded-lg" />
            ))}
          </div>
        </div>
        
        {/* Product info skeleton */}
        <div className="space-y-6">
          {/* Title */}
          <div className="space-y-3">
            <div className="h-8 bg-white/10 rounded-lg w-3/4" />
            <div className="h-4 bg-white/5 rounded w-1/2" />
          </div>
          
          {/* Price */}
          <div className="h-10 bg-white/10 rounded-lg w-32" />
          
          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 bg-white/5 rounded w-full" />
            <div className="h-4 bg-white/5 rounded w-4/5" />
            <div className="h-4 bg-white/5 rounded w-3/5" />
          </div>
          
          {/* Options */}
          <div className="space-y-4">
            <div className="h-6 bg-white/10 rounded w-20" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 w-20 bg-white/5 rounded-lg" />
              ))}
            </div>
          </div>
          
          {/* Actions */}
          <div className="space-y-3">
            <div className="h-12 bg-[var(--kb-primary-brand)]/20 rounded-xl w-full" />
            <div className="h-10 bg-white/5 rounded-lg w-40" />
          </div>
          
          {/* Trust indicators */}
          <div className="flex items-center gap-4 pt-4 border-t border-white/10">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-5 h-5 bg-[var(--kb-accent-gold)]/20 rounded" />
                <div className="h-4 bg-white/5 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Page-level loading component for full-page transitions
 */
export function PageLoader({ message = "Loading page..." }: { message?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6">
        <LoadingSpinner size="xl" variant="primary" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{message}</h2>
          <p className="text-sm text-foreground/60">Please wait while we prepare your content</p>
        </div>
      </div>
    </div>
  );
}
