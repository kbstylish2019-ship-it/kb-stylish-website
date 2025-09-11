import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VendorDashboardPage from './page'

// Mock the custom hooks
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value, // Return value immediately for testing
}))

describe('VendorDashboardPage', () => {
  it('renders header, primary CTA, stat cards and recent orders', () => {
    render(<VendorDashboardPage />)

    // Header title
    expect(screen.getByRole('heading', { name: /vendor dashboard/i })).toBeInTheDocument()

    // CTA (now a button instead of link)
    expect(screen.getByRole('button', { name: /add product\/service/i })).toBeInTheDocument()

    // Stat cards
    expect(screen.getByText(/Today's Bookings/)).toBeInTheDocument()
    expect(screen.getByText(/Monthly Earnings/)).toBeInTheDocument()

    // Recent Orders section and a sample order row id
    expect(screen.getByRole('heading', { name: /recent orders/i })).toBeInTheDocument()
    expect(screen.getByText('ORD-1001')).toBeInTheDocument()
  })

  it('opens Add Product modal when CTA button is clicked', async () => {
    render(<VendorDashboardPage />)

    const ctaButton = screen.getByRole('button', { name: /add product\/service/i })
    fireEvent.click(ctaButton)

    // Check if modal appears by looking for unique modal content
    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Add Product/Service' })).toBeInTheDocument()
    })
  })

  it('closes Add Product modal when close button is clicked', async () => {
    render(<VendorDashboardPage />)

    // Open modal
    const ctaButton = screen.getByRole('button', { name: /add product\/service/i })
    fireEvent.click(ctaButton)

    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument()
    })

    // Close modal
    const closeButton = screen.getByLabelText('Close modal')
    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByText('Basic Info')).not.toBeInTheDocument()
    })
  })

  it('filters orders when typing in search input', async () => {
    render(<VendorDashboardPage />)

    // Get search input
    const searchInput = screen.getByTestId('orders-search-input') as HTMLInputElement

    // Initially should show all orders
    expect(screen.getByText('ORD-1001')).toBeInTheDocument()
    expect(screen.getByText('ORD-1000')).toBeInTheDocument()
    expect(screen.getByText('ORD-0999')).toBeInTheDocument()

    // Type search query
    fireEvent.change(searchInput, { target: { value: 'Sujan' } })

    await waitFor(() => {
      // Should show only the order for Sujan Thapa
      expect(screen.getByText('ORD-1001')).toBeInTheDocument()
      expect(screen.queryByText('ORD-1000')).not.toBeInTheDocument()
      expect(screen.queryByText('ORD-0999')).not.toBeInTheDocument()
    })
  })

  it('shows "no orders found" message when search yields no results', async () => {
    render(<VendorDashboardPage />)

    const searchInput = screen.getByTestId('orders-search-input')
    fireEvent.change(searchInput, { target: { value: 'NonexistentCustomer' } })

    await waitFor(() => {
      expect(screen.getByText(/No orders found matching "NonexistentCustomer"/)).toBeInTheDocument()
    })
  })

  it('clears search and shows all orders when search input is cleared', async () => {
    render(<VendorDashboardPage />)

    const searchInput = screen.getByTestId('orders-search-input')
    
    // Filter orders
    fireEvent.change(searchInput, { target: { value: 'Sujan' } })
    await waitFor(() => {
      expect(screen.getByText('ORD-1001')).toBeInTheDocument()
      expect(screen.queryByText('ORD-1000')).not.toBeInTheDocument()
    })

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })
    await waitFor(() => {
      // All orders should be visible again
      expect(screen.getByText('ORD-1001')).toBeInTheDocument()
      expect(screen.getByText('ORD-1000')).toBeInTheDocument()
      expect(screen.getByText('ORD-0999')).toBeInTheDocument()
    })
  })

  it('renders pagination controls when there are multiple pages', () => {
    render(<VendorDashboardPage />)

    // Table exists
    expect(screen.getByTestId('orders-table')).toBeInTheDocument()

    // Page 2 button should be visible (we seeded > 10 orders)
    expect(screen.getByTestId('page-2')).toBeInTheDocument()

    // Info text
    expect(screen.getByText(/Showing 1 to 10 of \d+ orders/i)).toBeInTheDocument()
  })

  it('navigates pages with page buttons', async () => {
    render(<VendorDashboardPage />)

    // Oldest seeded order should not be on page 1 initially
    expect(screen.queryByText('ORD-0987')).not.toBeInTheDocument()

    // Go to page 2
    fireEvent.click(screen.getByTestId('page-2'))

    await waitFor(() => {
      expect(screen.getByText('ORD-0987')).toBeInTheDocument()
      // A very new order should no longer be visible on page 2
      expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument()
    })
  })

  it('changing page size collapses pagination when all results fit on one page', async () => {
    render(<VendorDashboardPage />)

    // Confirm we have multiple pages initially
    expect(screen.getByTestId('page-2')).toBeInTheDocument()

    // Change page size to 25
    const pageSizeSelect = screen.getByTestId('page-size-select')
    fireEvent.change(pageSizeSelect, { target: { value: '25' } })

    await waitFor(() => {
      // Pagination should disappear
      expect(screen.queryByTestId('page-2')).not.toBeInTheDocument()
      // Info text should also not be shown since pagination is collapsed
      expect(screen.queryByText(/Showing 1 to 10 of/)).not.toBeInTheDocument()
    })
  })

  it('resets to page 1 on search and collapses pagination when results < page size', async () => {
    render(<VendorDashboardPage />)

    // Navigate to page 2 first
    fireEvent.click(screen.getByTestId('page-2'))

    // Now search for a term that yields a single result
    const searchInput = screen.getByTestId('orders-search-input')
    fireEvent.change(searchInput, { target: { value: 'Sujan' } })

    await waitFor(() => {
      // The matching order is visible
      expect(screen.getByText('ORD-1001')).toBeInTheDocument()
      // Pagination should be collapsed
      expect(screen.queryByTestId('page-2')).not.toBeInTheDocument()
    })
  })
})
