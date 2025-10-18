'use client';

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface AddSpecialtyFormProps {
  onClose: () => void;
  onSuccess: (specialty: any) => void;
}

export default function AddSpecialtyForm({ onClose, onSuccess }: AddSpecialtyFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category: 'hair',
    description: '',
    icon: 'Scissors',
    display_order: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = ['hair', 'makeup', 'nails', 'spa', 'bridal', 'grooming'];
  const iconOptions = ['Scissors', 'Palette', 'Layers', 'Sparkles', 'Crown', 'Star', 'Wind', 'Camera', 'Paintbrush', 'Gem', 'Heart', 'Waves', 'HeartHandshake', 'Flower', 'User'];

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    
    setFormData(prev => ({ ...prev, name, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/curation/add-specialty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add specialty');
      }

      onSuccess(data.specialty);
    } catch (err: any) {
      setError(err.message || 'Failed to add specialty');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Add New Specialty</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Hair Coloring Expert"
            required
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Slug (auto-generated) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Slug <span className="text-xs text-foreground/60">(auto-generated)</span>
          </label>
          <input
            type="text"
            value={formData.slug}
            onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
            placeholder="hair-coloring-expert"
            required
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Category <span className="text-red-400">*</span>
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            required
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Brief description of this specialty..."
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
        </div>

        {/* Icon */}
        <div>
          <label className="block text-sm font-medium mb-2">Icon</label>
          <select
            value={formData.icon}
            onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          >
            {iconOptions.map(icon => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
        </div>

        {/* Display Order */}
        <div>
          <label className="block text-sm font-medium mb-2">Display Order</label>
          <input
            type="number"
            value={formData.display_order}
            onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
            placeholder="0"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          />
          <p className="mt-1 text-xs text-foreground/60">Lower numbers appear first</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Specialty
          </button>
        </div>
      </form>
    </div>
  );
}
