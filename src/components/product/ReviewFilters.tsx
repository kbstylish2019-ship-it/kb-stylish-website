'use client';

import { Star, CheckCircle, MessageSquare, TrendingUp, Clock } from 'lucide-react';

interface ReviewFiltersProps {
  filters: {
    rating: number[];
    verified: boolean;
    hasReply: boolean;
    sortBy: 'recent' | 'helpful';
  };
  onFilterChange: (filters: any) => void;
  stats?: {
    average: number;
    total: number;
    distribution: Record<string, number>;
  };
}

export default function ReviewFilters({ 
  filters, 
  onFilterChange, 
  stats 
}: ReviewFiltersProps) {
  
  // Handle rating filter change
  const handleRatingToggle = (rating: number) => {
    const currentRatings = filters.rating || [];
    let newRatings: number[];
    
    if (currentRatings.includes(rating)) {
      // Remove rating from filter
      newRatings = currentRatings.filter(r => r !== rating);
    } else {
      // Add rating to filter
      newRatings = [...currentRatings, rating];
    }
    
    onFilterChange({
      ...filters,
      rating: newRatings.length > 0 ? newRatings : undefined
    });
  };
  
  // Handle other filter changes
  const handleToggleFilter = (filterName: string, value: boolean) => {
    onFilterChange({
      ...filters,
      [filterName]: value || undefined
    });
  };
  
  // Handle sort change
  const handleSortChange = (sortBy: 'recent' | 'helpful') => {
    onFilterChange({
      ...filters,
      sortBy
    });
  };
  
  // Calculate rating distribution percentages
  const getRatingPercentage = (rating: number): number => {
    if (!stats?.distribution || !stats?.total) return 0;
    const count = stats.distribution[rating.toString()] || 0;
    return Math.round((count / stats.total) * 100);
  };
  
  return (
    <div className="mb-6 space-y-4">
      {/* Header with average rating */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold">
            {stats?.average ? stats.average.toFixed(1) : '0.0'}
          </div>
          <div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-5 w-5 ${
                    star <= Math.round(stats?.average || 0)
                      ? 'fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]'
                      : 'text-gray-400'
                  }`}
                />
              ))}
            </div>
            <div className="text-sm text-foreground/60 mt-1">
              Based on {stats?.total || 0} reviews
            </div>
          </div>
        </div>
        
        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground/60">Sort by:</span>
          <div className="flex gap-1">
            <button
              onClick={() => handleSortChange('recent')}
              className={`rounded-lg transition-colors px-2 py-1 text-xs sm:px-3 sm:py-1 sm:text-sm ${
                filters.sortBy === 'recent'
                  ? 'bg-[var(--kb-primary-brand)] text-white'
                  : 'bg-white/10 text-foreground/70 hover:bg-white/20'
              }`}
            >
              <Clock className="h-3.5 w-3.5 inline mr-1" />
              Most Recent
            </button>
            <button
              onClick={() => handleSortChange('helpful')}
              className={`rounded-lg transition-colors px-2 py-1 text-xs sm:px-3 sm:py-1 sm:text-sm ${
                filters.sortBy === 'helpful'
                  ? 'bg-[var(--kb-primary-brand)] text-white'
                  : 'bg-white/10 text-foreground/70 hover:bg-white/20'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
              Most Helpful
            </button>
          </div>
        </div>
      </div>
      
      {/* Rating distribution and filters */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((rating) => (
            <button
              key={rating}
              onClick={() => handleRatingToggle(rating)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                filters.rating?.includes(rating)
                  ? 'bg-[var(--kb-primary-brand)]/20 border border-[var(--kb-primary-brand)]'
                  : 'hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-1 min-w-[80px]">
                <span className="text-sm">{rating}</span>
                <Star className="h-3.5 w-3.5 fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]" />
              </div>
              
              {/* Progress bar */}
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--kb-accent-gold)] transition-all"
                  style={{ width: `${getRatingPercentage(rating)}%` }}
                />
              </div>
              
              <div className="text-xs text-foreground/60 min-w-[40px] text-right">
                {getRatingPercentage(rating)}%
              </div>
            </button>
          ))}
        </div>
        
        {/* Additional filters */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
          <button
            onClick={() => handleToggleFilter('verified', !filters.verified)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
              filters.verified
                ? 'bg-green-600/20 text-green-500 border border-green-600'
                : 'bg-white/10 text-foreground/70 hover:bg-white/20'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Verified Purchase
          </button>
          
          <button
            onClick={() => handleToggleFilter('hasReply', !filters.hasReply)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
              filters.hasReply
                ? 'bg-[var(--kb-primary-brand)]/20 text-[var(--kb-primary-brand)] border border-[var(--kb-primary-brand)]'
                : 'bg-white/10 text-foreground/70 hover:bg-white/20'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            With Vendor Reply
          </button>
          
          {/* Clear filters */}
          {(filters.rating?.length > 0 || filters.verified || filters.hasReply) && (
            <button
              onClick={() => onFilterChange({ sortBy: filters.sortBy || 'recent' })}
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-500 hover:bg-red-600/30 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
