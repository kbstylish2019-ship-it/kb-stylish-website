"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Order } from "@/lib/types";

const OrdersTable = dynamic(() => import("@/components/vendor/OrdersTable"), {
  loading: () => <div className="h-96 animate-pulse rounded-lg bg-white/5" />
});

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

export default function VendorOrdersSection() {
  const [state, setState] = React.useState({
    currentPage: 1,
    pageSize: 10,
    searchQuery: "",
  });

  const filteredOrders = React.useMemo(() => {
    let out = [...mockOrders];
    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((o) => {
        const itemNames = o.items.map((i) => i.name).join(", ");
        return (
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          itemNames.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q) ||
          o.payout.toLowerCase().includes(q)
        );
      });
    }
    return out;
  }, [state.searchQuery]);

  const totalPages = Math.ceil(filteredOrders.length / state.pageSize) || 1;

  const paginatedOrders = React.useMemo(() => {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, state.currentPage, state.pageSize]);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Orders</h2>
        <Link className="text-sm text-[var(--kb-accent-gold)] hover:underline" href="/vendor/orders">View all</Link>
      </div>
      <OrdersTable 
        orders={paginatedOrders}
        searchQuery={state.searchQuery}
        onSearchChange={(query: string) => setState((s) => ({ ...s, searchQuery: query, currentPage: 1 }))}
        currentPage={state.currentPage}
        totalPages={totalPages}
        pageSize={state.pageSize}
        onPageChange={(page: number) => setState((s) => ({ ...s, currentPage: page }))}
        onPageSizeChange={(size: number) => setState((s) => ({ ...s, pageSize: size, currentPage: 1 }))}
        totalOrders={filteredOrders.length}
      />
    </div>
  );
}
