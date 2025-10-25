'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/custom-ui';
import { Button } from '@/components/ui/custom-ui';
import { Loader2 } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  description?: string;
  category: string;
  basePriceCents: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (service: Service, isEdit: boolean) => void;
  service?: Service | null;
}

const CATEGORIES = [
  'hair',
  'makeup',
  'nails',
  'spa',
  'consultation'
];

const CATEGORY_LABELS: Record<string, string> = {
  hair: 'Hair Services',
  makeup: 'Makeup',
  nails: 'Nails',
  spa: 'Spa',
  consultation: 'Consultation'
};

export default function ServiceFormModal({
  isOpen,
  onClose,
  onSuccess,
  service
}: ServiceFormModalProps) {
  const isEdit = !!service;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('hair');
  const [priceNPR, setPriceNPR] = useState('');
  const [duration, setDuration] = useState('60');
  const [isActive, setIsActive] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load service data when editing
  useEffect(() => {
    if (service) {
      setName(service.name);
      setDescription(service.description || '');
      setCategory(service.category);
      setPriceNPR((service.basePriceCents / 100).toFixed(2));
      setDuration(service.durationMinutes.toString());
      setIsActive(service.isActive);
    } else {
      // Reset form for new service
      setName('');
      setDescription('');
      setCategory('hair');
      setPriceNPR('');
      setDuration('60');
      setIsActive(true);
    }
    setError('');
  }, [service, isOpen]);

  // Validation
  const validate = () => {
    if (!name.trim() || name.trim().length < 3) {
      setError('Service name must be at least 3 characters');
      return false;
    }

    if (!category) {
      setError('Please select a category');
      return false;
    }

    const price = parseFloat(priceNPR);
    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid price');
      return false;
    }

    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum < 15) {
      setError('Duration must be at least 15 minutes');
      return false;
    }

    return true;
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) {
      return;
    }

    setSubmitting(true);

    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        basePriceCents: Math.round(parseFloat(priceNPR) * 100),
        durationMinutes: parseInt(duration),
        isActive
      };

      const url = isEdit
        ? `/api/admin/services/${service!.id}`
        : '/api/admin/services';

      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to ${isEdit ? 'update' : 'create'} service`);
      }

      onSuccess(data.service, isEdit);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service' : 'Create New Service'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Service Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Service Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Women's Haircut"
              required
              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the service..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Category & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Duration (min) *
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="60"
                required
                min="15"
                step="15"
                className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Base Price (NPR) *
            </label>
            <input
              type="number"
              value={priceNPR}
              onChange={(e) => setPriceNPR(e.target.value)}
              placeholder="1500.00"
              required
              min="1"
              step="0.01"
              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
            />
            <label htmlFor="active" className="text-sm cursor-pointer">
              Active (visible to customers for booking)
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEdit ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>{isEdit ? 'Update Service' : 'Create Service'}</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
