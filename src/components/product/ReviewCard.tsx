'use client';

import { useState } from 'react';
import { Star, ThumbsUp, ThumbsDown, Store } from 'lucide-react';
import VendorReplyForm from './VendorReplyForm';

interface ReviewWithMeta {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  title?: string;
  comment?: string;
  helpful_votes: number;
  unhelpful_votes: number;
  is_verified: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  user: {
    display_name: string;
    avatar_url?: string;
  };
  vendor_reply?: {
    id: string;
    comment: string;
    created_at: string;
  };
  user_vote?: 'helpful' | 'unhelpful' | null;
  _isPending?: boolean;
}

interface ReviewCardProps {
  review: ReviewWithMeta;
  onVote: (reviewId: string, voteType: 'helpful' | 'unhelpful') => Promise<void>;
  isAuthenticated?: boolean;
  isVendor?: boolean;
  isProductVendor?: boolean;
}

export default function ReviewCard({ 
  review, 
  onVote,
  isAuthenticated = false,
  isVendor = false,
  isProductVendor = false
}: ReviewCardProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [localUserVote, setLocalUserVote] = useState<'helpful' | 'unhelpful' | null>(review.user_vote || null);
  const [localHelpfulVotes, setLocalHelpfulVotes] = useState(review.helpful_votes);
  const [localUnhelpfulVotes, setLocalUnhelpfulVotes] = useState(review.unhelpful_votes);
  const [localVendorReply, setLocalVendorReply] = useState(review.vendor_reply);
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  // Handle vote click
  const handleVoteClick = async (voteType: 'helpful' | 'unhelpful') => {
    if (!isAuthenticated) {
      alert('Please sign in to vote on reviews');
      return;
    }
    
    if (isVoting) return;
    
    setIsVoting(true);
    
    // Store previous state for rollback
    const previousVote = localUserVote;
    const previousHelpful = localHelpfulVotes;
    const previousUnhelpful = localUnhelpfulVotes;
    
    // Calculate optimistic update
    let newHelpful = localHelpfulVotes;
    let newUnhelpful = localUnhelpfulVotes;
    let newVote: 'helpful' | 'unhelpful' | null = voteType;
    
    // If clicking the same vote, remove it
    if (localUserVote === voteType) {
      newVote = null;
      if (voteType === 'helpful') {
        newHelpful = Math.max(0, newHelpful - 1);
      } else {
        newUnhelpful = Math.max(0, newUnhelpful - 1);
      }
    }
    // If changing from one vote to another
    else if (localUserVote && localUserVote !== voteType) {
      if (localUserVote === 'helpful') {
        newHelpful = Math.max(0, newHelpful - 1);
        newUnhelpful = newUnhelpful + 1;
      } else {
        newUnhelpful = Math.max(0, newUnhelpful - 1);
        newHelpful = newHelpful + 1;
      }
    }
    // If no previous vote
    else {
      if (voteType === 'helpful') {
        newHelpful = newHelpful + 1;
      } else {
        newUnhelpful = newUnhelpful + 1;
      }
    }
    
    // Apply optimistic update
    setLocalUserVote(newVote);
    setLocalHelpfulVotes(newHelpful);
    setLocalUnhelpfulVotes(newUnhelpful);
    
    try {
      // Call parent's vote handler
      await onVote(review.id, voteType);
      console.log(`[ReviewCard] Vote successful: ${voteType} on review ${review.id}`);
    } catch (error) {
      console.error('[ReviewCard] Vote failed, rolling back:', error);
      // Rollback on error
      setLocalUserVote(previousVote);
      setLocalHelpfulVotes(previousHelpful);
      setLocalUnhelpfulVotes(previousUnhelpful);
      alert('Failed to record your vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };
  
  // Handle vendor reply success
  const handleReplySuccess = (reply: any) => {
    setLocalVendorReply({
      id: reply.id,
      comment: reply.comment,
      created_at: reply.created_at
    });
    console.log(`[ReviewCard] Vendor reply added to review ${review.id}`);
  };
  
  // Check if vendor can reply (is product vendor and no existing reply)
  const canReply = isProductVendor && !localVendorReply;
  
  return (
    <article className="rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:bg-white/[0.07]">
      {/* Header: Author and Rating */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="font-medium text-sm">
            {review.user?.display_name || 'Anonymous'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {review.is_verified && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span>✓</span>
                <span>Verified Purchase</span>
              </span>
            )}
            {review._isPending && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <span>⏳</span>
                <span>Pending Moderation</span>
              </span>
            )}
            {review.is_edited && (
              <span className="text-xs text-foreground/50">(edited)</span>
            )}
          </div>
        </div>
        <div className="inline-flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${
                i < review.rating
                  ? 'fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]'
                  : 'text-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
      
      {/* Review Title */}
      {review.title && (
        <h4 className="text-sm font-semibold mb-1">{review.title}</h4>
      )}
      
      {/* Review Comment */}
      {review.comment && (
        <p className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap">
          {review.comment}
        </p>
      )}
      
      {/* Vendor Reply */}
      {localVendorReply && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-foreground/60 mb-1">
            <Store className="h-3.5 w-3.5" />
            <span className="font-medium">Vendor Response</span>
            <span>• {formatDate(localVendorReply.created_at)}</span>
          </div>
          <p className="text-sm text-foreground/80 pl-5">
            {localVendorReply.comment}
          </p>
        </div>
      )}
      
      {/* Vendor Reply Form - Only show if vendor can reply */}
      <VendorReplyForm
        reviewId={review.id}
        canReply={canReply}
        onSuccess={handleReplySuccess}
      />
      
      {/* Footer: Date and Voting */}
      <div className="mt-4 flex items-center justify-between">
        <time className="text-xs text-foreground/60">
          {formatDate(review.created_at)}
        </time>
        
        {/* Voting Interface */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground/60">Was this helpful?</span>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleVoteClick('helpful')}
              disabled={isVoting}
              className={`
                p-1.5 rounded-lg transition-all
                ${localUserVote === 'helpful' 
                  ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30' 
                  : 'text-foreground/60 hover:text-foreground hover:bg-white/10'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              aria-label={`Mark as helpful (${localHelpfulVotes} people found this helpful)`}
              title={`${localHelpfulVotes} found this helpful`}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            
            {localHelpfulVotes > 0 && (
              <span className="text-xs text-foreground/60 min-w-[20px] text-center">
                {localHelpfulVotes}
              </span>
            )}
            
            <button
              onClick={() => handleVoteClick('unhelpful')}
              disabled={isVoting}
              className={`
                p-1.5 rounded-lg transition-all ml-1
                ${localUserVote === 'unhelpful' 
                  ? 'bg-red-600/20 text-red-500 hover:bg-red-600/30' 
                  : 'text-foreground/60 hover:text-foreground hover:bg-white/10'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              aria-label={`Mark as not helpful (${localUnhelpfulVotes} people found this not helpful)`}
              title={`${localUnhelpfulVotes} found this not helpful`}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            
            {localUnhelpfulVotes > 0 && (
              <span className="text-xs text-foreground/60 min-w-[20px] text-center">
                {localUnhelpfulVotes}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
