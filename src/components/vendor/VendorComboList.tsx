'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { COMBO_CONFIG } from '@/lib/constants/combo';
import { toggleComboActive } from '@/app/actions/combo';
import { formatNPR, cn } from '@/lib/utils';

interface ComboItem {
  id: string;
  constituent_variant_id: string;
  quantity: number;
  display_order: number;
}

interface Combo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  is_combo: boolean;
  combo_price_cents: number;
  combo_savings_cents: number;
  combo_quantity_limit: number | null;
  combo_quantity_sold: number;
  created_at: string;
  combo_items: ComboItem[];
}

interface VendorComboListProps {
  initialCombos: Combo[];
  vendorId: string;
}

export default function VendorComboList({ initialCombos, vendorId }: VendorComboListProps) {
  const [combos, setCombos] = useState<Combo[]>(initialCombos);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleActive = async (comboId: string, currentActive: boolean) => {
    setTogglingId(comboId);
    try {
      const result = await toggleComboActive(comboId, !currentActive);
      if (result.success) {
        setCombos((prev) =>
          prev.map((c) => (c.id === comboId ? { ...c, is_active: !currentActive } : c))
        );
      }
    } catch (error) {
      console.error('Failed to toggle combo:', error);
    } finally {
      setTogglingId(null);
    }
  };

  const getAvailability = (combo: Combo) => {
    if (combo.combo_quantity_limit === null) return { available: true, remaining: null };
    const remaining = combo.combo_quantity_limit - combo.combo_quantity_sold;
    return { available: remaining > 0, remaining };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Combo Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage product bundles with special pricing
          </p>
        </div>
        <Link
          href="/vendor/combos/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Combo
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Combos</p>
              <p className="text-xl font-bold text-gray-900">{combos.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ToggleRight className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-xl font-bold text-gray-900">
                {combos.filter((c) => c.is_active).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sold</p>
              <p className="text-xl font-bold text-gray-900">
                {combos.reduce((sum, c) => sum + c.combo_quantity_sold, 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Low Stock</p>
              <p className="text-xl font-bold text-gray-900">
                {
                  combos.filter((c) => {
                    const { remaining } = getAvailability(c);
                    return remaining !== null && remaining <= 3 && remaining > 0;
                  }).length
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Combo List */}
      {combos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No combos yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first combo to offer bundled products at a discount.
          </p>
          <Link
            href="/vendor/combos/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            Create Your First Combo
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Combo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Savings
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Availability
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {combos.map((combo) => {
                const { available, remaining } = getAvailability(combo);
                return (
                  <tr key={combo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-lg">
                          <Package className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{combo.name}</p>
                          <p className="text-xs text-gray-500">
                            {(combo.combo_items || []).length} items
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">
                        {formatNPR(combo.combo_price_cents / 100)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {formatNPR(combo.combo_savings_cents / 100)} off
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {remaining === null ? (
                        <span className="text-sm text-gray-500">Unlimited</span>
                      ) : remaining <= 0 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Sold Out
                        </span>
                      ) : remaining <= 3 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          {remaining} left
                        </span>
                      ) : (
                        <span className="text-sm text-gray-700">
                          {remaining} / {combo.combo_quantity_limit}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleToggleActive(combo.id, combo.is_active)}
                        disabled={togglingId === combo.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors',
                          combo.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {combo.is_active ? (
                          <>
                            <ToggleRight className="h-3.5 w-3.5" />
                            Active
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-3.5 w-3.5" />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/vendor/combos/${combo.id}/edit`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
