"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Circle, ArrowRight, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * VENDOR ONBOARDING WIZARD
 * Version: 1.0 (Growth Engine - Phase 3)
 * 
 * Purpose: Guide new vendors through required onboarding steps
 * Triggers: Shows on first login after approval (onboarding_complete = false)
 * Steps: Profile → Payout → First Product
 * 
 * Features:
 * - Real-time progress tracking
 * - Dismissible (saves preference)
 * - Gamified progress bar
 * - Mobile responsive
 */

interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
}

interface OnboardingStatus {
  complete: boolean;
  profile_complete: boolean;
  payout_complete: boolean;
  product_complete: boolean;
  current_step?: number;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      key: 'profile',
      title: 'Complete Your Profile',
      description: 'Add business details and contact information',
      completed: false,
      href: '/vendor/settings'
    },
    {
      key: 'payout',
      title: 'Setup Payout Details',
      description: 'Configure how you\'ll receive payments',
      completed: false,
      href: '/vendor/settings'
    },
    {
      key: 'product',
      title: 'List Your First Product',
      description: 'Add your first product to start selling',
      completed: false,
      href: '/vendor/products'
    }
  ]);
  
  const [currentStep, setCurrentStep] = useState(0);
  
  // Fetch onboarding status
  const fetchStatus = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setShowWizard(false);
        setLoading(false);
        return;
      }
      
      // Query vendor_profiles for onboarding status
      const { data, error } = await supabase
        .from('vendor_profiles')
        .select('onboarding_complete, business_name, user_id')
        .eq('user_id', user.id)
        .single();
      
      if (error || !data) {
        console.error('Error fetching onboarding status:', error);
        setShowWizard(false);
        setLoading(false);
        return;
      }
      
      // If onboarding is complete, don't show wizard
      if (data.onboarding_complete) {
        setShowWizard(false);
        setLoading(false);
        return;
      }
      
      // Check if user dismissed wizard (but allow re-showing after navigation)
      const dismissed = sessionStorage.getItem('onboarding_wizard_dismissed');
      if (dismissed === 'true') {
        setShowWizard(false);
        setLoading(false);
        return;
      }
      
      // Determine step completion
      const profileComplete = !!(data.business_name && data.business_name.length > 0);
      
      // Check payout methods via secure RPC
      let payoutComplete = false;
      try {
        const { data: paymentData } = await supabase.rpc('get_vendor_payment_methods');
        if (paymentData?.success && paymentData?.data) {
          payoutComplete = !!(
            paymentData.data.bank_account_number ||
            paymentData.data.esewa_number ||
            paymentData.data.khalti_number
          );
        }
      } catch (err) {
        console.error('Error checking payment methods:', err);
      }
      
      // Check if vendor has products
      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', user.id);
      
      const productComplete = (productCount || 0) > 0;
      
      // Update steps
      const updatedSteps = [
        { ...steps[0], completed: profileComplete },
        { ...steps[1], completed: payoutComplete },
        { ...steps[2], completed: productComplete },
      ];
      
      setSteps(updatedSteps);
      
      // Find first incomplete step
      const firstIncomplete = updatedSteps.findIndex(step => !step.completed);
      setCurrentStep(firstIncomplete === -1 ? updatedSteps.length : firstIncomplete);
      
      // Show wizard if there are incomplete steps
      // OR if all steps are complete but user hasn't clicked "Complete Setup" yet
      const allStepsComplete = profileComplete && payoutComplete && productComplete;
      
      if (allStepsComplete) {
        // All steps done - show completion screen with "Complete Setup" button
        console.log('[OnboardingWizard] All steps complete! Showing completion screen...');
        setShowWizard(true);
      } else {
        // Some steps incomplete - show progress
        setShowWizard(true);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error in fetchStatus:', error);
      setShowWizard(false);
      setLoading(false);
    }
  }, [steps]);
  
  useEffect(() => {
    fetchStatus();
    
    // Re-check status when page becomes visible (user returns from settings)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[OnboardingWizard] Page visible, refreshing status...');
        fetchStatus();
      }
    };
    
    // Re-check when window gains focus (user returns from another tab)
    const handleFocus = () => {
      console.log('[OnboardingWizard] Window focused, refreshing status...');
      fetchStatus();
    };
    
    // Re-check every 5 seconds while wizard is visible
    const interval = setInterval(() => {
      console.log('[OnboardingWizard] Auto-refresh status...');
      fetchStatus();
    }, 5000);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchStatus]);
  
  const handleDismiss = useCallback(() => {
    // Use sessionStorage instead of localStorage so wizard can reappear in new browser sessions
    sessionStorage.setItem('onboarding_wizard_dismissed', 'true');
    setShowWizard(false);
  }, []);
  
  const handleStepClick = useCallback((href: string) => {
    router.push(href);
  }, [router]);
  
  if (loading || !showWizard) {
    return null;
  }
  
  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--kb-card-bg)] border border-white/10 rounded-2xl p-6 sm:p-8 max-w-2xl w-full mx-4 shadow-2xl ring-1 ring-white/10 max-h-[90vh] overflow-y-auto">
        {/* Header with close button */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Welcome to KB Stylish! 🎉
            </h2>
            <p className="text-sm sm:text-base text-foreground/60">
              Let's get your vendor account set up in 3 quick steps
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 hover:bg-white/10 rounded-lg transition"
            aria-label="Dismiss wizard"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-foreground/60 mb-2">
            <span>{completedCount} of {steps.length} completed</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[var(--kb-accent-gold)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Steps */}
        <div className="space-y-4 mb-8">
          {steps.map((step, index) => (
            <div
              key={step.key}
              className={`
                flex items-start gap-4 p-4 rounded-lg border transition-all cursor-pointer
                ${index === currentStep && !step.completed
                  ? 'border-[var(--kb-primary-brand)]/50 bg-[var(--kb-primary-brand)]/10 ring-1 ring-[var(--kb-primary-brand)]/50' 
                  : step.completed 
                    ? 'border-emerald-500/20 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5'
                }
                ${!step.completed && 'hover:bg-white/10'}
              `}
              onClick={() => !step.completed && handleStepClick(step.href)}
            >
              <div className="mt-1 flex-shrink-0">
                {step.completed ? (
                  <CheckCircle className="h-6 w-6 text-emerald-400" />
                ) : (
                  <Circle className="h-6 w-6 text-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold mb-1">{step.title}</h3>
                <p className="text-sm text-foreground/60">{step.description}</p>
              </div>
              {index === currentStep && !step.completed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStepClick(step.href);
                  }}
                  className="px-4 py-2 bg-[var(--kb-primary-brand)] text-white rounded-lg hover:bg-[var(--kb-primary-brand)]/90 transition flex items-center gap-2 flex-shrink-0"
                >
                  <span className="hidden sm:inline">Start</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
          <button
            onClick={handleDismiss}
            className="text-sm text-foreground/60 hover:text-foreground transition"
          >
            I'll do this later
          </button>
          {completedCount === steps.length && (
            <button
              onClick={async () => {
                // Mark onboarding complete
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  await supabase
                    .from('vendor_profiles')
                    .update({ 
                      onboarding_complete: true,
                      onboarding_completed_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id);
                }
                setShowWizard(false);
              }}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-emerald-500/50 transition font-medium"
            >
              Complete Setup 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
