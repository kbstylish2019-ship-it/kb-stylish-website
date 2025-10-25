'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Tag, Clock, DollarSign, Edit, Power, PowerOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/custom-ui';
import { Badge } from '@/components/ui/custom-ui';
import ServiceFormModal from './ServiceFormModal';
import toast from 'react-hot-toast';

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

export default function ServicesListClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // ========================================================================
  // DATA FETCHING
  // ========================================================================
  
  const fetchServices = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/services?limit=200');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch services');
      }

      setServices(data.services);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // ========================================================================
  // CLIENT-SIDE FILTERING
  // ========================================================================
  
  const filteredServices = useMemo(() => {
    return services.filter(service => {
      // Category filter
      if (categoryFilter !== 'all' && service.category !== categoryFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && !service.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && service.isActive) {
        return false;
      }

      // Search filter
      if (searchInput) {
        const searchLower = searchInput.toLowerCase();
        return (
          service.name.toLowerCase().includes(searchLower) ||
          service.description?.toLowerCase().includes(searchLower) ||
          service.category.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [services, categoryFilter, statusFilter, searchInput]);

  // ========================================================================
  // STATS
  // ========================================================================
  
  const stats = useMemo(() => {
    return {
      total: services.length,
      active: services.filter(s => s.isActive).length,
      inactive: services.filter(s => !s.isActive).length
    };
  }, [services]);

  // ========================================================================
  // HANDLERS
  // ========================================================================
  
  const handleCreate = () => {
    setEditingService(null);
    setShowCreateModal(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setShowCreateModal(true);
  };

  const handleToggleStatus = async (service: Service) => {
    const newStatus = !service.isActive;
    
    // Optimistic update
    setServices(prev => 
      prev.map(s => s.id === service.id ? { ...s, isActive: newStatus } : s)
    );

    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update service');
      }

      toast.success(`Service ${newStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error: any) {
      // Revert on error
      setServices(prev => 
        prev.map(s => s.id === service.id ? { ...s, isActive: service.isActive } : s)
      );
      toast.error(error.message);
    }
  };

  // Note: We use soft delete (deactivate) to preserve historical data
  // Hard delete is disabled to maintain:
  // - Customer booking history
  // - Revenue analytics
  // - Financial compliance (SOX, tax)
  // - Audit trails

  const handleSuccess = (service: Service, isEdit: boolean) => {
    if (isEdit) {
      setServices(prev => prev.map(s => s.id === service.id ? service : s));
      toast.success('Service updated successfully');
    } else {
      setServices(prev => [service, ...prev]);
      toast.success('Service created successfully');
    }
    setShowCreateModal(false);
    setEditingService(null);
  };

  const formatCurrency = (cents: number) => `NPR ${(cents / 100).toFixed(2)}`;

  // ========================================================================
  // RENDER
  // ========================================================================
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Service Management</h2>
          <p className="text-sm text-foreground/70 mt-1">
            Manage services available for booking
          </p>
        </div>
        
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          New Service
        </Button>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 ring-1 ring-blue-500/10">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-400 mb-1">
              About Service Deactivation
            </h3>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Services are never permanently deleted to preserve customer booking history, financial records, and audit trails. 
              Deactivating a service hides it from new bookings while maintaining all historical data. 
              You can reactivate a service anytime.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-xs font-medium text-foreground/70">Total Services</p>
          <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-xs font-medium text-foreground/70">Active</p>
          <div className="mt-2 text-2xl font-semibold text-emerald-400">{stats.active}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-xs font-medium text-foreground/70">Inactive</p>
          <div className="mt-2 text-2xl font-semibold text-gray-400">{stats.inactive}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50" />
          <input
            type="search"
            placeholder="Search services..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-foreground/60">
          Loading services...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 ring-1 ring-red-500/10">
          <p className="text-red-400">{error}</p>
          <Button onClick={fetchServices} variant="outline" className="mt-4">
            Try Again
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredServices.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center ring-1 ring-white/10">
          <p className="text-lg font-medium text-foreground">No services found</p>
          <p className="text-sm text-foreground/70 mt-1">
            {searchInput || categoryFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first service to get started'}
          </p>
          {!searchInput && categoryFilter === 'all' && statusFilter === 'all' && (
            <Button onClick={handleCreate} className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Create Service
            </Button>
          )}
        </div>
      )}

      {/* Services Grid */}
      {!loading && !error && filteredServices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/8 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground">{service.name}</h3>
                  <Badge
                    className={`mt-2 ${
                      service.isActive
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                    }`}
                  >
                    {service.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              {/* Description */}
              {service.description && (
                <p className="text-sm text-foreground/70 mb-4">
                  {service.description}
                </p>
              )}

              {/* Details */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/70 mb-4">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  {CATEGORY_LABELS[service.category] || service.category}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {service.durationMinutes} min
                </span>
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <DollarSign className="w-4 h-4" />
                  {formatCurrency(service.basePriceCents)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleEdit(service)}
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  onClick={() => handleToggleStatus(service)}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  title={service.isActive ? 'Deactivate Service' : 'Activate Service'}
                >
                  {service.isActive ? (
                    <>
                      <PowerOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Deactivate</span>
                    </>
                  ) : (
                    <>
                      <Power className="w-4 h-4" />
                      <span className="hidden sm:inline">Activate</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service Form Modal */}
      <ServiceFormModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingService(null);
        }}
        onSuccess={handleSuccess}
        service={editingService}
      />
    </div>
  );
}
