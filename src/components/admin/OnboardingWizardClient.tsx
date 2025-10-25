'use client';

import React, { useState, useEffect } from 'react';
import { Search, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft, User, Shield, FileCheck, UserCheck, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Step4SpecialtySelection } from './OnboardingWizard_Step4_Specialties';
import AvatarUpload from '@/components/upload/AvatarUpload';

// ============================================================================
// TYPES
// ============================================================================

interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  email?: string;
}

interface CheckStatus {
  background_check: 'pending' | 'in_progress' | 'passed' | 'failed';
  id_verification: 'pending' | 'submitted' | 'verified' | 'rejected';
  training: boolean;
  mfa: boolean;
}

interface ProfileData {
  display_name: string;
  title: string;
  bio: string;
  years_experience: number;
  timezone: string;
}

interface WizardState {
  currentStep: number;
  selectedUser: UserSearchResult | null;
  promotionId: string | null;
  checkStatus: CheckStatus;
  profileData: ProfileData;
  selectedSpecialties: string[];
  selectedServices: string[];
  completed: boolean;
  stylistUserId: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS = [
  { id: 1, name: 'Select User', icon: User },
  { id: 2, name: 'Verification', icon: Shield },
  { id: 3, name: 'Profile Setup', icon: FileCheck },
  { id: 4, name: 'Specialties', icon: Shield },
  { id: 5, name: 'Services', icon: Scissors },
  { id: 6, name: 'Review & Complete', icon: UserCheck },
];

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  selectedUser: null,
  promotionId: null,
  checkStatus: {
    background_check: 'pending',
    id_verification: 'pending',
    training: false,
    mfa: false,
  },
  profileData: {
    display_name: '',
    title: '',
    bio: '',
    years_experience: 0,
    timezone: 'Asia/Kathmandu',
  },
  selectedSpecialties: [],
  selectedServices: [],
  completed: false,
  stylistUserId: null,
};

