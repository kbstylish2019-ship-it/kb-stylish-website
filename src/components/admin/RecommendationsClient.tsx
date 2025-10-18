'use client';

import React, { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Product {
  id: string;
  name: string;
  slug: string;
}

interface Recommendation {
  id: string;
  recommended_product_id: string;
  product_name: string;
  display_order: number;
}

export default function RecommendationsClient() {
  const [sourceProduct, setSourceProduct] = useState<Product | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceResults, setSourceResults] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recSearch, setRecSearch] = useState('');
  const [recResults, setRecResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // Search for source product
  const searchSourceProducts = async (query: string) => {
    if (query.length < 2) {
      setSourceResults([]);
      return;
    }
    
    const { data } = await supabase
      .from('products')
      .select('id, name, slug')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .limit(10);
    
    setSourceResults(data || []);
  };
  
  // Select source product and load recommendations
  const selectSourceProduct = async (product: Product) => {
    setSourceProduct(product);
    setSourceSearch('');
    setSourceResults([]);
    setLoading(true);
    
    // Join to products table using the recommended_product_id foreign key
    const { data } = await supabase
      .from('product_recommendations')
      .select(`
        id,
        recommended_product_id,
        display_order,
        recommended_product:products!recommended_product_id(name)
      `)
      .eq('source_product_id', product.id)
      .order('display_order');
    
    setRecommendations(data?.map(r => ({
      id: r.id,
      recommended_product_id: r.recommended_product_id,
      product_name: (r.recommended_product as any)?.name || 'Unknown Product',
      display_order: r.display_order
    })) || []);
    
    setLoading(false);
  };
  
  // Search for products to recommend
  const searchRecommendProducts = async (query: string) => {
    if (query.length < 2) {
      setRecResults([]);
      return;
    }
    
    const { data } = await supabase
      .from('products')
      .select('id, name, slug')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .neq('id', sourceProduct?.id || '')
      .limit(10);
    
    setRecResults(data || []);
  };
  
  // Add recommendation
  const addRecommendation = async (product: Product) => {
    if (!sourceProduct) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/admin/curation/add-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_product_id: sourceProduct.id,
          recommended_product_id: product.id,
          display_order: recommendations.length
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to add recommendation');
      } else {
        setSuccess('Recommendation added successfully');
        setTimeout(() => setSuccess(null), 3000);
        
        // Reload recommendations
        selectSourceProduct(sourceProduct);
      }
      
      setRecSearch('');
      setRecResults([]);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Remove recommendation
  const removeRecommendation = async (recommendationId: string) => {
    if (!sourceProduct) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/admin/curation/remove-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recommendationId })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to remove recommendation');
      } else {
        setSuccess('Recommendation removed successfully');
        setTimeout(() => setSuccess(null), 3000);
        
        // Reload recommendations
        selectSourceProduct(sourceProduct);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
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
      
      {/* Source product selection */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold mb-4">1. Select Source Product</h2>
        
        {!sourceProduct ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search for product..."
              value={sourceSearch}
              onChange={(e) => {
                setSourceSearch(e.target.value);
                searchSourceProducts(e.target.value);
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
            />
            
            {sourceResults.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/10 max-h-60 overflow-y-auto">
                {sourceResults.map(product => (
                  <button
                    key={product.id}
                    onClick={() => selectSourceProduct(product)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-white/5"
                  >
                    {product.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{sourceProduct.name}</p>
              <p className="text-sm text-foreground/70">{sourceProduct.slug}</p>
            </div>
            <button
              onClick={() => {
                setSourceProduct(null);
                setRecommendations([]);
              }}
              className="text-sm text-red-500 hover:text-red-400"
            >
              Change
            </button>
          </div>
        )}
      </div>
      
      {/* Current recommendations */}
      {sourceProduct && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-4">2. Current Recommendations</h2>
          
          {loading ? (
            <p className="text-sm text-foreground/70">Loading...</p>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-foreground/70">No recommendations yet</p>
          ) : (
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={rec.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-foreground/70">#{idx + 1}</span>
                    <span className="text-sm">{rec.product_name}</span>
                  </div>
                  <button
                    onClick={() => removeRecommendation(rec.id)}
                    disabled={loading}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Add recommendation */}
      {sourceProduct && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-4">3. Add Recommendation</h2>
          
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search for product to recommend..."
              value={recSearch}
              onChange={(e) => {
                setRecSearch(e.target.value);
                searchRecommendProducts(e.target.value);
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
            />
            
            {recResults.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/10 max-h-60 overflow-y-auto">
                {recResults.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addRecommendation(product)}
                    disabled={loading}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-50"
                  >
                    {product.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
