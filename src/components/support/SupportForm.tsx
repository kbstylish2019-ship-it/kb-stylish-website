'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupportTicket, type SupportCategory, type CreateTicketRequest } from '@/lib/api/supportClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface SupportFormProps {
  categories: SupportCategory[];
  user?: User | null;  // NEW: Optional user for public access
}

interface FormData {
  category_id: string;
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  order_reference: string;
  customer_email: string;  // NEW: For public submissions
  customer_name: string;   // NEW: For public submissions
}

interface FormErrors {
  category_id?: string;
  subject?: string;
  message?: string;
  customer_email?: string;  // NEW
  customer_name?: string;   // NEW
  general?: string;
}

export default function SupportForm({ categories, user }: SupportFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    category_id: '',
    subject: '',
    message: '',
    priority: 'medium',
    order_reference: '',
    customer_email: user?.email || '',  // Auto-fill if authenticated
    customer_name: user?.user_metadata?.display_name || ''  // Auto-fill if authenticated
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ticketId, setTicketId] = useState<string>('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate email for public users
    if (!user && !formData.customer_email.trim()) {
      newErrors.customer_email = 'Email is required';
    } else if (!user && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(formData.customer_email)) {
      newErrors.customer_email = 'Please enter a valid email address';
    }

    // Validate name for public users
    if (!user && !formData.customer_name.trim()) {
      newErrors.customer_name = 'Name is required';
    } else if (!user && formData.customer_name.trim().length < 2) {
      newErrors.customer_name = 'Name must be at least 2 characters';
    }

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    } else if (formData.subject.trim().length < 5) {
      newErrors.subject = 'Subject must be at least 5 characters';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Get access token if authenticated (optional for public users)
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const ticketData: CreateTicketRequest = {
        category_id: formData.category_id || undefined,
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        priority: formData.priority,
        order_reference: formData.order_reference.trim() || undefined,
        customer_email: formData.customer_email.trim(),  // NEW: Required for public
        customer_name: formData.customer_name.trim()     // NEW: Required for public
      };

      const result = await createSupportTicket(ticketData, session?.access_token);

      if (result.success && result.ticket_id) {
        setIsSuccess(true);
        setTicketId(result.ticket_id);
        
        // Reset form
        setFormData({
          category_id: '',
          subject: '',
          message: '',
          priority: 'medium',
          order_reference: '',
          customer_email: user?.email || '',
          customer_name: user?.user_metadata?.display_name || ''
        });
      } else {
        setErrors({ general: result.error || 'Failed to create support ticket' });
      }
    } catch (error) {
      console.error('Support form error:', error);
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  if (isSuccess) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
          <CheckCircle className="h-8 w-8 text-green-500" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Support Ticket Created!
        </h3>
        <p className="text-foreground/80 mb-4">
          Your ticket has been submitted successfully. We'll respond within 24 hours.
        </p>
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
          <div className="text-sm text-foreground/60">Ticket ID</div>
          <div className="font-mono text-[var(--kb-accent-gold)]">{ticketId}</div>
        </div>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => setIsSuccess(false)}
            variant="outline"
            className="border-white/20 text-foreground hover:bg-white/10"
          >
            Submit Another Ticket
          </Button>
          <Button
            onClick={() => router.push('/support/tickets')}
            className="bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/90"
          >
            View My Tickets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.general && (
        <Alert className="border-red-500/20 bg-red-500/10">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-400">
            {errors.general}
          </AlertDescription>
        </Alert>
      )}

      {/* Public User Notice */}
      {!user && (
        <Alert className="border-blue-500/20 bg-blue-500/10">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-300">
            <strong>No account needed!</strong> Just provide your email and we'll get back to you within 24 hours.
          </AlertDescription>
        </Alert>
      )}

      {/* Email Field (for public users) */}
      {!user && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Your Email *
          </label>
          <Input
            type="email"
            value={formData.customer_email}
            onChange={(e) => handleInputChange('customer_email', e.target.value)}
            placeholder="your.email@example.com"
            required
            className="bg-white/5 border-white/20 text-foreground placeholder:text-foreground/50"
          />
          {errors.customer_email && (
            <p className="text-sm text-red-400">{errors.customer_email}</p>
          )}
        </div>
      )}

      {/* Name Field (for public users) */}
      {!user && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Your Name *
          </label>
          <Input
            type="text"
            value={formData.customer_name}
            onChange={(e) => handleInputChange('customer_name', e.target.value)}
            placeholder="Your full name"
            required
            className="bg-white/5 border-white/20 text-foreground placeholder:text-foreground/50"
          />
          {errors.customer_name && (
            <p className="text-sm text-red-400">{errors.customer_name}</p>
          )}
        </div>
      )}

      {/* Category Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Category <span className="text-foreground/60">(Optional)</span>
        </label>
        <select
          value={formData.category_id}
          onChange={(e) => handleInputChange('category_id', e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Priority Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Priority
        </label>
        <select
          value={formData.priority}
          onChange={(e) => handleInputChange('priority', e.target.value as 'low' | 'medium' | 'high' | 'urgent')}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Subject */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Subject *
        </label>
        <Input
          type="text"
          value={formData.subject}
          onChange={(e) => handleInputChange('subject', e.target.value)}
          placeholder="e.g., Order issue, Product suggestion, General inquiry"
          className="bg-white/5 border-white/20 text-foreground placeholder:text-foreground/50"
          maxLength={200}
        />
        {errors.subject && (
          <p className="text-sm text-red-400">{errors.subject}</p>
        )}
      </div>

      {/* Order Reference */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Order Reference <span className="text-foreground/60">(Optional)</span>
        </label>
        <Input
          type="text"
          value={formData.order_reference}
          onChange={(e) => handleInputChange('order_reference', e.target.value)}
          placeholder="Order ID if this is order-related"
          className="bg-white/5 border-white/20 text-foreground placeholder:text-foreground/50"
        />
      </div>

      {/* Message */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Message *
        </label>
        <Textarea
          value={formData.message}
          onChange={(e) => handleInputChange('message', e.target.value)}
          placeholder="Describe your issue, question, or product suggestion in detail..."
          className="bg-white/5 border-white/20 text-foreground placeholder:text-foreground/50 min-h-[120px]"
          maxLength={5000}
        />
        <div className="flex justify-between items-center">
          {errors.message && (
            <p className="text-sm text-red-400">{errors.message}</p>
          )}
          <p className="text-xs text-foreground/50 ml-auto">
            {formData.message.length}/5000
          </p>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-[var(--kb-primary-brand)] hover:bg-[var(--kb-primary-brand)]/90 text-white"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit Request
          </>
        )}
      </Button>
      
      <p className="text-xs text-center text-foreground/50">
        💡 Tip: For product suggestions, just describe what you'd like to see in our store!
      </p>
    </form>
  );
}
