'use client';

import React, { useState } from 'react';

interface Brand {
  id: string;
  name: string;
  slug: string;
  is_featured: boolean;
  logo_url?: string;
  is_active: boolean;
}

interface FeaturedBrandsClientProps {
  brands: Brand[];
}

export default function FeaturedBrandsClient({ brands: initialBrands }: FeaturedBrandsClientProps) {
  const [brands, setBrands] = useState(initialBrands);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const handleToggle = async (brandId: string, currentStatus: boolean) => {
    setLoading(brandId);
    setError(null);
    setSuccess(null);
    
    // Optimistic update
    setBrands(prev => prev.map(b => 
      b.id === brandId ? { ...b, is_featured: !currentStatus } : b
    ));
    
    try {
      const response = await fetch('/api/admin/curation/toggle-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          is_featured: !currentStatus
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        // Revert optimistic update
        setBrands(prev => prev.map(b => 
          b.id === brandId ? { ...b, is_featured: currentStatus } : b
        ));
        setError(data.error || 'Failed to update brand');
      } else {
        setSuccess(data.message || 'Brand updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      // Revert optimistic update
      setBrands(prev => prev.map(b => 
        b.id === brandId ? { ...b, is_featured: currentStatus } : b
      ));
      setError('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  
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
      
      {/* Brands table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-4 text-left text-sm font-semibold">Brand Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold">Slug</th>
              <th className="px-6 py-4 text-center text-sm font-semibold">Featured</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="border-b border-white/5 last:border-0">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {brand.logo_url && (
                      <img 
                        src={brand.logo_url} 
                        alt={brand.name}
                        className="h-8 w-8 rounded object-contain"
                      />
                    )}
                    <span className="font-medium">{brand.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-foreground/70">{brand.slug}</td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => handleToggle(brand.id, brand.is_featured)}
                    disabled={loading === brand.id}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      brand.is_featured ? 'bg-green-500' : 'bg-white/20'
                    } ${loading === brand.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        brand.is_featured ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {brands.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-foreground/70">No brands found</p>
        </div>
      )}
    </div>
  );
}
