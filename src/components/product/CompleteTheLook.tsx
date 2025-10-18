'use client';

import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { ProductRecommendation } from "@/lib/apiClient";
import { formatNPR } from "@/lib/utils";
import { trackCurationEvent } from "@/lib/curationClient";

interface CompleteTheLookProps {
  recommendations: ProductRecommendation[];
  sourceProductId: string;
}

export default function CompleteTheLook({ recommendations, sourceProductId }: CompleteTheLookProps) {
  // Handle recommendation click tracking
  const handleRecommendationClick = (recommendationId: string, targetProductId: string) => {
    // Fire-and-forget tracking (non-blocking)
    trackCurationEvent({
      eventType: 'click',
      curationType: 'product_recommendations',
      sourceId: sourceProductId,
      targetId: targetProductId,
    }).catch(console.warn);
  };
  
  // Don't render if no recommendations
  if (recommendations.length === 0) {
    return null;
  }
  
  return (
    <section aria-labelledby="complete-the-look" className="mt-12">
      <h2 id="complete-the-look" className="mb-4 text-lg font-semibold tracking-tight">
        Complete the Look
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {recommendations.map((rec) => (
          <Link
            key={rec.recommendation_id}
            href={`/product/${rec.product_slug}`}
            onClick={() => handleRecommendationClick(rec.recommendation_id, rec.product_id)}
            className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              {rec.image_url ? (
                <Image 
                  src={rec.image_url} 
                  alt={rec.product_name} 
                  fill
                  className="object-cover transition group-hover:scale-105" 
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/0" />
              )}
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{rec.product_name}</div>
              <div className="text-sm text-foreground/70">{formatNPR(rec.min_price)}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
