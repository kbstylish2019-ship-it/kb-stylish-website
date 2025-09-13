import React from "react";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

function formatCurrency(npr: number) {
  try {
    return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(npr);
  } catch {
    return `NPR ${npr.toLocaleString()}`;
  }
}

function StatusBadge({ label }: { label: Order["status"] }) {
  const map: Record<Order["status"], string> = {
    Pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    Processing: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    Shipped: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
    Delivered: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    Cancelled: "bg-red-500/15 text-red-300 ring-red-500/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", map[label])}>{label}</span>
  );
}

function PayoutBadge({ label }: { label: Order["payout"] }) {
  const map: Record<Order["payout"], string> = {
    Unpaid: "bg-white/10 text-foreground/80 ring-white/10",
    Processing: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    Paid: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", map[label])}>{label}</span>
  );
}

export interface OrdersTableProps {
  orders: Order[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  className?: string;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  totalOrders?: number;
}

export default function OrdersTable({ orders, searchQuery, onSearchChange, isLoading, className, currentPage = 1, totalPages = 1, pageSize = 10, onPageChange, onPageSizeChange, totalOrders = 0 }: OrdersTableProps) {
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalOrders);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Controls Row */}
      <div className="flex flex-wrap gap-3">
        {onSearchChange && (
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="orders-search-input" className="sr-only">Search orders</label>
            <input
              id="orders-search-input"
              type="text"
              value={searchQuery || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search orders by ID, customer, items, or status..."
              aria-label="Search orders"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
              data-testid="orders-search-input"
            />
          </div>
        )}

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
            data-testid="page-size-select"
          >
            <option value="5">5 per page</option>
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
          </select>
        )}
      </div>
      
      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10" data-testid="orders-table">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payout</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                    {searchQuery ? `No orders found matching "${searchQuery}"` : "No orders found"}
                  </td>
                </tr>
              ) : (
                orders.map((o, idx) => (
                  <tr key={o.id} className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}>
                    <td className="px-4 py-3 font-medium">{o.id}</td>
                    <td className="px-4 py-3 text-foreground/80">{new Date(o.date).toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-3 text-foreground/80">{o.customer}</td>
                    <td className="px-4 py-3 text-foreground/80">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</td>
                    <td className="px-4 py-3">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-3"><StatusBadge label={o.status} /></td>
                    <td className="px-4 py-3"><PayoutBadge label={o.payout} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {onPageChange && totalPages! > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-foreground/60">
            Showing {startIndex} to {endIndex} of {totalOrders} orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    aria-current={pageNum === currentPage ? "page" : undefined}
                    aria-label={`Go to page ${pageNum}`}
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm ring-1",
                      pageNum === currentPage
                        ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]/50 text-[var(--kb-primary-brand)]"
                        : "ring-white/10 hover:bg-white/5"
                    )}
                    data-testid={`page-${pageNum}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
