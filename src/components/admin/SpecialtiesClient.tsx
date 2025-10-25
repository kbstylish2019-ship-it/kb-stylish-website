'use client';

import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import AddSpecialtyForm from './AddSpecialtyForm';

interface Specialty {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface SpecialtiesClientProps {
  specialties: Specialty[];
}

export default function SpecialtiesClient({ specialties: initialSpecialties }: SpecialtiesClientProps) {
  const [specialties, setSpecialties] = useState(initialSpecialties);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const categories = ['hair', 'makeup', 'nails', 'spa', 'bridal', 'grooming'];
  
  const handleToggleActive = async (specialtyId: string, currentStatus: boolean) => {
    setLoading(specialtyId);
    setError(null);
    setSuccess(null);
    
    // Optimistic update
    setSpecialties(prev => prev.map(s => 
      s.id === specialtyId ? { ...s, is_active: !currentStatus } : s
    ));
    
    try {
      const response = await fetch('/api/admin/curation/toggle-specialty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty_id: specialtyId,
          is_active: !currentStatus
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        // Revert optimistic update
        setSpecialties(prev => prev.map(s => 
          s.id === specialtyId ? { ...s, is_active: currentStatus } : s
        ));
        setError(data.error || 'Failed to update specialty');
      } else {
        setSuccess(data.message || 'Specialty updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      // Revert optimistic update
      setSpecialties(prev => prev.map(s => 
        s.id === specialtyId ? { ...s, is_active: currentStatus } : s
      ));
      setError('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  
  const activeCount = specialties.filter(s => s.is_active).length;
  const groupedByCategory = specialties.reduce((acc, specialty) => {
    if (!acc[specialty.category]) {
      acc[specialty.category] = [];
    }
    acc[specialty.category].push(specialty);
    return acc;
  }, {} as Record<string, Specialty[]>);
  
  return (
    <div className="space-y-4">
      {/* Status messages */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <p className="text-sm text-green-500">{success}</p>
        </div>
      )}
      
      {/* Stats */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
        <div>
          <p className="text-sm text-foreground/70">
            <span className="font-semibold text-foreground">{activeCount}</span> of {specialties.length} specialties active
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Add Specialty
        </button>
      </div>
      
      {/* Add form */}
      {showAddForm && (
        <AddSpecialtyForm
          onClose={() => setShowAddForm(false)}
          onSuccess={(newSpecialty) => {
            setSpecialties(prev => [...prev, newSpecialty]);
            setShowAddForm(false);
            setSuccess('Specialty added successfully!');
            setTimeout(() => setSuccess(null), 3000);
          }}
        />
      )}
      
      {/* Specialties grouped by category */}
      {categories.map(category => {
        const categorySpecialties = groupedByCategory[category] || [];
        if (categorySpecialties.length === 0) return null;
        
        return (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase text-foreground/70">
              {category} ({categorySpecialties.length})
            </h3>
            
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="max-w-full overflow-x-auto">
              <table className="min-w-[720px] w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-semibold">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold">Slug</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold">Icon</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold">Order</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySpecialties.map((specialty) => (
                    <tr key={specialty.id} className="border-b border-white/5 last:border-0">
                      <td className="px-6 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{specialty.name}</span>
                          {specialty.description && (
                            <span className="text-xs text-foreground/60">{specialty.description}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-foreground/70">{specialty.slug}</td>
                      <td className="px-6 py-3 text-sm text-foreground/70">{specialty.icon || 'N/A'}</td>
                      <td className="px-6 py-3 text-center text-sm font-medium">{specialty.display_order}</td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(specialty.id, specialty.is_active)}
                          disabled={loading === specialty.id}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            specialty.is_active ? 'bg-green-500' : 'bg-white/20'
                          } ${loading === specialty.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              specialty.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        );
      })}
      
      {specialties.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-foreground/70">No specialties found</p>
        </div>
      )}
    </div>
  );
}
