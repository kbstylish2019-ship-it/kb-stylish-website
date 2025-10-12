'use client';

import { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { reviewAPI } from '@/lib/api/reviewClient';

interface VendorReplyFormProps {
  reviewId: string;
  canReply: boolean;
  onSuccess: (reply: any) => void;
  onCancel?: () => void;
}

export default function VendorReplyForm({
  reviewId,
  canReply,
  onSuccess,
  onCancel
}: VendorReplyFormProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Don't render if vendor can't reply
  if (!canReply) {
    return null;
  }
  
  // Reset form state
  const resetForm = () => {
    setComment('');
    setError(undefined);
    setIsExpanded(false);
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    if (!comment.trim()) {
      setError('Please write a reply');
      return;
    }
    
    if (comment.trim().length < 10) {
      setError('Reply must be at least 10 characters');
      return;
    }
    
    if (comment.length > 2000) {
      setError('Reply must be less than 2000 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError(undefined);
    
    try {
      console.log('[VendorReplyForm] Submitting reply to review:', reviewId);
      
      const response = await reviewAPI.submitVendorReply(reviewId, comment.trim());
      
      if (response.success && response.reply) {
        // Create optimistic reply object for immediate UI update
        const optimisticReply = {
          id: response.reply.id,
          comment: response.reply.comment,
          created_at: response.reply.created_at,
          is_edited: false
        };
        
        // Notify parent component
        onSuccess(optimisticReply);
        
        // Show success message (Phase 5: Replace with toast)
        alert('✅ Your reply has been posted!');
        
        // Reset form
        resetForm();
      } else {
        // Handle specific error codes
        if (response.error_code === 'VENDOR_ONLY') {
          setError('Only vendors can reply to reviews');
        } else if (response.error_code === 'NOT_PRODUCT_VENDOR') {
          setError('You can only reply to reviews of your own products');
        } else if (response.error_code === 'REPLY_EXISTS') {
          setError('You have already replied to this review');
        } else if (response.error_code === 'REVIEW_NOT_FOUND') {
          setError('Review not found');
        } else {
          setError(response.error || 'Failed to submit reply. Please try again.');
        }
      }
    } catch (err) {
      console.error('[VendorReplyForm] Submission error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Collapsed state - show button to expand form
  if (!isExpanded) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--kb-primary-brand)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity font-medium"
        >
          <MessageCircle className="h-4 w-4" />
          Reply to Customer
        </button>
      </div>
    );
  }
  
  // Expanded state - show full form
  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground/90">
            Your Reply
          </label>
          <button
            type="button"
            onClick={() => {
              resetForm();
              if (onCancel) onCancel();
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4 text-foreground/60" />
          </button>
        </div>
        
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={isSubmitting}
          className="w-full px-3 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-[var(--kb-primary-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50 resize-none text-sm"
          placeholder="Thank you for your feedback! We appreciate..."
        />
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-foreground/60">
            {comment.length}/2000 characters
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                if (onCancel) onCancel();
              }}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm border border-white/20 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || comment.trim().length < 10}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--kb-primary-brand)] text-white text-sm rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitting ? 'Posting...' : 'Post Reply'}
            </button>
          </div>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="p-2 bg-red-900/20 rounded-lg border border-red-600/30">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
        
        {/* Vendor Badge */}
        <div className="flex items-center gap-2 text-xs text-foreground/60">
          <span className="px-2 py-0.5 bg-[var(--kb-primary-brand)]/20 text-[var(--kb-primary-brand)] rounded-full">
            Vendor Response
          </span>
          <span>• Your reply will be visible to all customers</span>
        </div>
      </form>
    </div>
  );
}