const STORAGE_KEY = 'stylist_onboarding_wizard_state';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OnboardingWizardClient() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResumedPromotion, setIsResumedPromotion] = useState(false);

  // Load state from localStorage on mount (FAANG Audit Fix #2)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setState(parsed);
      }
    } catch (err) {
      console.error('Failed to load saved state:', err);
    }
  }, []);

  // Save state to localStorage on change (FAANG Audit Fix #2)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }, [state]);

  // ============================================================================
  // API CALLS
  // ============================================================================

  const searchUsers = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to search users');
      }

      setSearchResults(data.users || []);
    } catch (err) {
      console.error('User search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search users');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const initiatePromotion = async (userId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/promotions/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate promotion');
      }

      setState(prev => ({
        ...prev,
        promotionId: data.promotionId,
        currentStep: 2,
      }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate promotion';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCheck = async (checkType: keyof CheckStatus, status: string) => {
    if (!state.promotionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/promotions/update-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotionId: state.promotionId,
          checkType,
          status,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update check');
      }

      // Update local state
      setState(prev => ({
        ...prev,
        checkStatus: {
          ...prev.checkStatus,
          [checkType]: checkType === 'training' || checkType === 'mfa' 
            ? (status === 'completed' || status === 'enabled' || status === 'true')
            : status
        },
      }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update check';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const completePromotion = async () => {
    if (!state.promotionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/promotions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotionId: state.promotionId,
          profileData: state.profileData,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to complete promotion');
      }

      // Save selected services if any
      if (state.selectedServices.length > 0) {
        const servicesResponse = await fetch('/api/admin/stylist-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stylistUserId: data.stylistUserId,
            serviceIds: state.selectedServices,
          }),
        });

        const servicesData = await servicesResponse.json();
        if (!servicesData.success) {
          console.error('Failed to save services:', servicesData.error);
          // Don't fail the whole promotion, just log the error
        }
      }

      setState(prev => ({
        ...prev,
        completed: true,
        stylistUserId: data.stylistUserId,
      }));

      // Clear localStorage on completion
      localStorage.removeItem(STORAGE_KEY);

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete promotion';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const fetchExistingPromotion = async (userId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/promotions/get-by-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch existing promotion');
      }

      return data.promotion;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch promotion';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const restorePromotionState = (promotion: any) => {
    setState({
      currentStep: promotion.currentStep || 2,
      selectedUser: state.selectedUser,
      promotionId: promotion.promotionId,
      checkStatus: promotion.checkStatus || INITIAL_STATE.checkStatus,
      profileData: promotion.profileData || INITIAL_STATE.profileData,
      selectedSpecialties: promotion.selectedSpecialties || [],
      selectedServices: promotion.selectedServices || [],
      completed: false,
      stylistUserId: null
    });
    setIsResumedPromotion(true);
  };

  const handleSelectUser = async (user: UserSearchResult) => {
    setState(prev => ({ ...prev, selectedUser: user }));
    setSearchResults([]);
    setSearchQuery('');
    
    // Try to initiate promotion
    try {
      await initiatePromotion(user.id);
    } catch (err: any) {
      // Check if error is because promotion already exists
      const errorMessage = err.message || '';
      if (errorMessage.includes('already has a pending promotion') || errorMessage.includes('PROMOTION_EXISTS')) {
        // Try to fetch existing promotion
        try {
          const existingPromotion = await fetchExistingPromotion(user.id);
          
          // Confirm with admin if they want to resume
          const shouldResume = confirm(
            `${user.display_name} has an existing promotion in progress.\n\n` +
            `Status: ${existingPromotion.status}\n` +
            `Started: ${new Date(existingPromotion.createdAt).toLocaleDateString()}\n\n` +
            `Would you like to resume this promotion?`
          );

          if (shouldResume) {
            restorePromotionState(existingPromotion);
            setError(null);
          } else {
            // Clear selection if they don't want to resume
            setState(prev => ({ ...prev, selectedUser: null }));
          }
        } catch (fetchErr) {
          // If fetch fails, show original error
          console.error('Failed to fetch existing promotion:', fetchErr);
        }
      }
      // For other errors, they're already handled in initiatePromotion
    }
  };

  const handleNextStep = () => {
    if (state.currentStep < 6) {
      setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
    }
  };

  const handlePreviousStep = () => {
    if (state.currentStep > 1) {
      setState(prev => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  };

  const handleResetWizard = () => {
    setState(INITIAL_STATE);
    localStorage.removeItem(STORAGE_KEY);
    setError(null);
    setSearchQuery('');
    setSearchResults([]);
    setIsResumedPromotion(false);
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const allChecksComplete = () => {
    return (
      state.checkStatus.background_check === 'passed' &&
      state.checkStatus.id_verification === 'verified' &&
      state.checkStatus.training === true &&
      state.checkStatus.mfa === true
    );
  };

  const canProceedToStep3 = () => allChecksComplete();

  const canCompletePromotion = () => {
    return (
      allChecksComplete() &&
      state.profileData.display_name.trim() !== '' &&
      state.selectedSpecialties.length > 0 &&
      state.selectedServices.length > 0
    );
  };

  // ============================================================================
  // RENDER - COMPLETION SCREEN
  // ============================================================================

  if (state.completed) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mb-4">
          <Check className="h-8 w-8 text-emerald-300" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Onboarding Complete!</h2>
        <p className="text-foreground/70 mb-6">
          Successfully promoted user to stylist. Profile created and role assigned.
        </p>
        <div className="space-y-2 text-sm mb-6">
          <p><strong>Stylist User ID:</strong> {state.stylistUserId}</p>
          <p><strong>Display Name:</strong> {state.profileData.display_name}</p>
          {state.selectedServices.length > 0 && (
            <p><strong>Services Assigned:</strong> {state.selectedServices.length}</p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.href = `/admin/stylists/${state.stylistUserId}/schedule`}
            className="rounded-lg bg-[var(--kb-primary-brand)] px-6 py-2 font-medium text-white hover:opacity-90 transition-opacity"
          >
            Setup Schedule →
          </button>
          <button
            onClick={handleResetWizard}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2 font-medium hover:bg-white/10 transition-colors"
          >
            Onboard Another Stylist
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER - WIZARD
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="overflow-x-auto lg:overflow-x-visible pb-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        <div className="flex items-center justify-between min-w-max lg:min-w-0">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full ring-2 transition-colors',
                    state.currentStep > step.id
                      ? 'bg-emerald-500/20 ring-emerald-500/50 text-emerald-300'
                      : state.currentStep === step.id
                      ? 'bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)] text-[var(--kb-primary-brand)]'
                      : 'bg-white/5 ring-white/20 text-foreground/50'
                  )}
                >
                  {state.currentStep > step.id ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                <span className="mt-2 text-xs font-medium whitespace-nowrap">{step.name}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-16 mx-4 transition-colors shrink-0',
                    state.currentStep > step.id
                      ? 'bg-emerald-500/50'
                      : 'bg-white/10'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Resume Info Banner */}
      {isResumedPromotion && state.promotionId && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-blue-300">Resuming Existing Promotion</p>
            <p className="text-sm text-blue-200/80 mt-1">
              Continuing promotion for <strong>{state.selectedUser?.display_name}</strong>. 
              You can pick up where you left off.
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-300">Error</p>
            <p className="text-sm text-red-200/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10 min-h-[400px]">
        {state.currentStep === 1 && (
          <Step1UserSelection 
            selectedUser={state.selectedUser}
            searchQuery={searchQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearchChange={(q) => {
              setSearchQuery(q);
              searchUsers(q);
            }}
            onSelectUser={handleSelectUser}
            onClearSelection={() => {
              setState(prev => ({ ...prev, selectedUser: null }));
              setSearchResults([]);
              setSearchQuery('');
            }}
          />
        )}

        {state.currentStep === 2 && (
          <Step2Verification
            checkStatus={state.checkStatus}
            isLoading={isLoading}
            onUpdateCheck={updateCheck}
            allChecksComplete={allChecksComplete()}
          />
        )}

        {state.currentStep === 3 && (
          <Step3ProfileSetup
            profileData={state.profileData}
            selectedUserId={state.selectedUser?.id || null}
            onUpdateProfile={(field, value) => {
              setState(prev => ({
                ...prev,
                profileData: { ...prev.profileData, [field]: value }
              }));
            }}
          />
        )}

        {state.currentStep === 4 && (
          <Step4SpecialtySelection
            selectedSpecialties={state.selectedSpecialties}
            onUpdateSpecialties={(specialties) => {
              setState(prev => ({ ...prev, selectedSpecialties: specialties }));
            }}
          />
        )}

        {state.currentStep === 5 && (
          <Step5ServiceSelection
            selectedServices={state.selectedServices}
            onUpdateServices={(services) => {
              setState(prev => ({ ...prev, selectedServices: services }));
            }}
          />
        )}

        {state.currentStep === 6 && (
          <Step6ReviewComplete
            selectedUser={state.selectedUser}
            checkStatus={state.checkStatus}
            profileData={state.profileData}
            selectedSpecialties={state.selectedSpecialties}
            selectedServices={state.selectedServices}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePreviousStep}
          disabled={state.currentStep === 1 || isLoading}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {state.currentStep < 6 ? (
          <button
            onClick={handleNextStep}
            disabled={
              (state.currentStep === 1 && !state.selectedUser) ||
              (state.currentStep === 2 && !canProceedToStep3()) ||
              (state.currentStep === 3 && state.profileData.display_name.trim() === '') ||
              (state.currentStep === 4 && state.selectedSpecialties.length === 0) ||
              (state.currentStep === 5 && state.selectedServices.length === 0) ||
              isLoading
            }
            className="flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={completePromotion}
            disabled={!canCompletePromotion() || isLoading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Complete Onboarding
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STEP COMPONENTS
// ============================================================================

// Step 1: User Selection
function Step1UserSelection({ 
  selectedUser, 
  searchQuery, 
  searchResults, 
  isSearching,
  onSearchChange, 
  onSelectUser,
  onClearSelection
}: {
  selectedUser: UserSearchResult | null;
  searchQuery: string;
  searchResults: UserSearchResult[];
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  onSelectUser: (user: UserSearchResult) => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Select User to Promote</h2>
      <p className="text-sm text-foreground/60">
        Search for an existing customer user to promote to stylist role
      </p>

      {selectedUser ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedUser.display_name}</p>
                <p className="text-sm text-foreground/60">@{selectedUser.username}</p>
                {selectedUser.email && (
                  <p className="text-xs text-foreground/50 mt-1">{selectedUser.email}</p>
                )}
              </div>
              <Check className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <button
            onClick={onClearSelection}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors"
          >
            Change User
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by username or email..."
              className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-foreground/50" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground/50 px-1">
                {searchResults.length} {searchResults.length === 1 ? 'user' : 'users'} found
              </p>
              <div className="space-y-2">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onSelectUser(user)}
                    className="w-full flex items-center gap-4 rounded-xl border-2 border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 text-left transition-all hover:border-[var(--kb-primary-brand)]/40 hover:bg-[var(--kb-primary-brand)]/5 hover:shadow-lg hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--kb-primary-brand)]/30 to-[var(--kb-primary-brand)]/10 ring-2 ring-[var(--kb-primary-brand)]/30">
                      <User className="h-6 w-6 text-[var(--kb-primary-brand)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base text-foreground">
                        {user.display_name || user.username || 'Unnamed User'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm text-foreground/70">@{user.username || 'no-username'}</p>
                        {user.email && (
                          <>
                            <span className="text-foreground/40">•</span>
                            <p className="text-sm text-foreground/70 truncate">{user.email}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="rounded-full bg-[var(--kb-primary-brand)]/20 px-3 py-1 text-xs font-medium text-[var(--kb-primary-brand)]">
                        Select
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 2: Verification Checks
function Step2Verification({ 
  checkStatus, 
  isLoading, 
  onUpdateCheck,
  allChecksComplete
}: {
  checkStatus: CheckStatus;
  isLoading: boolean;
  onUpdateCheck: (checkType: keyof CheckStatus, status: string) => Promise<any>;
  allChecksComplete: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Verification Checks</h2>
      <p className="text-sm text-foreground/60">
        Update the status of each verification check
      </p>

      <div className="space-y-3">
        {/* Background Check */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Background Check</h3>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
              checkStatus.background_check === 'passed'
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                : 'bg-white/10 text-foreground/80 ring-white/10'
            )}>
              {checkStatus.background_check}
            </span>
          </div>
          <select
            value={checkStatus.background_check}
            onChange={(e) => onUpdateCheck('background_check', e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50 [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* ID Verification */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">ID Verification</h3>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
              checkStatus.id_verification === 'verified'
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                : 'bg-white/10 text-foreground/80 ring-white/10'
            )}>
              {checkStatus.id_verification}
            </span>
          </div>
          <select
            value={checkStatus.id_verification}
            onChange={(e) => onUpdateCheck('id_verification', e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50 [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
          >
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Training */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <h3 className="font-medium">Training Completed</h3>
              <p className="text-sm text-foreground/60 mt-1">Required training modules finished</p>
            </div>
            <input
              type="checkbox"
              checked={checkStatus.training}
              onChange={(e) => onUpdateCheck('training', e.target.checked ? 'completed' : 'false')}
              disabled={isLoading}
              className="h-5 w-5 rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)] focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
            />
          </label>
        </div>

        {/* MFA */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <h3 className="font-medium">MFA Enabled</h3>
              <p className="text-sm text-foreground/60 mt-1">Multi-factor authentication configured</p>
            </div>
            <input
              type="checkbox"
              checked={checkStatus.mfa}
              onChange={(e) => onUpdateCheck('mfa', e.target.checked ? 'enabled' : 'false')}
              disabled={isLoading}
              className="h-5 w-5 rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)] focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
            />
          </label>
        </div>
      </div>

      {allChecksComplete && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-300">All Checks Passed!</p>
            <p className="text-sm text-emerald-200/80 mt-1">Ready to proceed to profile setup.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Step3ProfileSetup({ 
  profileData,
  selectedUserId,
  onUpdateProfile 
}: {
  profileData: ProfileData & { avatar_url?: string };
  selectedUserId: string | null;
  onUpdateProfile: (field: string, value: string | number) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Profile Setup</h2>
        <p className="mt-1 text-sm text-foreground/70">Configure the stylist profile details</p>
      </div>
      
      {/* Avatar Upload */}
      <div>
        <label className="block text-sm font-medium mb-2">Profile Picture</label>
        <AvatarUpload
          currentAvatarUrl={profileData.avatar_url}
          targetUserId={selectedUserId}
          onUploadSuccess={(url) => onUpdateProfile('avatar_url', url)}
        />
      </div>

      <div className="space-y-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Display Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={profileData.display_name}
            onChange={(e) => onUpdateProfile('display_name', e.target.value)}
            placeholder="e.g., Sarah Johnson"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">Title</label>
          <input
            type="text"
            value={profileData.title}
            onChange={(e) => onUpdateProfile('title', e.target.value)}
            placeholder="e.g., Senior Stylist"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium mb-2">Bio</label>
          <textarea
            value={profileData.bio}
            onChange={(e) => onUpdateProfile('bio', e.target.value)}
            placeholder="Brief description of expertise and experience..."
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Years of Experience */}
        <div>
          <label className="block text-sm font-medium mb-2">Years of Experience</label>
          <input
            type="number"
            min="0"
            value={profileData.years_experience}
            onChange={(e) => onUpdateProfile('years_experience', parseInt(e.target.value) || 0)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium mb-2">Timezone</label>
          <select
            value={profileData.timezone}
            onChange={(e) => onUpdateProfile('timezone', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
          >
            <option value="Asia/Kathmandu">Asia/Kathmandu (Nepal Time)</option>
            <option value="Asia/Kolkata">Asia/Kolkata (India Time)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// Step 5: Service Selection (renamed from Step 4)
function Step5ServiceSelection({
  selectedServices,
  onUpdateServices
}: {
  selectedServices: string[];
  onUpdateServices: (services: string[]) => void;
}) {
  const [services, setServices] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/services');
      const data = await response.json();
      if (data.success) {
        setServices(data.services.filter((s: any) => s.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleService = (serviceId: string) => {
    if (selectedServices.includes(serviceId)) {
      onUpdateServices(selectedServices.filter(id => id !== serviceId));
    } else {
      onUpdateServices([...selectedServices, serviceId]);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Select Services</h2>
      <p className="text-sm text-foreground/60">
        Choose which services this stylist can perform
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/50" />
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={cn(
                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.02]',
                selectedServices.includes(service.id)
                  ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              )}
            >
              <div className={cn(
                'flex h-5 w-5 items-center justify-center rounded border-2 mt-0.5',
                selectedServices.includes(service.id)
                  ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]'
                  : 'border-white/30'
              )}>
                {selectedServices.includes(service.id) && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">{service.name}</h3>
                {service.description && (
                  <p className="text-xs text-foreground/60 mt-1">{service.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-foreground/50">
                  <span>{service.durationMinutes} min</span>
                  <span>•</span>
                  <span>${(service.basePriceCents / 100).toFixed(2)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedServices.length > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <p className="text-emerald-400">
            {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  );
}

// Step 6: Review & Complete (renamed from Step 5)
function Step6ReviewComplete({ 
  selectedUser, 
  checkStatus, 
  profileData,
  selectedSpecialties,
  selectedServices
}: {
  selectedUser: UserSearchResult | null;
  checkStatus: CheckStatus;
  profileData: ProfileData;
  selectedSpecialties: string[];
  selectedServices: string[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Review & Complete</h2>
      <p className="text-sm text-foreground/60">
        Review all details before finalizing the promotion
      </p>

      <div className="space-y-4">
        {/* User Info */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="font-medium mb-3">User Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground/60">Display Name:</dt>
              <dd className="font-medium">{selectedUser?.display_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Username:</dt>
              <dd>@{selectedUser?.username}</dd>
            </div>
          </dl>
        </div>

        {/* Verification Status */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="font-medium mb-3">Verification Status</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-foreground/60">Background Check:</dt>
              <dd className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
                checkStatus.background_check === 'passed'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 ring-red-500/30'
              )}>
                {checkStatus.background_check}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-foreground/60">ID Verification:</dt>
              <dd className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
                checkStatus.id_verification === 'verified'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 ring-red-500/30'
              )}>
                {checkStatus.id_verification}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-foreground/60">Training:</dt>
              <dd className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
                checkStatus.training
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 ring-red-500/30'
              )}>
                {checkStatus.training ? 'Completed' : 'Not Completed'}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-foreground/60">MFA:</dt>
              <dd className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
                checkStatus.mfa
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 ring-red-500/30'
              )}>
                {checkStatus.mfa ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Profile Details */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="font-medium mb-3">Profile Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground/60">Display Name:</dt>
              <dd className="font-medium">{profileData.display_name || <em className="text-foreground/40">Not set</em>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Title:</dt>
              <dd>{profileData.title || <em className="text-foreground/40">Not set</em>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Years of Experience:</dt>
              <dd>{profileData.years_experience}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Timezone:</dt>
              <dd>{profileData.timezone}</dd>
            </div>
          </dl>
          {profileData.bio && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <dt className="text-xs text-foreground/60 mb-1">Bio:</dt>
              <dd className="text-sm">{profileData.bio}</dd>
            </div>
          )}
        </div>

        {/* Selected Specialties */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="font-medium mb-3">Selected Specialties</h3>
          {selectedSpecialties.length > 0 ? (
            <div className="text-sm">
              <p className="text-foreground/60 mb-2">{selectedSpecialties.length} specialties selected</p>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[var(--kb-primary-brand)]" />
                <span className="text-foreground/80">Specialties will be assigned after completion</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground/60">No specialties selected</p>
          )}
        </div>

        {/* Selected Services */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="font-medium mb-3">Selected Services</h3>
          {selectedServices.length > 0 ? (
            <div className="text-sm">
              <p className="text-foreground/60 mb-2">{selectedServices.length} services selected</p>
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[var(--kb-primary-brand)]" />
                <span className="text-foreground/80">Services will be assigned after completion</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground/60">No services selected</p>
          )}
        </div>
      </div>
    </div>
  );
}
