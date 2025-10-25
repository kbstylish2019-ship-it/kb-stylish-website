'use client';

import React, { useState } from 'react';
import { X, Star } from 'lucide-react';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: {
    id: string;
    stylistName: string;
    serviceName: string;
    date: string;
  };
  onSuccess: () => void;
}

export default function RatingModal({ isOpen, onClose, booking, onSuccess }: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/stylists/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.id,
          rating,
          review_text: reviewText || null
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit rating');
      }

      // Success!
      onSuccess();
      onClose();
      
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingLabel = (r: number) => {
    switch (r) {
      case 5: return '⭐ Excellent!';
      case 4: return '😊 Great!';
      case 3: return '👍 Good';
      case 2: return '😐 Fair';
      case 1: return '😞 Poor';
      default: return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Rate Your Experience</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Booking Info */}
        <div className="mb-6 rounded-lg bg-white/5 p-4">
          <p className="font-medium">{booking.serviceName}</p>
          <p className="text-sm text-foreground/70">with {booking.stylistName}</p>
          <p className="text-xs text-foreground/50">{booking.date}</p>
        </div>

        {/* Star Rating */}
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium">How would you rate your service?</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)] rounded-full"
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={`h-10 w-10 transition-colors ${
                    star <= (hoverRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-white/30'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="mt-2 text-center text-sm text-foreground/70">
              {getRatingLabel(rating)}
            </p>
          )}
        </div>

        {/* Review Text */}
        <div className="mb-6">
          <label htmlFor="review" className="mb-2 block text-sm font-medium">
            Tell us more (optional)
          </label>
          <textarea
            id="review"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your experience..."
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm placeholder:text-foreground/40 focus:border-[var(--kb-primary-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/20"
          />
          <p className="mt-1 text-right text-xs text-foreground/50">
            {reviewText.length}/1000 characters
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="flex-1 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      </div>
    </div>
  );
}
