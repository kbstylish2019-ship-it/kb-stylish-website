"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import LoadingSpinner from "./LoadingSpinner";

interface NavigationLoaderProps {
  children: React.ReactNode;
  className?: string;
  href: string;
  onClick?: () => void;
}

/**
 * NavigationLoader component provides loading state during Next.js navigation
 * Addresses the issue where navigation has a delay before URL change
 * Shows spinner immediately on click until route transition completes
 */
export default function NavigationLoader({ 
  children, 
  className, 
  href, 
  onClick 
}: NavigationLoaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Fire any tracking immediately
    if (onClick) {
      onClick();
    }

    // Show loading state immediately
    setIsNavigating(true);
    
    // Start navigation in transition for better UX
    startTransition(() => {
      router.push(href);
    });

    // Reset loading state after navigation starts
    // Navigation loading will be handled by page-level loading
    setTimeout(() => {
      setIsNavigating(false);
    }, 500);
  };

  // Show loading state during navigation
  if (isNavigating || isPending) {
    return (
      <div className={`${className} relative`}>
        {children}
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] rounded-inherit flex items-center justify-center">
          <LoadingSpinner size="sm" variant="accent" />
        </div>
      </div>
    );
  }

  return (
    <div className={className} onClick={handleClick}>
      {children}
    </div>
  );
}

/**
 * Simple hook for navigation loading state
 * Use this for manual navigation triggering
 */
export function useNavigationLoader() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const navigateTo = (href: string, callback?: () => void) => {
    setIsLoading(true);
    
    if (callback) {
      callback();
    }

    startTransition(() => {
      router.push(href);
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    });
  };

  return {
    navigateTo,
    isLoading: isLoading || isPending
  };
}
