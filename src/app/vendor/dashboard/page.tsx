"use client";

import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatCard from "@/components/vendor/StatCard";
import OrdersTable from "@/components/vendor/OrdersTable";
import AddProductModal from "@/components/vendor/AddProductModal";
import { useVendorDashboard } from "@/hooks/useVendorDashboard";
import type { Order } from "@/lib/types";
import { BarChart3, Package, Wallet, AlertTriangle, Plus } from "lucide-react";

function VendorSidebar() {
  const items = [
    { id: "dashboard", label: "Dashboard", href: "/vendor/dashboard" },
    { id: "products", label: "Products", href: "/vendor/products" },
    { id: "orders", label: "Orders", href: "/vendor/orders" },
    { id: "payouts", label: "Payouts", href: "/vendor/payouts" },
    { id: "analytics", label: "Analytics", href: "/vendor/analytics" },
    { id: "support", label: "Support", href: "/vendor/support" },
    { id: "settings", label: "Settings", href: "/vendor/settings" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <a
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

const mockOrdersBase: Order[] = [
  {
    id: "ORD-1001",
    date: new Date().toISOString(),
    customer: "Sujan Thapa",
    items: [
      { name: "Classic Denim Jacket", quantity: 1 },
      { name: "Himalayan Wool Scarf", quantity: 1 },
    ],
    total: 8498,
    status: "Processing",
    payout: "Unpaid",
  },
  {
    id: "ORD-1000",
    date: new Date(Date.now() - 86400000).toISOString(),
    customer: "Ritika Sharma",
    items: [{ name: "Silk Saree - Royal Plum", quantity: 1 }],
    total: 7999,
    status: "Delivered",
    payout: "Paid",
  },
  {
    id: "ORD-0999",
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    customer: "Bikash Tamang",
    items: [{ name: "Athleisure Joggers", quantity: 2 }],
    total: 3998,
    status: "Shipped",
    payout: "Processing",
  },
];

// Add more historical orders to exercise pagination (older than the base 3)
const extraOrders: Order[] = Array.from({ length: 12 }, (_, i) => {
  const idx = i + 1; // 1..12
  const daysAgo = 2 + idx; // start from 3 days ago onwards
  const idNum = 999 - idx; // 998..987
  return {
    id: `ORD-0${idNum.toString().padStart(3, "0")}`,
    date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    customer: `Customer ${idNum}`,
    items: [{ name: "Sample Item", quantity: 1 }],
    total: 3000 + idx * 10,
    status: idx % 5 === 0 ? "Cancelled" : idx % 3 === 0 ? "Pending" : "Processing",
    payout: idx % 2 === 0 ? "Unpaid" : "Paid",
  } as Order;
});

const mockOrders: Order[] = [...mockOrdersBase, ...extraOrders];

export default function VendorDashboardPage() {
  const { state, filteredOrders, paginatedOrders, totalPages, actions } = useVendorDashboard(mockOrders);

  const cta = (
    <button
      onClick={actions.openAddModal}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-accent-gold)_85%,black)] to-[var(--kb-accent-gold)] hover:from-[var(--kb-accent-gold)] hover:to-[var(--kb-accent-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-primary-brand)]"
    >
      <Plus className="h-4 w-4 text-black" aria-hidden />
      <span className="text-black">Add Product/Service</span>
    </button>
  );

  return (
    <>
      <DashboardLayout title="Vendor Dashboard" actions={cta} sidebar={<VendorSidebar />}> 
        {/* Stat Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Today's Bookings" value={32} subtitle="+6 vs yesterday" trend={{ label: "+23%", direction: "up" }} icon={<BarChart3 className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
          <StatCard title="Monthly Earnings" value={"NPR 2,45,000"} subtitle="Jan 1 - Current" trend={{ label: "+8% MoM", direction: "up" }} icon={<Wallet className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
          <StatCard title="Orders Pending" value={12} subtitle="Awaiting fulfillment" trend={{ label: "-3 today", direction: "flat" }} icon={<Package className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
          <StatCard title="Low Inventory" value={5} subtitle="> 10 units" trend={{ label: "Review now", direction: "down" }} icon={<AlertTriangle className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
        </div>

        {/* Snapshot & Tips */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Payouts Snapshot</h2>
              <a className="text-sm text-[var(--kb-accent-gold)] hover:underline" href="/vendor/payouts">View all</a>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard title="Next Payout" value={"NPR 58,400"} subtitle="Scheduled: Aug 20" />
              <StatCard title="Pending Balance" value={"NPR 1,24,700"} subtitle="Processing orders" />
              <StatCard title="Paid This Month" value={"NPR 1,86,300"} subtitle="Completed" />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <h2 className="text-lg font-semibold">Tips</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground/80">
              <li>Use lifestyle images for higher conversion.</li>
              <li>Offer limited-time bundles during festivals.</li>
              <li>Respond to messages within 1 hour for a "Top Rated" badge.</li>
            </ul>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Orders</h2>
            <a className="text-sm text-[var(--kb-accent-gold)] hover:underline" href="/vendor/orders">View all</a>
          </div>
          <OrdersTable 
            orders={paginatedOrders}
            searchQuery={state.searchQuery}
            onSearchChange={actions.setSearchQuery}
            currentPage={state.currentPage}
            totalPages={totalPages}
            pageSize={state.pageSize}
            onPageChange={actions.setPage}
            onPageSizeChange={actions.setPageSize}
            totalOrders={filteredOrders.length}
          />
        </div>
      </DashboardLayout>
      
      {/* Add Product Modal */}
      <AddProductModal 
        open={state.isAddModalOpen}
        onClose={actions.closeAddModal}
      />
    </>
  );
}
