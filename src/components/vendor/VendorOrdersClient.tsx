"use client";

import React, { useState } from "react";
import { Package, Search, Clock, CheckCircle, Truck, Calendar, Edit2, Save, X } from "lucide-react";
import { updateFulfillmentStatus } from "@/actions/vendor/fulfillment";
import { useRouter } from "next/navigation";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  currency: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address_line1: string;
  shipping_address_line2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  notes?: string;
  created_at: string;
  confirmed_at?: string;
  shipped_at?: string;
  delivered_at?: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  variant_sku: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  fulfillment_status: string;
  tracking_number?: string | null;
  shipping_carrier?: string | null;
  created_at: string;
  orders: Order | Order[];
}

interface VendorOrdersClientProps {
  orderItems: OrderItem[];
}

export default function VendorOrdersClient({ orderItems }: VendorOrdersClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Normalize orders (handle both single order and array)
  const normalizedItems = orderItems.map(item => ({
    ...item,
    orders: Array.isArray(item.orders) ? item.orders[0] : item.orders
  }));

  // Group order items by order_id
  const groupedOrders = normalizedItems.reduce((acc, item) => {
    // Handle case where orders might be null due to RLS
    // Create a placeholder order object from order_item data
    const orderData = item.orders || {
      id: item.order_id,
      order_number: `ORD-${item.order_id.slice(0, 8)}`,
      status: 'unknown',
      total_cents: item.total_price_cents,
      currency: 'NPR',
      shipping_name: 'N/A',
      shipping_phone: 'N/A',
      shipping_address_line1: 'N/A',
      shipping_city: 'N/A',
      shipping_state: 'N/A',
      shipping_postal_code: 'N/A',
      shipping_country: 'Nepal',
      created_at: item.created_at,
    };
    
    if (!acc[item.order_id]) {
      acc[item.order_id] = {
        order: orderData,
        items: [],
      };
    }
    acc[item.order_id].items.push(item);
    return acc;
  }, {} as Record<string, { order: Order; items: OrderItem[] }>);

  const orders = Object.values(groupedOrders);

  // Filter orders
  const filteredOrders = orders.filter((orderGroup) => {
    const matchesSearch =
      orderGroup.order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      orderGroup.order.shipping_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      orderGroup.items.some((item) =>
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesStatus =
      selectedStatus === "all" ||
      orderGroup.items.some((item) => item.fulfillment_status === selectedStatus);

    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) =>
    o.items.some((i) => i.fulfillment_status === "pending")
  ).length;
  const shippedOrders = orders.filter((o) =>
    o.items.some((i) => i.fulfillment_status === "shipped")
  ).length;
  const deliveredOrders = orders.filter((o) =>
    o.items.every((i) => i.fulfillment_status === "delivered")
  ).length;

  const formatPrice = (cents: number, currency: string) => {
    // Convert cents to currency (divide by 100)
    const amount = (cents / 100).toFixed(2);
    return `${currency} ${amount}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "shipped":
        return <Truck className="h-4 w-4" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "processing":
        return "text-blue-400 bg-blue-400/10 border-blue-400/20";
      case "shipped":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "delivered":
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "cancelled":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      default:
        return "text-slate-400 bg-slate-400/10 border-slate-400/20";
    }
  };

  const handleEditItem = (itemId: string, currentStatus: string) => {
    setEditingItem(itemId);
    setNewStatus(currentStatus);
    setTrackingNumber("");
    setShippingCarrier("");
    setUpdateError(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setNewStatus("");
    setTrackingNumber("");
    setShippingCarrier("");
    setUpdateError(null);
  };

  const handleSaveStatus = async (itemId: string) => {
    setIsUpdating(true);
    setUpdateError(null);

    // Frontend validation for shipped status
    if (newStatus === 'shipped' && (!trackingNumber.trim() || !shippingCarrier.trim())) {
      setUpdateError('Tracking number and carrier are required for shipped status');
      setIsUpdating(false);
      return;
    }

    const result = await updateFulfillmentStatus({
      orderItemId: itemId,
      newStatus: newStatus as any,
      trackingNumber: trackingNumber || undefined,
      shippingCarrier: shippingCarrier || undefined,
    });

    setIsUpdating(false);

    if (result.success) {
      setEditingItem(null);
      setNewStatus("");
      setTrackingNumber("");
      setShippingCarrier("");
      router.refresh();
    } else {
      setUpdateError(result.message);
    }
  };

  // Helper function to get allowed next statuses based on current status
  const getAllowedStatuses = (currentStatus: string): Array<{value: string, label: string}> => {
    const statusMap: Record<string, Array<{value: string, label: string}>> = {
      'pending': [
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'cancelled', label: 'Cancelled' }
      ],
      'processing': [
        { value: 'processing', label: 'Processing' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'cancelled', label: 'Cancelled' }
      ],
      'shipped': [
        { value: 'shipped', label: 'Shipped' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' }
      ],
      'delivered': [
        { value: 'delivered', label: 'Delivered (Final)' }
      ],
      'cancelled': [
        { value: 'cancelled', label: 'Cancelled (Final)' }
      ]
    };
    
    return statusMap[currentStatus] || [{ value: currentStatus, label: currentStatus }];
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
          <div className="text-sm font-medium text-foreground/60 mb-2">Total Orders</div>
          <div className="text-3xl font-bold text-foreground">{totalOrders}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
          <div className="text-sm font-medium text-foreground/60 mb-2">Pending</div>
          <div className="text-3xl font-bold text-amber-500">{pendingOrders}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
          <div className="text-sm font-medium text-foreground/60 mb-2">Shipped</div>
          <div className="text-3xl font-bold text-blue-500">{shippedOrders}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
          <div className="text-sm font-medium text-foreground/60 mb-2">Delivered</div>
          <div className="text-3xl font-bold text-emerald-500">{deliveredOrders}</div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
            <input
              type="text"
              placeholder="Search by order #, customer, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background/50 border border-white/10 rounded-xl text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] focus:border-transparent transition-all"
            />
          </div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2.5 bg-background/50 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] focus:border-transparent transition-all [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 ring-1 ring-white/10 text-center">
          <Package className="h-16 w-16 text-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-foreground">No orders found</h3>
          <p className="text-sm text-foreground/60">
            {searchQuery || selectedStatus !== "all"
              ? "Try adjusting your search or filter"
              : "Orders will appear here once customers purchase your products"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(({ order, items }) => (
            <div
              key={order.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10 hover:border-[var(--kb-primary-brand)]/50 hover:bg-white/[0.07] transition-all duration-200"
            >
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 pb-5 border-b border-white/10">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-bold text-foreground">#{order.order_number}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 border ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {getStatusIcon(order.status)}
                      <span className="capitalize">{order.status}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground/60">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(order.created_at)}</span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {formatPrice(order.total_cents, order.currency)}
                  </div>
                  <p className="text-sm text-foreground/60">
                    {items.reduce((sum, item) => sum + item.quantity, 0)} {items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-3 mb-5">
                <div className="text-sm font-semibold text-foreground/80 mb-3">Items</div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 bg-background/30 rounded-xl border border-white/5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <h4 className="font-semibold text-foreground">{item.product_name}</h4>
                        <p className="text-xs text-foreground/50">
                          SKU: {item.variant_sku} • Quantity: {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:flex-row-reverse">
                        <div className="text-right">
                          <div className="font-bold text-foreground">
                            {formatPrice(item.total_price_cents, order.currency)}
                          </div>
                          <div className="text-xs text-foreground/50">
                            {formatPrice(item.unit_price_cents, order.currency)} each
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(
                            item.fulfillment_status
                          )}`}
                        >
                          {item.fulfillment_status}
                        </span>
                      </div>
                    </div>

                    {/* Edit Mode */}
                    {editingItem === item.id ? (
                      <div className="space-y-3 pt-3 border-t border-white/10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-foreground/70 mb-1">
                              Status
                            </label>
                            <select
                              value={newStatus}
                              onChange={(e) => setNewStatus(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
                              disabled={isUpdating}
                            >
                              {getAllowedStatuses(item.fulfillment_status).map(status => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-foreground/50">
                              {item.fulfillment_status === 'delivered' || item.fulfillment_status === 'cancelled'
                                ? 'Final status - cannot be changed'
                                : 'Select next status in workflow'}
                            </p>
                          </div>
                          {newStatus === 'shipped' && (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-foreground/70 mb-1">
                                  Carrier <span className="text-red-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={shippingCarrier}
                                  onChange={(e) => setShippingCarrier(e.target.value)}
                                  placeholder="e.g., Pathao Express, Nepal Post"
                                  className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                                  disabled={isUpdating}
                                  required
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-foreground/70 mb-1">
                                  Tracking Number <span className="text-red-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={trackingNumber}
                                  onChange={(e) => setTrackingNumber(e.target.value)}
                                  placeholder="e.g., PTH-KTM-12345, RR123456789NP"
                                  className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
                                  disabled={isUpdating}
                                  required
                                />
                                <p className="mt-1 text-xs text-blue-400">
                                  💡 Tracking number from courier company (required for shipped status)
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                        {updateError && (
                          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                            {updateError}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveStatus(item.id)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-xs font-medium text-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Save className="h-3 w-3" />
                            {isUpdating ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-foreground/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleEditItem(item.id, item.fulfillment_status)}
                          disabled={item.fulfillment_status === 'delivered' || item.fulfillment_status === 'cancelled'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-foreground/70 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="h-3 w-3" />
                          {item.fulfillment_status === 'delivered' || item.fulfillment_status === 'cancelled' 
                            ? 'Status Locked' 
                            : 'Update Status'}
                        </button>
                        {(item.tracking_number || item.shipping_carrier) && (
                          <div className="text-xs text-foreground/50">
                            {item.shipping_carrier && <span>📦 {item.shipping_carrier}</span>}
                            {item.tracking_number && <span className="ml-2">🔍 {item.tracking_number}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Shipping Info */}
              <div className="pt-5 border-t border-white/10">
                <div className="text-sm font-semibold text-foreground/80 mb-3">Shipping Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-foreground/50">Customer</div>
                    <div className="text-foreground">{order.shipping_name}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-foreground/50">Phone</div>
                    <div className="text-foreground">{order.shipping_phone}</div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-xs font-medium text-foreground/50">Address</div>
                    <div className="text-foreground">
                      {order.shipping_address_line1}
                      {order.shipping_address_line2 && `, ${order.shipping_address_line2}`}
                      <br />
                      {order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}
                      <br />
                      {order.shipping_country}
                    </div>
                  </div>
                  {order.notes && (
                    <div className="space-y-1 sm:col-span-2">
                      <div className="text-xs font-medium text-blue-400">Delivery Instructions</div>
                      <div className="text-foreground bg-blue-500/10 border border-blue-500/20 p-2 rounded">
                        {order.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
