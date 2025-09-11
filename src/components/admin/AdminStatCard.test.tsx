import React from 'react'
import { render, screen } from '@testing-library/react'
import AdminStatCard from './AdminStatCard'

describe('AdminStatCard', () => {
  it('renders title, value and trend badge', () => {
    render(
      <AdminStatCard
        title="Total Users"
        value={1200}
        subtitle="Active: 1100"
        trend={{ label: '+5% WoW', direction: 'up' }}
      />
    )

    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('+5% WoW')).toBeInTheDocument()
  })
})
