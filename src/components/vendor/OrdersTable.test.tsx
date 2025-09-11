import React from 'react'
import { render, screen, within } from '@testing-library/react'
import OrdersTable from './OrdersTable'
import type { Order } from '@/lib/types'

const orders: Order[] = [
  {
    id: 'ORD-42',
    date: '2025-08-17T10:00:00.000Z',
    customer: 'Aarav Karki',
    items: [
      { name: 'Classic Denim Jacket', quantity: 1 },
      { name: 'Himalayan Wool Scarf', quantity: 2 },
    ],
    total: 6497,
    status: 'Pending',
    payout: 'Unpaid',
  },
]

describe('OrdersTable', () => {
  it('renders headers and a row with badges', () => {
    render(<OrdersTable orders={orders} />)

    // headers
    expect(screen.getByText('Order #')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('Items')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Payout')).toBeInTheDocument()

    // row basics
    const row = screen.getByText('ORD-42').closest('tr') as HTMLTableRowElement
    expect(row).toBeTruthy()
    expect(within(row).getByText('Aarav Karki')).toBeInTheDocument()
    expect(within(row).getByText(/Classic Denim Jacket ×1, Himalayan Wool Scarf ×2/)).toBeInTheDocument()

    // currency contains NPR
    expect(within(row).getByText(/NPR|NPR\s/)).toBeInTheDocument()

    // badges
    expect(within(row).getByText('Pending')).toBeInTheDocument()
    expect(within(row).getByText('Unpaid')).toBeInTheDocument()
  })
})
