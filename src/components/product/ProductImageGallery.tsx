"use client";
import React from "react";
import Image from "next/image";
import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ProductImageGallery({ images }: { images: Media[] }) {
  const [index, setIndex] = React.useState(0);

  const current = images[index] ?? images[0];

  // Fallback for remote images that may fail to load in some environments
  const handleImgError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const target = e.currentTarget;
      // Prevent infinite loop if fallback also fails
      if (target.src.includes("/next.svg")) return;
      target.src = "/next.svg"; // local asset in public/
      target.alt = "Image unavailable";
    },
    []
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, images.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black/20">
        {current && (
          <Image
            src={current.url}
            alt={current.alt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            onError={handleImgError}
          />
        )}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`View image ${i + 1}`}
            className={cn(
              "aspect-square overflow-hidden rounded-lg border bg-black/10",
              i === index ? "ring-2 ring-[var(--kb-accent-gold)]" : "border-white/10"
            )}
          >
            <div className="relative h-full w-full">
              <Image 
                src={img.url} 
                alt={img.alt} 
                fill
                className="object-cover" 
                sizes="20vw"
                onError={handleImgError}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
