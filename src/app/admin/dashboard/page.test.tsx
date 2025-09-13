import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AdminDashboardPage from "./page";
import "@testing-library/jest-dom";

// Mock the DashboardLayout
jest.mock("@/components/layout/DashboardLayout", () => {
  return function MockDashboardLayout({ title, actions, sidebar, children }: {
    title?: React.ReactNode;
    actions?: React.ReactNode;
    sidebar?: React.ReactNode;
    children?: React.ReactNode;
  }) {
    return (
      <main>
        <div>
          <aside>{sidebar}</aside>
          <section>
            {(title || actions) && (
              <div>
                {title && <h1>{title}</h1>}
                {actions && <div>{actions}</div>}
              </div>
            )}
            {children}
          </section>
        </div>
      </main>
    );
  };
});

jest.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

// Ensure next/dynamic resolves modules synchronously for these tests
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    return () => null
  },
}))

// Provide a minimal UsersTable that surfaces expected controls and renders rows

describe("AdminDashboardPage", () => {
  it("renders all main elements", () => {
    render(<AdminDashboardPage />);
    expect(screen.getByText("Admin Control Panel")).toBeInTheDocument();
    expect(screen.getByText("Invite User")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Active Vendors")).toBeInTheDocument();
    expect(screen.getByText("Monthly Revenue")).toBeInTheDocument();
    expect(screen.getByText("Tickets Open")).toBeInTheDocument();
    expect(screen.getByTestId("users-table")).toBeInTheDocument();
  });

  describe("Search functionality", () => {
    it("filters users based on search query", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      
      // Initially shows all users
      expect(screen.getByText("Rohan Shrestha")).toBeInTheDocument();
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      
      // Search for "rohan"
      fireEvent.change(searchInput, { target: { value: "rohan" } });
      expect(screen.getByText("Rohan Shrestha")).toBeInTheDocument();
      expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    });

    it("searches by email", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      
      fireEvent.change(searchInput, { target: { value: "priya@" } });
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
    });

    it("searches by role", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      
      fireEvent.change(searchInput, { target: { value: "vendor" } });
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
    });

    it("searches by status", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      
      fireEvent.change(searchInput, { target: { value: "suspended" } });
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
    });
  });

  describe("Filter dropdowns", () => {
    it("filters by role", () => {
      render(<AdminDashboardPage />);
      const roleFilter = screen.getByTestId("role-filter");
      
      // Filter by vendor
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
      
      // Filter by admin
      fireEvent.change(roleFilter, { target: { value: "admin" } });
      expect(screen.getByText("Admin Sita")).toBeInTheDocument();
      expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    });

    it("filters by status", () => {
      render(<AdminDashboardPage />);
      const statusFilter = screen.getByTestId("status-filter");
      
      // Filter by Active
      fireEvent.change(statusFilter, { target: { value: "Active" } });
      expect(screen.getByText("Rohan Shrestha")).toBeInTheDocument();
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
      expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument(); // Suspended
      
      // Filter by Suspended
      fireEvent.change(statusFilter, { target: { value: "Suspended" } });
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
    });

    it("combines role and status filters", () => {
      render(<AdminDashboardPage />);
      const roleFilter = screen.getByTestId("role-filter");
      const statusFilter = screen.getByTestId("status-filter");
      
      // Filter by vendor AND Active
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      fireEvent.change(statusFilter, { target: { value: "Active" } });
      
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
      expect(screen.getByText("Vendor Ram")).toBeInTheDocument();
      expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument(); // vendor but Suspended
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument(); // Active but customer
    });

    it("combines search with filters", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      const roleFilter = screen.getByTestId("role-filter");
      
      // Search for "maya" and filter by vendor
      fireEvent.change(searchInput, { target: { value: "maya" } });
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
      expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    });
  });

  describe("Reset filters", () => {
    it("shows reset button when filters are applied", () => {
      render(<AdminDashboardPage />);
      
      // Initially no reset button
      expect(screen.queryByTestId("reset-filters")).not.toBeInTheDocument();
      
      // Apply a filter
      const roleFilter = screen.getByTestId("role-filter");
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      
      // Reset button should appear
      expect(screen.getByTestId("reset-filters")).toBeInTheDocument();
    });

    it("resets all filters when clicked", () => {
      render(<AdminDashboardPage />);
      const searchInput = screen.getByTestId("users-search-input");
      const roleFilter = screen.getByTestId("role-filter");
      const statusFilter = screen.getByTestId("status-filter");
      
      // Apply multiple filters
      fireEvent.change(searchInput, { target: { value: "test" } });
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      fireEvent.change(statusFilter, { target: { value: "Active" } });
      
      // Click reset
      const resetButton = screen.getByTestId("reset-filters");
      fireEvent.click(resetButton);
      
      // All filters should be reset
      expect(searchInput).toHaveValue("");
      expect(roleFilter).toHaveValue("all");
      expect(statusFilter).toHaveValue("all");
      
      // Reset button should disappear
      expect(screen.queryByTestId("reset-filters")).not.toBeInTheDocument();
    });
  });

  describe("Pagination", () => {
    it("changes page size", () => {
      render(<AdminDashboardPage />);
      const pageSizeSelect = screen.getByTestId("page-size-select");
      
      // Default is 10 per page
      expect(pageSizeSelect).toHaveValue("10");
      
      // Change to 5 per page
      fireEvent.change(pageSizeSelect, { target: { value: "5" } });
      expect(pageSizeSelect).toHaveValue("5");
      
      // Should show only 5 users
      const table = screen.getByTestId("users-table");
      const rows = within(table).getAllByRole("row");
      // 1 header + 5 data rows
      expect(rows).toHaveLength(6);
    });

    it("navigates between pages", () => {
      render(<AdminDashboardPage />);
      
      // Change to 5 per page to enable pagination
      const pageSizeSelect = screen.getByTestId("page-size-select");
      fireEvent.change(pageSizeSelect, { target: { value: "5" } });
      
      // Should show page 1 initially
      const page1Button = screen.getByTestId("page-1");
      expect(page1Button).toHaveClass("bg-[var(--kb-primary-brand)]/20");
      
      // Click page 2
      const page2Button = screen.getByTestId("page-2");
      fireEvent.click(page2Button);
      
      // Page 2 should be active
      expect(page2Button).toHaveClass("bg-[var(--kb-primary-brand)]/20");
      expect(page1Button).not.toHaveClass("bg-[var(--kb-primary-brand)]/20");
    });

    it("uses prev/next navigation buttons", () => {
      render(<AdminDashboardPage />);
      
      // Change to 5 per page
      const pageSizeSelect = screen.getByTestId("page-size-select");
      fireEvent.change(pageSizeSelect, { target: { value: "5" } });
      
      const prevButton = screen.getByLabelText("Previous page");
      const nextButton = screen.getByLabelText("Next page");
      
      // Initially on page 1, prev should be disabled
      expect(prevButton).toBeDisabled();
      expect(nextButton).not.toBeDisabled();
      
      // Go to next page
      fireEvent.click(nextButton);
      
      // Now prev should be enabled
      expect(prevButton).not.toBeDisabled();
      
      // Go back
      fireEvent.click(prevButton);
      expect(prevButton).toBeDisabled();
    });

    it("shows correct user count text", () => {
      render(<AdminDashboardPage />);
      
      // Change to 5 per page to enable pagination UI
      const pageSizeSelect = screen.getByTestId("page-size-select");
      fireEvent.change(pageSizeSelect, { target: { value: "5" } });
      
      // Should show "Showing 1 to 5 of 7 users"
      expect(screen.getByText(/Showing 1 to 5 of 7 users/)).toBeInTheDocument();
      
      // Go to page 2
      const page2Button = screen.getByTestId("page-2");
      fireEvent.click(page2Button);
      
      // Should show "Showing 6 to 7 of 7 users"
      expect(screen.getByText(/Showing 6 to 7 of 7 users/)).toBeInTheDocument();
    });
  });

  describe("User actions", () => {
    it("suspends an active user", () => {
      render(<AdminDashboardPage />);
      
      // Find Rohan (Active user)
      const rohanRow = screen.getByText("Rohan Shrestha").closest("tr");
      expect(rohanRow).toBeInTheDocument();
      
      // Check initial status
      const statusBadge = within(rohanRow!).getByText("Active");
      expect(statusBadge).toBeInTheDocument();
      
      // Click Suspend
      const suspendButton = within(rohanRow!).getByText("Suspend");
      fireEvent.click(suspendButton);
      
      // Status should change to Suspended
      expect(within(rohanRow!).getByText("Suspended")).toBeInTheDocument();
      expect(within(rohanRow!).queryByText("Active")).not.toBeInTheDocument();
    });

    it("activates a suspended user", () => {
      render(<AdminDashboardPage />);
      
      // Find Priya (Suspended user)
      const priyaRow = screen.getByText("Priya Sharma").closest("tr");
      expect(priyaRow).toBeInTheDocument();
      
      // Check initial status
      const statusBadge = within(priyaRow!).getByText("Suspended");
      expect(statusBadge).toBeInTheDocument();
      
      // Click Activate
      const activateButton = within(priyaRow!).getByText("Activate");
      fireEvent.click(activateButton);
      
      // Status should change to Active
      expect(within(priyaRow!).getByText("Active")).toBeInTheDocument();
      expect(within(priyaRow!).queryByText("Suspended")).not.toBeInTheDocument();
    });

    it("bans a user", () => {
      render(<AdminDashboardPage />);
      
      // Find Rohan
      const rohanRow = screen.getByText("Rohan Shrestha").closest("tr");
      expect(rohanRow).toBeInTheDocument();
      
      // Click Ban
      const banButton = within(rohanRow!).getByText("Ban");
      fireEvent.click(banButton);
      
      // Status should change to Banned
      expect(within(rohanRow!).getByText("Banned")).toBeInTheDocument();
    });

    it("shows correct action buttons based on status", () => {
      render(<AdminDashboardPage />);
      
      // Active user should have Suspend and Ban
      const activeRow = screen.getByText("Rohan Shrestha").closest("tr");
      expect(within(activeRow!).getByText("Suspend")).toBeInTheDocument();
      expect(within(activeRow!).getByText("Ban")).toBeInTheDocument();
      expect(within(activeRow!).queryByText("Activate")).not.toBeInTheDocument();
      
      // Suspended user should have Activate and Ban
      const suspendedRow = screen.getByText("Priya Sharma").closest("tr");
      expect(within(suspendedRow!).getByText("Activate")).toBeInTheDocument();
      expect(within(suspendedRow!).getByText("Ban")).toBeInTheDocument();
      expect(within(suspendedRow!).queryByText("Suspend")).not.toBeInTheDocument();
      
      // Banned user should have Activate
      const bannedRow = screen.getByText("Anish Karki").closest("tr");
      expect(within(bannedRow!).getByText("Activate")).toBeInTheDocument();
      expect(within(bannedRow!).queryByText("Suspend")).not.toBeInTheDocument();
      expect(within(bannedRow!).queryByText("Ban")).not.toBeInTheDocument();
    });
  });

  describe("Integration tests", () => {
    it("maintains filters after user action", () => {
      render(<AdminDashboardPage />);
      
      // Filter by Active status
      const statusFilter = screen.getByTestId("status-filter");
      fireEvent.change(statusFilter, { target: { value: "Active" } });
      
      // Suspend Rohan
      const rohanRow = screen.getByText("Rohan Shrestha").closest("tr");
      const suspendButton = within(rohanRow!).getByText("Suspend");
      fireEvent.click(suspendButton);
      
      // Rohan should disappear from filtered view (no longer Active)
      expect(screen.queryByText("Rohan Shrestha")).not.toBeInTheDocument();
      
      // Other Active users should still be visible
      expect(screen.getByText("Maya Gurung")).toBeInTheDocument();
    });

    it("resets to page 1 when applying filters", () => {
      render(<AdminDashboardPage />);
      
      // Go to page 2 with 5 per page
      const pageSizeSelect = screen.getByTestId("page-size-select");
      fireEvent.change(pageSizeSelect, { target: { value: "5" } });
      fireEvent.click(screen.getByTestId("page-2"));
      
      // Apply a filter
      const roleFilter = screen.getByTestId("role-filter");
      fireEvent.change(roleFilter, { target: { value: "vendor" } });
      
      // Should reset to page 1; pagination may collapse to a single page, so page buttons might not render
      // Verify that filtered results from the beginning are shown
      expect(screen.getByText("Vendor Ram")).toBeInTheDocument();
      expect(screen.queryByTestId("page-2")).not.toBeInTheDocument();
    });
  });
});
