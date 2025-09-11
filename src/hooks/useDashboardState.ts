import { useReducer, useMemo, useCallback } from "react";
import type { Order } from "@/lib/types";

interface DashboardState {
  orders: Order[];
  searchQuery: string;
  isAddModalOpen: boolean;
  isLoading: boolean;
}

type DashboardAction =
  | { type: "SET_ORDERS"; payload: Order[] }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "OPEN_ADD_MODAL" }
  | { type: "CLOSE_ADD_MODAL" }
  | { type: "SET_LOADING"; payload: boolean };

const initialState: DashboardState = {
  orders: [],
  searchQuery: "",
  isAddModalOpen: false,
  isLoading: false,
};

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "SET_ORDERS":
      return { ...state, orders: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "OPEN_ADD_MODAL":
      return { ...state, isAddModalOpen: true };
    case "CLOSE_ADD_MODAL":
      return { ...state, isAddModalOpen: false };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

export function useDashboardState(initialOrders: Order[] = []) {
  const [state, dispatch] = useReducer(dashboardReducer, {
    ...initialState,
    orders: initialOrders,
  });

  const filteredOrders = useMemo(() => {
    if (!state.searchQuery.trim()) return state.orders;
    
    const query = state.searchQuery.toLowerCase();
    return state.orders.filter((order) =>
      order.id.toLowerCase().includes(query) ||
      order.customer.toLowerCase().includes(query) ||
      order.items.some((item) => item.name.toLowerCase().includes(query)) ||
      order.status.toLowerCase().includes(query)
    );
  }, [state.orders, state.searchQuery]);

  const actions = {
    setOrders: useCallback((orders: Order[]) => {
      dispatch({ type: "SET_ORDERS", payload: orders });
    }, []),
    
    setSearchQuery: useCallback((query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: query });
    }, []),
    
    openAddModal: useCallback(() => {
      dispatch({ type: "OPEN_ADD_MODAL" });
    }, []),
    
    closeAddModal: useCallback(() => {
      dispatch({ type: "CLOSE_ADD_MODAL" });
    }, []),
    
    setLoading: useCallback((loading: boolean) => {
      dispatch({ type: "SET_LOADING", payload: loading });
    }, []),
  };

  return {
    ...state,
    filteredOrders,
    actions,
  };
}
