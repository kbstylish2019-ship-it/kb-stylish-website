'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { reviewAPI } from '@/lib/api/reviewClient';

interface ReviewSubmissionFormProps {
  productId: string;
  orderId?: string;
  onSuccess: (review: any) => void;
  onCancel?: () => void;
}

export default function ReviewSubmissionForm({
  productId,
  orderId,
  onSuccess,
  onCancel
}: ReviewSubmissionFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Reset form state
  const resetForm = () => {
    setRating(0);
    setHoveredRating(0);
    setTitle('');
    setComment('');
    setError(undefined);
    setIsExpanded(false);
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    if (rating === 0) {
      setError('Please select a star rating');
      return;
    }
    
    if (!comment.trim() && !title.trim()) {
      setError('Please write a review or add a title');
      return;
    }
    
    setIsSubmitting(true);
    setError(undefined);
    
    try {
      console.log('[ReviewSubmissionForm] Submitting review:', {
        productId,
        orderId,
        rating,
        title: title.trim(),
        comment: comment.trim()
      });
      
      const response = await reviewAPI.submitReview({
        productId,
        orderId: orderId!, // Will be validated server-side
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined
      });
      
      if (response.success) {
        // Show appropriate success message based on moderation status
        const successMessage = response.review?.status === 'approved' 
          ? '✅ Your review has been published!'
          : '✅ Thank you! Your review will appear after moderation.';
        
        // Alert user (Phase 5: Replace with toast notification)
        alert(successMessage);
        
        // Create optimistic review object for immediate UI update
        const optimisticReview = {
          id: response.review?.id || `temp-${Date.now()}`,
          product_id: productId,
          user_id: 'current-user', // Will be replaced with actual user ID
          order_id: orderId!,
          rating,
          title: title.trim() || undefined,
          comment: comment.trim() || undefined,
          helpful_votes: 0,
          unhelpful_votes: 0,
          is_verified: true,
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user: {
            display_name: 'You', // Will be replaced with actual user name
            avatar_url: undefined
          },
          vendor_reply: undefined,
          user_vote: null,
          _isPending: response.review?.status === 'pending_moderation'
        };
        
        // Notify parent component
        onSuccess(optimisticReview);
        
        // Reset form
        resetForm();
      } else {
        // Handle specific error codes
        if (response.error_code === 'PURCHASE_NOT_VERIFIED') {
          setError('You must purchase this product before writing a review.');
        } else if (response.error_code === 'REVIEW_WINDOW_EXPIRED') {
          setError('Review period has expired (90 days after purchase).');
        } else if (response.error_code === 'DUPLICATE_REVIEW') {
          setError('You have already reviewed this product.');
        } else {
          setError(response.error || 'Failed to submit review. Please try again.');
        }
      }
    } catch (err) {
      console.error('[ReviewSubmissionForm] Submission error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // If no orderId, show call-to-action to purchase
  if (!orderId) {
    return (
      <div className="my-6 rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-foreground/70">
          ✨ Purchase this product to write a review and share your experience!
        </p>
      </div>
    );
  }
  
  // Collapsed state - show button to expand form
  if (!isExpanded) {
    return (
      <div className="my-6">
        <button
          onClick={() => setIsExpanded(true)}
          className="px-5 py-2.5 bg-[var(--kb-primary-brand)] text-white rounded-lg hover:opacity-90 transition-opacity font-medium text-sm"
        >
          ✍️ Write a Review
        </button>
      </div>
    );
  }
  
  // Expanded state - show full form
  return (
    <div className="my-6">
      <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Share Your Experience</h3>
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                onCancel();
              }}
              className="text-sm text-foreground/60 hover:text-foreground/80"
            >
              Cancel
            </button>
          )}
        </div>
        
        {/* Star Rating */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Your Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-1 items-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    star <= (hoveredRating || rating)
                      ? 'fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-foreground/70">
                {rating === 5 && 'Excellent!'}
                {rating === 4 && 'Good'}
                {rating === 3 && 'Average'}
                {rating === 2 && 'Below Average'}
                {rating === 1 && 'Poor'}
              </span>
            )}
          </div>
        </div>
        
        {/* Review Title */}
        <div>
          <label htmlFor="review-title" className="block text-sm font-medium mb-2">
            Review Title (Optional)
          </label>
          <input
            id="review-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={isSubmitting}
            className="w-full px-3 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-[var(--kb-primary-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
            placeholder="Sum up your experience in a few words"
          />
          <div className="mt-1 text-xs text-foreground/60">
            {title.length}/200 characters
          </div>
        </div>
        
        {/* Review Comment */}
        <div>
          <label htmlFor="review-comment" className="block text-sm font-medium mb-2">
            Your Review
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={5000}
            disabled={isSubmitting}
            className="w-full px-3 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-[var(--kb-primary-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50 resize-none"
            placeholder="Share details about your experience with this product..."
          />
          <div className="mt-1 text-xs text-foreground/60">
            {comment.length}/5000 characters
          </div>
        </div>
        
        {/* Verified Purchase Badge */}
        <div className="flex items-center gap-2 p-3 bg-green-900/20 rounded-lg border border-green-600/30">
          <span className="text-green-600">✓</span>
          <span className="text-sm text-green-600">Verified Purchase</span>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-900/20 rounded-lg border border-red-600/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting || rating === 0}
            className="px-5 py-2.5 bg-[var(--kb-primary-brand)] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              if (onCancel) onCancel();
            }}
            disabled={isSubmitting}
            className="px-5 py-2.5 border border-white/20 rounded-lg font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        
        {/* Guidelines */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-foreground/60">
            By submitting this review, you agree to our review guidelines. 
            Reviews are moderated to ensure they meet our community standards.
          </p>
        </div>
      </form>
    </div>
  );
}
