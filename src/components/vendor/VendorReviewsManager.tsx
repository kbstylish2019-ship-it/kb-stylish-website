'use client';

import { useState, useEffect } from 'react';
import { Star, MessageSquare, Clock, CheckCircle, Loader2, Package, XCircle } from 'lucide-react';
import { reviewAPI } from '@/lib/api/reviewClient';

interface VendorReview {
  id: string;
  rating: number;
  title?: string;
  comment?: string;
  created_at: string;
  helpful_votes: number;
  is_approved: boolean;
  moderation_status: string;
  has_vendor_reply: boolean;
  vendor_reply?: {
    id: string;
    comment: string;
    created_at: string;
  };
  product: {
    id: string;
    name: string;
  };
  author: {
    display_name: string;
    avatar_url?: string;
  };
}

export default function VendorReviewsManager() {
  const [allReviews, setAllReviews] = useState<VendorReview[]>([]);
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'pending_reply' | 'replied'>('all');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [moderating, setModerating] = useState<string | null>(null);

  useEffect(() => {
    loadReviews();
  }, []);

  // Apply client-side filtering when filter or allReviews changes
  useEffect(() => {
    if (filter === 'pending') {
      setReviews(allReviews.filter(r => r.moderation_status === 'pending'));
    } else if (filter === 'approved') {
      setReviews(allReviews.filter(r => r.moderation_status === 'approved'));
    } else if (filter === 'rejected') {
      setReviews(allReviews.filter(r => r.moderation_status === 'rejected'));
    } else if (filter === 'pending_reply') {
      setReviews(allReviews.filter(r => !r.has_vendor_reply && r.is_approved));
    } else if (filter === 'replied') {
      setReviews(allReviews.filter(r => r.has_vendor_reply));
    } else {
      setReviews(allReviews);
    }
  }, [filter, allReviews]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      // Always fetch ALL reviews for correct badge counts
      // Add cache buster to force fresh data
      const response = await fetch(`/api/vendor/reviews?status=all&_=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      
      console.log('[VendorReviewsManager] Loaded reviews:', data);
      
      if (data.success) {
        setAllReviews(data.reviews);
        // Filter will be applied in useEffect
      }
    } catch (error) {
      console.error('[VendorReviewsManager] Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReplySubmit = async (reviewId: string) => {
    if (!replyText.trim() || replyText.trim().length < 10) {
      alert('Reply must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      const response = await reviewAPI.submitVendorReply(reviewId, replyText.trim());

      if (response.success) {
        alert('✅ Reply submitted successfully!');
        setReplyingTo(null);
        setReplyText('');
        loadReviews(); // Refresh list
      } else {
        alert(response.error || 'Failed to submit reply');
      }
    } catch (error) {
      console.error('[VendorReviewsManager] Reply error:', error);
      alert('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModerate = async (reviewId: string, action: 'approve' | 'reject') => {
    if (moderating) return;

    const confirmMessage = action === 'approve' 
      ? 'Approve this review? It will be visible to all customers.'
      : 'Reject this review? It will remain hidden from customers.';

    if (!confirm(confirmMessage)) return;

    setModerating(reviewId);

    try {
      const response = await fetch('/api/vendor/reviews/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, action })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Review ${action}d successfully!`);
        loadReviews(); // Refresh list
      } else {
        alert(data.error || `Failed to ${action} review`);
      }
    } catch (error) {
      console.error('[VendorReviewsManager] Moderation error:', error);
      alert('Network error. Please try again.');
    } finally {
      setModerating(null);
    }
  };

  // Calculate badge counts from ALL reviews, not filtered subset
  const pendingModerationCount = allReviews.filter(r => r.moderation_status === 'pending').length;
  const approvedCount = allReviews.filter(r => r.moderation_status === 'approved').length;
  const rejectedCount = allReviews.filter(r => r.moderation_status === 'rejected').length;
  const pendingReplyCount = allReviews.filter(r => !r.has_vendor_reply && r.is_approved).length;
  const repliedCount = allReviews.filter(r => r.has_vendor_reply).length;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Customer Reviews</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Manage reviews on your products
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-[var(--kb-primary-brand)] text-white'
                : 'bg-white/5 text-foreground/70 hover:bg-white/10'
            }`}
          >
            All ({allReviews.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-white/5 text-foreground/70 hover:bg-white/10'
            }`}
          >
            <Clock className="h-4 w-4" />
            Pending ({pendingModerationCount})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'approved'
                ? 'bg-green-600 text-white'
                : 'bg-white/5 text-foreground/70 hover:bg-white/10'
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'rejected'
                ? 'bg-red-600 text-white'
                : 'bg-white/5 text-foreground/70 hover:bg-white/10'
            }`}
          >
            <XCircle className="h-4 w-4" />
            Rejected ({rejectedCount})
          </button>
          <button
            onClick={() => setFilter('pending_reply')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              filter === 'pending_reply'
                ? 'bg-yellow-600 text-white'
                : 'bg-white/5 text-foreground/70 hover:bg-white/10'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Needs Reply ({pendingReplyCount})
          </button>
        </div>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--kb-primary-brand)]" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-lg border border-white/10">
          <Package className="h-12 w-12 mx-auto text-foreground/40 mb-3" />
          <p className="text-foreground/70">
            {filter === 'pending_reply' 
              ? 'No reviews pending reply' 
              : filter === 'replied'
              ? 'No reviews with replies yet'
              : 'No reviews yet. Once customers review your products, they\'ll appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div 
              key={review.id} 
              className="bg-white/5 rounded-lg border border-white/10 p-4 sm:p-6 hover:bg-white/[0.07] transition-colors"
            >
              {/* Product Name */}
              <div className="flex items-center gap-2 text-sm text-foreground/50 mb-3">
                <Package className="h-4 w-4" />
                <span className="truncate">{review.product.name}</span>
              </div>

              {/* Rating & User */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < review.rating
                            ? 'fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]'
                            : 'text-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-semibold">{review.author.display_name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm text-foreground/50">
                    {formatDate(review.created_at)}
                  </span>
                  {review.moderation_status === 'pending' && (
                    <span className="px-2 py-1 bg-orange-600/20 text-orange-500 text-xs rounded-full flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pending Moderation
                    </span>
                  )}
                  {review.moderation_status === 'approved' && (
                    <span className="px-2 py-1 bg-green-600/20 text-green-500 text-xs rounded-full flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Approved
                    </span>
                  )}
                  {review.moderation_status === 'rejected' && (
                    <span className="px-2 py-1 bg-red-600/20 text-red-500 text-xs rounded-full flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Rejected
                    </span>
                  )}
                  {!review.has_vendor_reply && review.is_approved && (
                    <span className="px-2 py-1 bg-yellow-600/20 text-yellow-500 text-xs rounded-full">
                      Needs Reply
                    </span>
                  )}
                  {review.has_vendor_reply && (
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-500 text-xs rounded-full flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Replied
                    </span>
                  )}
                </div>
              </div>

              {/* Review Title */}
              {review.title && (
                <h4 className="font-semibold mb-2">{review.title}</h4>
              )}

              {/* Review Comment */}
              {review.comment && (
                <p className="text-foreground/80 mb-4 whitespace-pre-wrap">
                  {review.comment}
                </p>
              )}

              {/* Helpfulness */}
              <div className="flex items-center gap-4 text-sm text-foreground/60 mb-4">
                <span>{review.helpful_votes} found this helpful</span>
              </div>

              {/* Moderation Actions for Pending Reviews */}
              {review.moderation_status === 'pending' && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={() => handleModerate(review.id, 'approve')}
                    disabled={moderating === review.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {moderating === review.id ? 'Approving...' : 'Approve Review'}
                  </button>
                  <button
                    onClick={() => handleModerate(review.id, 'reject')}
                    disabled={moderating === review.id}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="h-4 w-4" />
                    {moderating === review.id ? 'Rejecting...' : 'Reject Review'}
                  </button>
                </div>
              )}

              {/* Re-Approve Action for Rejected Reviews */}
              {review.moderation_status === 'rejected' && (
                <div className="mt-4 pt-4 border-t border-white/10 bg-red-500/5 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                  <p className="text-sm text-red-400 mb-3">
                    This review was rejected and is not visible to customers.
                  </p>
                  <button
                    onClick={() => handleModerate(review.id, 'approve')}
                    disabled={moderating === review.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {moderating === review.id ? 'Approving...' : 'Re-Approve Review'}
                  </button>
                </div>
              )}

              {/* Existing Vendor Reply */}
              {review.vendor_reply && (
                <div className="mt-4 pt-4 border-t border-white/10 bg-[var(--kb-primary-brand)]/10 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                  <div className="flex items-center gap-2 text-sm text-[var(--kb-primary-brand)] mb-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium">Your Response</span>
                    <span className="text-foreground/50">• {formatDate(review.vendor_reply.created_at)}</span>
                  </div>
                  <p className="text-foreground/80">
                    {review.vendor_reply.comment}
                  </p>
                </div>
              )}

              {/* Reply Form - Only show for approved reviews */}
              {!review.has_vendor_reply && replyingTo !== review.id && review.is_approved && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setReplyingTo(review.id)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-[var(--kb-primary-brand)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Reply to Customer
                  </button>
                </div>
              )}

              {/* Reply Form Expanded */}
              {replyingTo === review.id && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="space-y-3">
                    <label className="block text-sm font-medium">
                      Your Reply
                    </label>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      disabled={submitting}
                      className="w-full px-3 py-2 bg-white/10 rounded-lg border border-white/20 focus:border-[var(--kb-primary-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50 resize-none"
                      placeholder="Thank you for your feedback! We appreciate your review..."
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground/60">
                        {replyText.length}/2000 characters
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText('');
                          }}
                          disabled={submitting}
                          className="px-4 py-2 text-sm border border-white/20 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReplySubmit(review.id)}
                          disabled={submitting || replyText.trim().length < 10}
                          className="flex items-center gap-2 px-4 py-2 bg-[var(--kb-primary-brand)] text-white text-sm rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Posting...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4" />
                              Post Reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
