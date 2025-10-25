'use client';

import React, { useState } from 'react';
import { Star, ThumbsUp, ThumbsDown, MessageSquare, TrendingUp, Award } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Rating {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  is_approved: boolean;
  moderation_status: string;
  helpful_votes: number;
  unhelpful_votes: number;
  stylist_response: string | null;
  responded_at: string | null;
  bookings: {
    id: string;
    customer_name: string;
    customer_user_id: string;
    start_time: string;
    services: {
      name: string;
    } | null;
    customer_profiles: {
      display_name: string;
    } | null;
  } | null;
}

interface Stats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

interface Props {
  ratings: Rating[];
  stats: Stats;
}

export default function StylistReviewsClient({ ratings, stats }: Props) {
  const [filter, setFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');

  const filteredRatings = filter === 'all' 
    ? ratings 
    : ratings.filter(r => r.rating === parseInt(filter));

  const getRatingLabel = (rating: number) => {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 4.0) return 'Very Good';
    if (rating >= 3.5) return 'Good';
    if (rating >= 3.0) return 'Average';
    return 'Needs Improvement';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reviews & Ratings</h1>
        <p className="text-muted-foreground mt-1">
          See what your customers are saying about your services
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Average Rating */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Average Rating</p>
              <div className="mt-2 flex items-baseline gap-2">
                <h2 className="text-4xl font-bold">{stats.averageRating.toFixed(1)}</h2>
                <span className="text-lg text-muted-foreground">/ 5.0</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= Math.round(stats.averageRating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">
                  {getRatingLabel(stats.averageRating)}
                </span>
              </div>
            </div>
            <Award className="h-12 w-12 text-[var(--kb-accent-gold)]" />
          </div>
        </div>

        {/* Total Reviews */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Reviews</p>
              <h2 className="mt-2 text-4xl font-bold">{stats.totalReviews}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                From completed bookings
              </p>
            </div>
            <MessageSquare className="h-12 w-12 text-blue-500" />
          </div>
        </div>

        {/* Positive Reviews */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Positive Reviews</p>
              <h2 className="mt-2 text-4xl font-bold">
                {stats.ratingDistribution[5] + stats.ratingDistribution[4]}
              </h2>
              <p className="mt-2 text-sm text-green-600">
                {stats.totalReviews > 0
                  ? `${Math.round(((stats.ratingDistribution[5] + stats.ratingDistribution[4]) / stats.totalReviews) * 100)}% positive`
                  : '0% positive'}
              </p>
            </div>
            <TrendingUp className="h-12 w-12 text-green-500" />
          </div>
        </div>
      </div>

      {/* Rating Distribution */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Rating Distribution</h3>
        <div className="space-y-3">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.ratingDistribution[star as keyof typeof stats.ratingDistribution];
            const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
            
            return (
              <div key={star} className="flex items-center gap-3">
                <button
                  onClick={() => setFilter(star.toString() as any)}
                  className={`flex items-center gap-1 min-w-[60px] ${
                    filter === star.toString() ? 'text-[var(--kb-accent-gold)]' : ''
                  }`}
                >
                  <span className="text-sm font-medium">{star}</span>
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                </button>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--kb-accent-gold)] transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground min-w-[80px] text-right">
                  {count} ({percentage.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80'
          }`}
        >
          All Reviews ({ratings.length})
        </button>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = stats.ratingDistribution[star as keyof typeof stats.ratingDistribution];
          if (count === 0) return null;
          
          return (
            <button
              key={star}
              onClick={() => setFilter(star.toString() as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === star.toString()
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {star} ⭐ ({count})
            </button>
          );
        })}
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredRatings.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Reviews Yet</h3>
            <p className="text-muted-foreground">
              {filter === 'all'
                ? 'You haven\'t received any reviews yet. Keep providing great service!'
                : `No ${filter}-star reviews found.`}
            </p>
          </div>
        ) : (
          filteredRatings.map((rating) => (
            <div key={rating.id} className="rounded-lg border bg-card p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= rating.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold">{rating.rating}.0</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {rating.bookings?.customer_profiles?.display_name || rating.bookings?.customer_name || 'Anonymous'}
                    </span>
                    {' • '}
                    {rating.bookings?.services?.name || 'Service'}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {format(parseISO(rating.created_at), 'MMM d, yyyy')}
                </span>
              </div>

              {/* Review Text */}
              {rating.review_text && (
                <div className="mb-4">
                  <p className="text-foreground">{rating.review_text}</p>
                </div>
              )}

              {/* Helpful Votes */}
              {(rating.helpful_votes > 0 || rating.unhelpful_votes > 0) && (
                <div className="flex items-center gap-4 pt-3 border-t">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <ThumbsUp className="h-4 w-4" />
                    <span>{rating.helpful_votes}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <ThumbsDown className="h-4 w-4" />
                    <span>{rating.unhelpful_votes}</span>
                  </div>
                </div>
              )}

              {/* Stylist Response */}
              {rating.stylist_response && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Your Response</p>
                  <p className="text-sm text-muted-foreground">{rating.stylist_response}</p>
                  {rating.responded_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Responded on {format(parseISO(rating.responded_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
