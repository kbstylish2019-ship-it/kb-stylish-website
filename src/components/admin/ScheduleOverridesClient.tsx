'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Users, Building2, Palmtree, Sun, Sparkles, AlertCircle, Check, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type OverrideType = 'business_closure' | 'stylist_vacation' | 'seasonal_hours' | 'special_event';

interface ScheduleOverride {
  id: string;
  override_type: string;
  applies_to_all_stylists: boolean;
  stylist_user_id: string | null;
  start_date: string;
  end_date: string;
  override_start_time: string | null;
  override_end_time: string | null;
  is_closed: boolean;
  priority: number;
  reason: string | null;
  created_at: string;
  stylist_display_name?: string | null;
}

interface Stylist {
  user_id: string;
  display_name: string;
  title: string | null;
}

interface Props {
  initialOverrides: ScheduleOverride[];
  stylists: Stylist[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OVERRIDE_TYPES: { value: OverrideType; label: string; icon: any; description: string; defaultPriority: number }[] = [
  {
    value: 'business_closure',
    label: 'Business Closure',
    icon: Building2,
    description: 'Entire business closed (e.g., holidays)',
    defaultPriority: 100
  },
  {
    value: 'stylist_vacation',
    label: 'Stylist Vacation',
    icon: Palmtree,
    description: 'Individual stylist time off',
    defaultPriority: 50
  },
  {
    value: 'seasonal_hours',
    label: 'Seasonal Hours',
    icon: Sun,
    description: 'Business-wide hour changes',
    defaultPriority: 10
  },
  {
    value: 'special_event',
    label: 'Special Event',
    icon: Sparkles,
    description: 'One-time scheduling events',
    defaultPriority: 30
  }
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ScheduleOverridesClient({ initialOverrides, stylists }: Props) {
  const [overrides, setOverrides] = useState<ScheduleOverride[]>(initialOverrides);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [overrideType, setOverrideType] = useState<OverrideType>('business_closure');
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [selectedStylistId, setSelectedStylistId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isClosed, setIsClosed] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [priority, setPriority] = useState(100);
  const [reason, setReason] = useState('');

  // Update priority when override type changes
  React.useEffect(() => {
    const typeConfig = OVERRIDE_TYPES.find(t => t.value === overrideType);
    if (typeConfig) {
      setPriority(typeConfig.defaultPriority);
    }
  }, [overrideType]);

  // Reset stylist selection when "applies to all" changes
  React.useEffect(() => {
    if (appliesToAll) {
      setSelectedStylistId('');
    }
  }, [appliesToAll]);

  // ============================================================================
  // FORM VALIDATION
  // ============================================================================

  const validateForm = (): string | null => {
    if (!overrideType) return 'Please select an override type';
    if (!startDate) return 'Please select a start date';
    if (!endDate) return 'Please select an end date';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 'End date must be after start date';

    if (!appliesToAll && !selectedStylistId) return 'Please select a stylist';
    if (!isClosed && (!startTime || !endTime)) return 'Please specify override hours';

    return null;
  };

  // ============================================================================
  // API CALL
  // ============================================================================

  const handleCreateOverride = async () => {
    // Validation
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/schedule-overrides/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideType,
          appliesToAllStylists: appliesToAll,
          stylistUserId: appliesToAll ? undefined : selectedStylistId,
          startDate,
          endDate,
          isClosed,
          overrideStartTime: isClosed ? undefined : startTime,
          overrideEndTime: isClosed ? undefined : endTime,
          priority,
          reason: reason.trim() || undefined
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create override');
      }

      // Success! Add to list and reset form
      setSuccess(data.message || 'Override created successfully');
      setIsCreating(false);
      
      // Reset form
      setOverrideType('business_closure');
      setAppliesToAll(true);
      setSelectedStylistId('');
      setStartDate('');
      setEndDate('');
      setIsClosed(true);
      setStartTime('09:00');
      setEndTime('17:00');
      setPriority(100);
      setReason('');

      // Refresh page to show new override
      window.location.reload();

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create override';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatOverrideType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {success && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-emerald-300">Success</p>
            <p className="text-sm text-emerald-200/80 mt-1">{success}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-300">Error</p>
            <p className="text-sm text-red-200/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Create New Override Button/Form */}
      {!isCreating ? (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full rounded-lg border-2 border-dashed border-white/20 bg-white/5 p-6 flex items-center justify-center gap-2 hover:bg-white/10 hover:border-white/30 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">Create New Override</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Create Schedule Override</h2>
            <button
              onClick={() => setIsCreating(false)}
              disabled={isLoading}
              className="text-sm text-foreground/60 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-6">
            {/* Override Type Selector */}
            <div>
              <label className="block text-sm font-medium mb-3">Override Type</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {OVERRIDE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setOverrideType(type.value)}
                      disabled={isLoading}
                      className={cn(
                        'p-4 rounded-lg border-2 text-left transition-all disabled:opacity-50',
                        overrideType === type.value
                          ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={cn(
                          'h-5 w-5 mt-0.5',
                          overrideType === type.value ? 'text-[var(--kb-primary-brand)]' : 'text-foreground/60'
                        )} />
                        <div className="flex-1">
                          <p className="font-medium">{type.label}</p>
                          <p className="text-xs text-foreground/60 mt-1">{type.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applies To */}
            <div>
              <label className="block text-sm font-medium mb-3">Applies To</label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10">
                  <input
                    type="checkbox"
                    checked={appliesToAll}
                    onChange={(e) => setAppliesToAll(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)] focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                  />
                  <div>
                    <p className="font-medium">All Stylists</p>
                    <p className="text-xs text-foreground/60">This override applies to everyone</p>
                  </div>
                </label>

                {!appliesToAll && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Select Stylist</label>
                    <select
                      value={selectedStylistId}
                      onChange={(e) => setSelectedStylistId(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                    >
                      <option value="">Choose a stylist...</option>
                      {stylists.map((stylist) => (
                        <option key={stylist.user_id} value={stylist.user_id}>
                          {stylist.display_name} {stylist.title ? `(${stylist.title})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Date Range - FAANG AUDIT FIX #1: HTML5 date pickers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || new Date().toISOString().split('T')[0]}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                />
              </div>
            </div>

            {/* Closed All Day / Time Range */}
            <div>
              <label className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 mb-3">
                <input
                  type="checkbox"
                  checked={isClosed}
                  onChange={(e) => setIsClosed(e.target.checked)}
                  disabled={isLoading}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)] focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                />
                <div>
                  <p className="font-medium">Closed All Day</p>
                  <p className="text-xs text-foreground/60">Stylist(s) unavailable for entire day</p>
                </div>
              </label>

              {!isClosed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Clock className="inline h-4 w-4 mr-1" />
                      End Time
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Priority Slider */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Priority: {priority}
                <span className="text-xs text-foreground/60 ml-2">
                  (Higher = takes precedence over conflicting overrides)
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10 disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, var(--kb-primary-brand) 0%, var(--kb-primary-brand) ${priority}%, rgba(255,255,255,0.1) ${priority}%, rgba(255,255,255,0.1) 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-foreground/60 mt-1">
                <span>Low (0)</span>
                <span>Medium (50)</span>
                <span>High (100)</span>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium mb-2">Reason (Optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isLoading}
                placeholder="e.g., Dashain Festival, Personal vacation, Winter hours..."
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] disabled:opacity-50"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCreateOverride}
              disabled={isLoading}
              className="w-full rounded-lg bg-[var(--kb-primary-brand)] px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? 'Creating...' : 'Create Override'}
            </button>
          </div>
        </div>
      )}

      {/* Existing Overrides List */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
        <h2 className="text-xl font-bold mb-4">Existing Overrides ({overrides.length})</h2>
        
        {overrides.length === 0 ? (
          <p className="text-sm text-foreground/60 py-8 text-center">
            No schedule overrides created yet.
          </p>
        ) : (
          <div className="space-y-3">
            {overrides.map((override) => {
              const typeConfig = OVERRIDE_TYPES.find(t => t.value === override.override_type);
              const Icon = typeConfig?.icon || Calendar;
              
              return (
                <div
                  key={override.id}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className="h-5 w-5 text-[var(--kb-primary-brand)] mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{formatOverrideType(override.override_type)}</h3>
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1',
                            override.is_closed
                              ? 'bg-red-500/15 text-red-300 ring-red-500/30'
                              : 'bg-blue-500/15 text-blue-300 ring-blue-500/30'
                          )}>
                            {override.is_closed ? 'Closed' : 'Modified Hours'}
                          </span>
                        </div>
                        
                        <div className="mt-2 space-y-1 text-sm text-foreground/70">
                          <p>
                            <Calendar className="inline h-3 w-3 mr-1" />
                            {formatDate(override.start_date)} → {formatDate(override.end_date)}
                          </p>
                          
                          {!override.is_closed && override.override_start_time && override.override_end_time && (
                            <p>
                              <Clock className="inline h-3 w-3 mr-1" />
                              {override.override_start_time} - {override.override_end_time}
                            </p>
                          )}
                          
                          <p>
                            <Users className="inline h-3 w-3 mr-1" />
                            {override.applies_to_all_stylists 
                              ? 'All Stylists' 
                              : override.stylist_display_name || 'Specific Stylist'
                            }
                          </p>
                          
                          {override.reason && (
                            <p className="text-xs italic">"{override.reason}"</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-foreground/50 mb-1">Priority</div>
                      <div className="text-lg font-bold text-[var(--kb-primary-brand)]">
                        {override.priority}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}