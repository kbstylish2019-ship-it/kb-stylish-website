import { useReducer, useMemo, useCallback } from "react";
import type { Order, OrderStatus, PayoutStatus } from "@/lib/types";

export interface VendorDashboardState {
  orders: Order[];
  searchQuery: string;
  statusFilter: OrderStatus | "all";
  payoutFilter: PayoutStatus | "all";
  currentPage: number;
  pageSize: number;
  sortBy: keyof Order;
  sortOrder: "asc" | "desc";
  isAddModalOpen: boolean;
}

export type VendorDashboardAction =
  | { type: "SET_ORDERS"; payload: Order[] }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_STATUS_FILTER"; payload: OrderStatus | "all" }
  | { type: "SET_PAYOUT_FILTER"; payload: PayoutStatus | "all" }
  | { type: "SET_PAGE"; payload: number }
  | { type: "SET_PAGE_SIZE"; payload: number }
  | { type: "SET_SORT"; payload: { sortBy: keyof Order; sortOrder: "asc" | "desc" } }
  | { type: "OPEN_ADD_MODAL" }
  | { type: "CLOSE_ADD_MODAL" }
  | { type: "RESET_FILTERS" };

function vendorDashboardReducer(state: VendorDashboardState, action: VendorDashboardAction): VendorDashboardState {
  switch (action.type) {
    case "SET_ORDERS":
      return { ...state, orders: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload, currentPage: 1 };
    case "SET_STATUS_FILTER":
      return { ...state, statusFilter: action.payload, currentPage: 1 };
    case "SET_PAYOUT_FILTER":
      return { ...state, payoutFilter: action.payload, currentPage: 1 };
    case "SET_PAGE":
      return { ...state, currentPage: action.payload };
    case "SET_PAGE_SIZE":
      return { ...state, pageSize: action.payload, currentPage: 1 };
    case "SET_SORT":
      return { ...state, ...action.payload };
    case "OPEN_ADD_MODAL":
      return { ...state, isAddModalOpen: true };
    case "CLOSE_ADD_MODAL":
      return { ...state, isAddModalOpen: false };
    case "RESET_FILTERS":
      return { ...state, searchQuery: "", statusFilter: "all", payoutFilter: "all", currentPage: 1 };
    default:
      return state;
  }
}

export function useVendorDashboard(initialOrders: Order[]) {
  const [state, dispatch] = useReducer(vendorDashboardReducer, {
    orders: initialOrders,
    searchQuery: "",
    statusFilter: "all" as const,
    payoutFilter: "all" as const,
    currentPage: 1,
    pageSize: 10,
    sortBy: "date" as const,
    sortOrder: "desc" as const,
    isAddModalOpen: false,
  });

  // Memoized filtered and sorted orders
  const filteredOrders = useMemo(() => {
    let filtered = [...state.orders];

    // Search by id, customer, item names, status, and payout
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter((o) =>
        o.id.toLowerCase().includes(query) ||
        o.customer.toLowerCase().includes(query) ||
        o.items.some((i) => i.name.toLowerCase().includes(query)) ||
        o.status.toLowerCase().includes(query) ||
        o.payout.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (state.statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === state.statusFilter);
    }

    // Payout filter
    if (state.payoutFilter !== "all") {
      filtered = filtered.filter((o) => o.payout === state.payoutFilter);
    }

    // Sorting
    filtered.sort((a, b) => {
      const aVal = a[state.sortBy] as string | number | undefined;
      const bVal = b[state.sortBy] as string | number | undefined;

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return state.sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [state.orders, state.searchQuery, state.statusFilter, state.payoutFilter, state.sortBy, state.sortOrder]);

  // Pagination
  const paginatedOrders = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = startIndex + state.pageSize;
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, state.currentPage, state.pageSize]);

  const totalPages = Math.ceil(filteredOrders.length / state.pageSize) || 1;

  // Action creators
  const actions = {
    setOrders: useCallback((orders: Order[]) => {
      dispatch({ type: "SET_ORDERS", payload: orders });
    }, []),

    setSearchQuery: useCallback((query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: query });
    }, []),

    setStatusFilter: useCallback((status: OrderStatus | "all") => {
      dispatch({ type: "SET_STATUS_FILTER", payload: status });
    }, []),

    setPayoutFilter: useCallback((payout: PayoutStatus | "all") => {
      dispatch({ type: "SET_PAYOUT_FILTER", payload: payout });
    }, []),

    setPage: useCallback((page: number) => {
      dispatch({ type: "SET_PAGE", payload: page });
    }, []),

    setPageSize: useCallback((size: number) => {
      dispatch({ type: "SET_PAGE_SIZE", payload: size });
    }, []),

    setSort: useCallback((sortBy: keyof Order, sortOrder: "asc" | "desc") => {
      dispatch({ type: "SET_SORT", payload: { sortBy, sortOrder } });
    }, []),

    openAddModal: useCallback(() => {
      dispatch({ type: "OPEN_ADD_MODAL" });
    }, []),

    closeAddModal: useCallback(() => {
      dispatch({ type: "CLOSE_ADD_MODAL" });
    }, []),

    resetFilters: useCallback(() => {
      dispatch({ type: "RESET_FILTERS" });
    }, []),
  };

  return {
    state,
    filteredOrders,
    paginatedOrders,
    totalPages,
    actions,
  };
}
