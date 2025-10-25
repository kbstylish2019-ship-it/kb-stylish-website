"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/categoryApi";

interface CategoriesPageClientProps {
  initialCategories: Category[];
}

export default function CategoriesPageClient({ initialCategories }: CategoriesPageClientProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    parent_id: '',
    description: '',
    image_url: '',
    sort_order: 0,
  });
  
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id || '',
        description: category.description || '',
        image_url: category.image_url || '',
        sort_order: category.sort_order,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        slug: '',
        parent_id: '',
        description: '',
        image_url: '',
        sort_order: 0,
      });
    }
    setIsModalOpen(true);
  };
  
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };
  
  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: editingCategory ? prev.slug : generateSlug(name),
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const url = editingCategory
        ? '/api/admin/categories/update'
        : '/api/admin/categories/create';
      
      const payload = editingCategory
        ? { category_id: editingCategory.id, ...formData }
        : formData;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast(result.message, 'success');
        setIsModalOpen(false);
        // Refresh categories
        window.location.reload();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      showToast('Failed to save category', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDelete = async (category: Category) => {
    if (!confirm(`Are you sure you want to deactivate "${category.name}"? This will hide it from filters.`)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/admin/categories/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: category.id }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast(result.message, 'success');
        // Refresh categories
        window.location.reload();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      showToast('Failed to delete category', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleReactivate = async (category: Category) => {
    if (!confirm(`Reactivate "${category.name}"? This will make it visible in filters again.`)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/admin/categories/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category_id: category.id,
          is_active: true
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast('Category reactivated successfully', 'success');
        // Refresh categories
        window.location.reload();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      showToast('Failed to reactivate category', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Build hierarchy
  const rootCategories = categories.filter(c => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter(c => c.parent_id === parentId);
  
  return (
    <>
      <div className="space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div 
            className={cn(
              "fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 shadow-lg",
              toast.type === 'success' 
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/20 bg-red-500/10 text-red-300"
            )}
          >
            {toast.message}
          </div>
        )}
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Categories</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Manage product categories for your marketplace
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>
        
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Categories</p>
            <div className="mt-2 text-2xl font-semibold">{categories.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Active</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-400">
              {categories.filter(c => c.is_active).length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Products</p>
            <div className="mt-2 text-2xl font-semibold">
              {categories.reduce((sum, c) => sum + c.product_count, 0)}
            </div>
          </div>
        </div>
        
        {/* Categories Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[960px] text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Sort Order</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rootCategories.map((category, idx) => (
                  <React.Fragment key={category.id}>
                    <tr className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FolderTree className="h-4 w-4 text-foreground/40" />
                          <span className="font-medium">{category.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground/60 font-mono text-xs">{category.slug}</td>
                      <td className="px-4 py-3 text-foreground/80">{category.product_count}</td>
                      <td className="px-4 py-3 text-foreground/60">{category.sort_order}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs ring-1",
                          category.is_active
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                            : "bg-gray-500/15 text-gray-300 ring-gray-500/30"
                        )}>
                          {category.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!category.is_active && (
                            <button
                              onClick={() => handleReactivate(category)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              title="Reactivate"
                            >
                              <Plus className="h-4 w-4 text-emerald-400" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenModal(category)}
                            className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4 text-blue-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(category)}
                            className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                            title="Delete"
                            disabled={category.product_count > 0}
                          >
                            <Trash2 className={cn(
                              "h-4 w-4",
                              category.product_count > 0 ? "text-gray-600" : "text-red-400"
                            )} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Subcategories */}
                    {getChildren(category.id).map((child) => (
                      <tr key={child.id} className="bg-white/[0.01]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 pl-8">
                            <span className="text-foreground/40">└─</span>
                            <span className="text-sm">{child.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground/60 font-mono text-xs">{child.slug}</td>
                        <td className="px-4 py-3 text-foreground/80">{child.product_count}</td>
                        <td className="px-4 py-3 text-foreground/60">{child.sort_order}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs ring-1",
                            child.is_active
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              : "bg-gray-500/15 text-gray-300 ring-gray-500/30"
                          )}>
                            {child.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {!child.is_active && (
                              <button
                                onClick={() => handleReactivate(child)}
                                className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                title="Reactivate"
                              >
                                <Plus className="h-4 w-4 text-emerald-400" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenModal(child)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                            >
                              <Pencil className="h-4 w-4 text-blue-400" />
                            </button>
                            <button
                              onClick={() => handleDelete(child)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              disabled={child.product_count > 0}
                            >
                              <Trash2 className={cn(
                                "h-4 w-4",
                                child.product_count > 0 ? "text-gray-600" : "text-red-400"
                              )} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-background p-6 shadow-xl ring-1 ring-white/10">
            <h3 className="text-lg font-semibold mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                  placeholder="e.g., Casual Wear"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Slug *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                  placeholder="casual-wear"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Parent Category</label>
                <select
                  value={formData.parent_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, parent_id: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
                >
                  <option value="">None (Top Level)</option>
                  {rootCategories
                    .filter(c => c.id !== editingCategory?.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                  placeholder="Optional category description"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                />
              </div>
              
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full px-4 py-2 text-sm font-medium hover:bg-white/5"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
