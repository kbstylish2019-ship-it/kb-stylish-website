"use client";

import React, { useState } from "react";
import { Plus, Search, Package, Edit, Trash2, Power, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VendorProductsResponse } from "@/lib/apiClient";
import { toggleProductActive, deleteVendorProduct } from "@/app/actions/vendor";
import AddProductModal from "./AddProductModal";

interface ProductsPageClientProps {
  initialData: VendorProductsResponse;
  userId: string;
}

export default function ProductsPageClient({ initialData, userId }: ProductsPageClientProps) {
  const [products, setProducts] = useState(initialData.products);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleToggleActive = async (productId: string, currentActive: boolean) => {
    setIsLoading(true);
    const newActive = !currentActive;
    const result = await toggleProductActive(productId, newActive);
    
    if (result?.success) {
      // Update local state
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, is_active: newActive } : p
      ));
    } else {
      alert(result?.message || 'Failed to toggle product status');
    }
    setIsLoading(false);
  };
  
  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Are you sure you want to delete "${productName}"? This will deactivate the product.`)) {
      return;
    }
    
    setIsLoading(true);
    const result = await deleteVendorProduct(productId);
    
    // ✅ FIX: Distinguish between actual deletion vs forced deactivation
    if (result?.success) {
      // TRUE SUCCESS: No active orders, product was deleted
      // REMOVE from list (actual deletion)
      setProducts(prev => prev.filter(p => p.id !== productId));
    } else if (result?.message && result.message.includes('deactivated')) {
      // PARTIAL SUCCESS: Had active orders, was deactivated instead
      // KEEP in list but mark as inactive
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, is_active: false } : p
      ));
      // Show explanation
      alert(result?.message || 'Product deactivated due to active orders');
    } else {
      // TRUE ERROR: Something went wrong
      alert(result?.message || 'Failed to delete product');
    }
    setIsLoading(false);
  };
  
  const filteredProducts = searchQuery
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.slug.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : products;
  
  return (
    <>
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[200px] max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
              />
            </div>
          </div>
          
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
        
        {/* Products Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Products</p>
            <div className="mt-2 text-2xl font-semibold">{products.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Active</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-400">
              {products.filter(p => p.is_active).length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Inactive</p>
            <div className="mt-2 text-2xl font-semibold text-red-400">
              {products.filter(p => !p.is_active).length}
            </div>
          </div>
        </div>
        
        {/* Products Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                  <th className="px-4 py-3 w-16"></th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Inventory</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-white/5 p-4">
                          <Package className="h-8 w-8 text-foreground/40" />
                        </div>
                        <div>
                          <p className="text-foreground/80 font-medium">
                            {searchQuery ? `No products found matching "${searchQuery}"` : 'No products yet'}
                          </p>
                          {!searchQuery && (
                            <p className="text-sm text-foreground/60 mt-1">
                              Click "Add Product" to create your first product
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product, idx) => {
                    const primaryImage = product.images.find(img => img.is_primary) || product.images[0];
                    const minPrice = product.variants.length > 0 
                      ? Math.min(...product.variants.map(v => v.price))
                      : 0;
                    
                    return (
                      <tr 
                        key={product.id} 
                        className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}
                      >
                        <td className="px-4 py-3">
                          {primaryImage ? (
                            <img 
                              src={primaryImage.image_url} 
                              alt={product.name}
                              className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                              <ImageIcon className="h-5 w-5 text-foreground/40" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-foreground/60 mt-0.5">
                              {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground/80">
                          {product.category_name}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          NPR {minPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                            product.total_inventory > 10
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              : product.total_inventory > 0
                              ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                              : "bg-red-500/15 text-red-300 ring-red-500/30"
                          )}>
                            {product.total_inventory} in stock
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                            product.is_active
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              : "bg-white/10 text-foreground/80 ring-white/10"
                          )}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleActive(product.id, product.is_active)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              title={product.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <Power className={cn(
                                "h-4 w-4",
                                product.is_active ? "text-emerald-400" : "text-foreground/40"
                              )} />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id, product.name)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Add Product Modal */}
      <AddProductModal 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        userId={userId}
        onSuccess={(newProduct) => {
          // Add new product to list
          setProducts(prev => [newProduct, ...prev]);
          setIsAddModalOpen(false);
        }}
      />
    </>
  );
}
