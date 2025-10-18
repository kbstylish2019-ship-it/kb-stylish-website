/**
 * Custom UI Components for KB Stylish
 * Minimal, Tailwind-based alternatives to shadcn/ui
 * No external dependencies beyond React and Tailwind
 */

import React, { ReactNode, ButtonHTMLAttributes, TextareaHTMLAttributes } from 'react';

// ============================================================================
// CARD COMPONENT
// ============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white/5 rounded-lg border border-white/10 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`p-6 pb-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: CardProps) {
  return (
    <h3 className={`text-lg font-semibold text-gray-900 ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div className={`p-6 pt-0 ${className}`}>
      {children}
    </div>
  );
}

// ============================================================================
// BADGE COMPONENT
// ============================================================================

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-blue-100 text-blue-800',
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-300 text-gray-700'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
}

export function Button({ 
  variant = 'default', 
  size = 'md', 
  children, 
  className = '',
  disabled,
  ...props 
}: ButtonProps) {
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-700 hover:bg-gray-100',
    link: 'text-blue-600 hover:underline'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================================
// AVATAR COMPONENT
// ============================================================================

interface AvatarProps {
  children: ReactNode;
  className?: string;
}

export function Avatar({ children, className = '' }: AvatarProps) {
  return (
    <div className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`}>
      {children}
    </div>
  );
}

export function AvatarFallback({ children, className = '' }: AvatarProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-full bg-gray-100 text-gray-600 font-medium text-sm ${className}`}>
      {children}
    </div>
  );
}

// ============================================================================
// PROGRESS COMPONENT
// ============================================================================

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
}

export function Progress({ value, max = 100, className = '' }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full bg-gray-200 rounded-full h-2 overflow-hidden ${className}`}>
      <div
        className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// ============================================================================
// DIALOG (MODAL) COMPONENT
// ============================================================================

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Modal */}
      <div className="relative z-50">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-[#1a1f2e] border border-white/10 rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 ring-1 ring-white/10 ${className}`}>
      {children}
    </div>
  );
}

export function DialogHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className = '' }: CardProps) {
  return (
    <h2 className={`text-lg font-semibold text-foreground ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = '' }: CardProps) {
  return (
    <p className={`text-sm text-foreground/70 mt-1 ${className}`}>
      {children}
    </p>
  );
}

// ============================================================================
// TEXTAREA COMPONENT
// ============================================================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${className}`}
      {...props}
    />
  );
}

// ============================================================================
// LABEL COMPONENT
// ============================================================================

interface LabelProps {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Label({ htmlFor, children, className = '' }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium text-gray-700 mb-1 ${className}`}
    >
      {children}
    </label>
  );
}
