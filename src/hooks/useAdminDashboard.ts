import { useReducer, useMemo, useCallback } from "react";
import type { AdminUser, UserRole, AccountStatus } from "@/lib/types";

export interface AdminDashboardState {
  users: AdminUser[];
  searchQuery: string;
  roleFilter: UserRole | "all";
  statusFilter: AccountStatus | "all";
  currentPage: number;
  pageSize: number;
  sortBy: keyof AdminUser;
  sortOrder: "asc" | "desc";
}

export type AdminDashboardAction =
  | { type: "SET_USERS"; payload: AdminUser[] }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_ROLE_FILTER"; payload: UserRole | "all" }
  | { type: "SET_STATUS_FILTER"; payload: AccountStatus | "all" }
  | { type: "SET_PAGE"; payload: number }
  | { type: "SET_PAGE_SIZE"; payload: number }
  | { type: "SET_SORT"; payload: { sortBy: keyof AdminUser; sortOrder: "asc" | "desc" } }
  | { type: "UPDATE_USER_STATUS"; payload: { userId: string; status: AccountStatus } }
  | { type: "RESET_FILTERS" };

/**
 * Reducer for admin dashboard state management.
 * Handles user filtering, pagination, sorting, and status updates.
 * 
 * @param state - Current dashboard state
 * @param action - Action to perform on state
 * @returns Updated dashboard state
 */
function adminDashboardReducer(state: AdminDashboardState, action: AdminDashboardAction): AdminDashboardState {
  switch (action.type) {
    case "SET_USERS":
      return { ...state, users: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload, currentPage: 1 };
    case "SET_ROLE_FILTER":
      return { ...state, roleFilter: action.payload, currentPage: 1 };
    case "SET_STATUS_FILTER":
      return { ...state, statusFilter: action.payload, currentPage: 1 };
    case "SET_PAGE":
      return { ...state, currentPage: action.payload };
    case "SET_PAGE_SIZE":
      return { ...state, pageSize: action.payload, currentPage: 1 };
    case "SET_SORT":
      return { ...state, ...action.payload };
    case "UPDATE_USER_STATUS":
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.payload.userId ? { ...u, status: action.payload.status } : u
        ),
      };
    case "RESET_FILTERS":
      return {
        ...state,
        searchQuery: "",
        roleFilter: "all",
        statusFilter: "all",
        currentPage: 1,
      };
    default:
      return state;
  }
}

/**
 * Custom hook for admin dashboard functionality.
 * Provides filtered/paginated users and actions for state management.
 * 
 * @param initialUsers - Initial list of admin users
 * @returns Dashboard state, filtered users, pagination info, and actions
 */
export function useAdminDashboard(initialUsers: AdminUser[]) {
  const [state, dispatch] = useReducer(adminDashboardReducer, {
    users: initialUsers,
    searchQuery: "",
    roleFilter: "all",
    statusFilter: "all",
    currentPage: 1,
    pageSize: 10,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Memoized filtered and sorted users
  const filteredUsers = useMemo(() => {
    let filtered = [...state.users];

    // Apply search filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter((u) =>
        [u.name, u.email, u.role, u.status].some((field) => 
          String(field).toLowerCase().includes(query)
        )
      );
    }

    // Apply role filter
    if (state.roleFilter !== "all") {
      filtered = filtered.filter((u) => u.role === state.roleFilter);
    }

    // Apply status filter
    if (state.statusFilter !== "all") {
      filtered = filtered.filter((u) => u.status === state.statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[state.sortBy];
      const bVal = b[state.sortBy];
      
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return state.sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [state.users, state.searchQuery, state.roleFilter, state.statusFilter, state.sortBy, state.sortOrder]);

  // Pagination
  const paginatedUsers = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = startIndex + state.pageSize;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, state.currentPage, state.pageSize]);

  const totalPages = Math.ceil(filteredUsers.length / state.pageSize);

  // Action creators
  const actions = {
    setSearchQuery: useCallback((query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: query });
    }, []),
    
    setRoleFilter: useCallback((role: UserRole | "all") => {
      dispatch({ type: "SET_ROLE_FILTER", payload: role });
    }, []),
    
    setStatusFilter: useCallback((status: AccountStatus | "all") => {
      dispatch({ type: "SET_STATUS_FILTER", payload: status });
    }, []),
    
    setPage: useCallback((page: number) => {
      dispatch({ type: "SET_PAGE", payload: page });
    }, []),
    
    setPageSize: useCallback((size: number) => {
      dispatch({ type: "SET_PAGE_SIZE", payload: size });
    }, []),
    
    setSort: useCallback((sortBy: keyof AdminUser, sortOrder: "asc" | "desc") => {
      dispatch({ type: "SET_SORT", payload: { sortBy, sortOrder } });
    }, []),
    
    updateUserStatus: useCallback((userId: string, status: AccountStatus) => {
      dispatch({ type: "UPDATE_USER_STATUS", payload: { userId, status } });
    }, []),
    
    resetFilters: useCallback(() => {
      dispatch({ type: "RESET_FILTERS" });
    }, []),
  };

  return {
    state,
    filteredUsers,
    paginatedUsers,
    totalPages,
    actions,
  };
}
