'use client';

import React, { useState } from 'react';

interface Stylist {
  user_id: string;
  display_name: string;
  title: string | null;
  is_featured: boolean;
  featured_at: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  total_bookings: number;
  rating_average: number | null;
  years_experience: number | null;
}

interface FeaturedStylistsClientProps {
  stylists: Stylist[];
}

export default function FeaturedStylistsClient({ stylists: initialStylists }: FeaturedStylistsClientProps) {
  const [stylists, setStylists] = useState(initialStylists);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const handleToggleFeatured = async (userId: string, currentStatus: boolean) => {
    setLoading(userId);
    setError(null);
    setSuccess(null);
    
    // Optimistic update
    setStylists(prev => prev.map(s => 
      s.user_id === userId ? { ...s, is_featured: !currentStatus } : s
    ));
    
    try {
      const response = await fetch('/api/admin/curation/toggle-stylist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          is_featured: !currentStatus
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        // Revert optimistic update
        setStylists(prev => prev.map(s => 
          s.user_id === userId ? { ...s, is_featured: currentStatus } : s
        ));
        setError(data.error || 'Failed to update stylist');
      } else {
        setSuccess(data.message || 'Stylist updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      // Revert optimistic update
      setStylists(prev => prev.map(s => 
        s.user_id === userId ? { ...s, is_featured: currentStatus } : s
      ));
      setError('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  
  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    // Show confirmation dialog
    const action = currentStatus ? 'deactivate' : 'activate';
    const confirmed = confirm(
      `Are you sure you want to ${action} this stylist?\n\n` +
      (currentStatus 
        ? 'This will:\n• Hide from booking page\n• Prevent new bookings\n• Keep existing bookings active'
        : 'This will make the stylist visible and allow new bookings.')
    );
    
    if (!confirmed) return;
    
    setLoading(userId);
    setError(null);
    setSuccess(null);
    
    // Optimistic update
    setStylists(prev => prev.map(s => 
      s.user_id === userId ? { ...s, is_active: !currentStatus } : s
    ));
    
    try {
      const response = await fetch('/api/admin/stylists/toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          is_active: !currentStatus
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        // Revert optimistic update
        setStylists(prev => prev.map(s => 
          s.user_id === userId ? { ...s, is_active: currentStatus } : s
        ));
        setError(data.error || 'Failed to update stylist');
      } else {
        setSuccess(data.message || 'Stylist updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      // Revert optimistic update
      setStylists(prev => prev.map(s => 
        s.user_id === userId ? { ...s, is_active: currentStatus } : s
      ));
      setError('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  
  const featuredCount = stylists.filter(s => s.is_featured).length;
  const activeCount = stylists.filter(s => s.is_active).length;
  const inactiveCount = stylists.length - activeCount;
  
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
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground/70">
            <span className="font-semibold text-foreground">{featuredCount}</span> of {stylists.length} stylists featured
          </p>
          <p className="text-sm text-foreground/70">
            <span className="font-semibold text-green-500">{activeCount}</span> active • 
            <span className="font-semibold text-red-400">{inactiveCount}</span> inactive
          </p>
        </div>
      </div>
      
      {/* Stylists table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-4 text-left text-sm font-semibold">Stylist Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Title</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Bookings</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Rating</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Status</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Featured</th>
            </tr>
          </thead>
          <tbody>
            {stylists.map((stylist) => (
              <tr key={stylist.user_id} className="border-b border-white/5 last:border-0">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-medium">{stylist.display_name}</span>
                    {stylist.years_experience && (
                      <span className="text-xs text-foreground/60">{stylist.years_experience} years exp</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-foreground/70">{stylist.title || 'N/A'}</td>
                <td className="px-6 py-4 text-center text-sm font-medium">{stylist.total_bookings}</td>
                <td className="px-6 py-4 text-center text-sm">
                  {stylist.rating_average ? stylist.rating_average.toFixed(1) : 'N/A'}
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => handleToggleActive(stylist.user_id, stylist.is_active)}
                    disabled={loading === stylist.user_id}
                    title={stylist.is_active ? 'Deactivate stylist' : 'Activate stylist'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      stylist.is_active ? 'bg-green-500' : 'bg-red-500/50'
                    } ${loading === stylist.user_id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        stylist.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => handleToggleFeatured(stylist.user_id, stylist.is_featured)}
                    disabled={loading === stylist.user_id || !stylist.is_active}
                    title={!stylist.is_active ? 'Cannot feature inactive stylist' : (stylist.is_featured ? 'Unfeature stylist' : 'Feature stylist')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      stylist.is_featured ? 'bg-[var(--kb-primary-brand)]' : 'bg-white/20'
                    } ${loading === stylist.user_id || !stylist.is_active ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        stylist.is_featured ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {stylists.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-foreground/70">No stylists found</p>
        </div>
      )}
    </div>
  );
}
