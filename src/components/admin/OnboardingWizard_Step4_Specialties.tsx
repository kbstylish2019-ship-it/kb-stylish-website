// Step 4: Specialty Selection Component
// This is extracted for clarity and can be imported into OnboardingWizardClient.tsx

import React from 'react';
import { Check, Crown, Scissors, Paintbrush, Heart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Specialty {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  icon: string | null;
  display_order: number;
}

export function Step4SpecialtySelection({ 
  selectedSpecialties, 
  onUpdateSpecialties 
}: {
  selectedSpecialties: string[];
  onUpdateSpecialties: (specialties: string[]) => void;
}) {
  const [specialties, setSpecialties] = React.useState<Specialty[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchSpecialties = async () => {
      try {
        const response = await fetch('/api/specialty-types');
        const data = await response.json();
        
        if (data.success) {
          setSpecialties(data.specialties || []);
        } else {
          setError('Failed to load specialties');
        }
      } catch (err) {
        setError('Network error loading specialties');
      } finally {
        setLoading(false);
      }
    };

    fetchSpecialties();
  }, []);

  const toggleSpecialty = (specialtyId: string) => {
    if (selectedSpecialties.includes(specialtyId)) {
      onUpdateSpecialties(selectedSpecialties.filter(id => id !== specialtyId));
    } else if (selectedSpecialties.length < 5) {
      onUpdateSpecialties([...selectedSpecialties, specialtyId]);
    }
  };

  // Group by category
  const groupedSpecialties = specialties.reduce((acc, specialty) => {
    if (!acc[specialty.category]) {
      acc[specialty.category] = [];
    }
    acc[specialty.category].push(specialty);
    return acc;
  }, {} as Record<string, Specialty[]>);

  const categories = Object.keys(groupedSpecialties).sort();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Select Specialties</h2>
      <p className="text-sm text-foreground/60">
        Choose 1-5 areas of expertise for this stylist (minimum 1 required)
      </p>

      {loading && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-foreground/70">Loading specialties...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-foreground/70">
                {category} ({groupedSpecialties[category].length})
              </h3>
              
              <div className="grid gap-3 sm:grid-cols-2">
                {groupedSpecialties[category].map((specialty) => {
                  const isSelected = selectedSpecialties.includes(specialty.id);
                  const isDisabled = !isSelected && selectedSpecialties.length >= 5;
                  
                  return (
                    <button
                      key={specialty.id}
                      type="button"
                      onClick={() => !isDisabled && toggleSpecialty(specialty.id)}
                      disabled={isDisabled}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                        isSelected
                          ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10 hover:scale-[1.02]'
                          : isDisabled
                          ? 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:scale-[1.02]'
                      )}
                    >
                      <div className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border-2 mt-0.5 flex-shrink-0',
                        isSelected
                          ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]'
                          : 'border-white/30'
                      )}>
                        {isSelected && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{specialty.name}</p>
                        {specialty.description && (
                          <p className="text-xs text-foreground/60 mt-1 line-clamp-2">
                            {specialty.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selection counter */}
      {selectedSpecialties.length > 0 && (
        <div className={cn(
          'rounded-lg border p-3 text-sm',
          selectedSpecialties.length >= 1
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        )}>
          <p>
            {selectedSpecialties.length} of 5 specialties selected
            {selectedSpecialties.length >= 5 && ' (maximum reached)'}
          </p>
        </div>
      )}

      {selectedSpecialties.length === 0 && !loading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          <p>⚠️ At least 1 specialty is required to proceed</p>
        </div>
      )}
    </div>
  );
}
