import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import UsersTable from './UsersTable'
import type { AdminUser } from '@/lib/types'

describe('UsersTable', () => {
  const users: AdminUser[] = [
    { id: 'U-1', name: 'Alice', email: 'alice@example.com', role: 'customer', status: 'Active', createdAt: '2025-01-01T00:00:00.000Z', lastActiveAt: '2025-01-10T00:00:00.000Z', orders: 3 },
    { id: 'U-2', name: 'Bob', email: 'bob@shop.io', role: 'vendor', status: 'Suspended', createdAt: '2024-12-10T00:00:00.000Z', revenue: 150000 },
    { id: 'U-3', name: 'Eve', email: 'eve@example.com', role: 'admin', status: 'Pending', createdAt: '2025-02-01T00:00:00.000Z' },
  ]

  it('renders headers and user rows with badges', () => {
    render(<UsersTable users={users} />)

    // headers
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()

    // a row
    const row = screen.getByText('Alice').closest('tr') as HTMLTableRowElement
    expect(row).toBeTruthy()
    expect(within(row).getByText('alice@example.com')).toBeInTheDocument()

    // badges and revenue formatting
    expect(within(row).getByText('customer')).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()

    // vendor revenue displays NPR currency
    const vendorRow = screen.getByText('Bob').closest('tr') as HTMLTableRowElement
    expect(within(vendorRow).getByText(/NPR|NPR\s/)).toBeInTheDocument()
  })

  it('shows search input when onSearchChange is provided', () => {
    const noop = () => {}
    render(<UsersTable users={users} onSearchChange={noop} />)
    expect(screen.getByTestId('users-search-input')).toBeInTheDocument()
  })

  it('shows empty state with query when no users match', () => {
    render(<UsersTable users={[]} searchQuery="zzz" />)
    expect(screen.getByText(/No users found matching "zzz"/)).toBeInTheDocument()
  })

  it('invokes onAction for suspend/activate/ban actions', () => {
    const onAction = jest.fn()
    render(<UsersTable users={users} onAction={onAction} />)

    // Suspend for an Active user (Alice)
    const aliceRow = screen.getByText('Alice').closest('tr') as HTMLTableRowElement
    fireEvent.click(within(aliceRow).getByText('Suspend'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'U-1' }), 'suspend')

    // Activate for a Suspended user (Bob)
    const bobRow = screen.getByText('Bob').closest('tr') as HTMLTableRowElement
    fireEvent.click(within(bobRow).getByText('Activate'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'U-2' }), 'activate')

    // Ban (always available)
    fireEvent.click(within(aliceRow).getByText('Ban'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'U-1' }), 'ban')
  })
})
