'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

/**
 * WelcomeModal - First-time visitor modal showcasing franchise investment opportunity
 * 
 * Features:
 * - Shows once per session (localStorage)
 * - Smooth fade-in animation
 * - Responsive design (mobile to desktop)
 * - Accessible (keyboard navigation, ARIA labels)
 * - Click outside to close
 * - ESC key to close
 */
export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Feature flag - set to false to disable modal globally
    const MODAL_ENABLED = true; // Change to false to disable
    
    if (!MODAL_ENABLED) return;
    
    // Check if user has seen the modal in this session
    const hasSeenModal = sessionStorage.getItem('kb_welcome_modal_seen');
    
    if (!hasSeenModal) {
      // Small delay for better UX (let page load first)
      const timer = setTimeout(() => {
        setIsOpen(true);
        // Trigger animation after state update
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      }, 800);

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Handle ESC key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    // Wait for fade-out animation before removing from DOM
    setTimeout(() => {
      setIsOpen(false);
      sessionStorage.setItem('kb_welcome_modal_seen', 'true');
    }, 300);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0'
      }`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      {/* Close Button - Outside modal, top-right */}
      <button
        onClick={handleClose}
        className={`absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white hover:bg-gray-100 shadow-xl transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/50 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}
        aria-label="Close welcome modal"
      >
        <X className="h-5 w-5 text-gray-700" />
      </button>

      {/* Modal Container - No padding, image fills completely */}
      <div
        className={`relative bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 max-w-[min(600px,90vw)] w-auto ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Image Container - Full width, no padding */}
        <div className="relative">
          <Image
            src="/kb_graphics.png"
            alt="KB Stylish Franchise Investment Opportunity - Invest once, earn every month"
            width={1200}
            height={900}
            className="w-full h-auto max-h-[80vh] object-contain"
            priority
            quality={95}
          />
        </div>

        {/* Bottom Action Bar - Compact and clean */}
        <div className="bg-gradient-to-r from-[#1976D2] to-[#0d47a1] px-4 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-center sm:text-left">
              <p className="text-white font-medium text-xs sm:text-sm">
                Interested in becoming a franchise partner?
              </p>
              <p className="text-white/90 text-[10px] sm:text-xs">
                Call <a href="tel:9801227448" className="font-semibold hover:text-[#FFD400] transition-colors">980-1227448</a> or visit <a href="https://www.kbstylish.com.np" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-[#FFD400] transition-colors">kbstylish.com.np</a>
              </p>
            </div>
            <button
              onClick={handleClose}
              className="bg-[#FFD400] text-gray-900 font-semibold px-4 py-1.5 rounded-full hover:bg-yellow-300 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:ring-offset-2 text-xs sm:text-sm whitespace-nowrap shadow-md"
            >
              Explore Products
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
