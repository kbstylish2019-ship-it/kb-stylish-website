import React from 'react'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('renders title and value and optional subtitle', () => {
    render(<StatCard title="Monthly Earnings" value="NPR 2,45,000" subtitle="Jan 1 - Current" />)
    expect(screen.getByText('Monthly Earnings')).toBeInTheDocument()
    expect(screen.getByText('NPR 2,45,000')).toBeInTheDocument()
    expect(screen.getByText('Jan 1 - Current')).toBeInTheDocument()
  })

  it('renders trend badge when provided', () => {
    render(<StatCard title="Growth" value="NPR 12,345" trend={{ label: '+23%', direction: 'up' }} />)
    expect(screen.getByText('+23%')).toBeInTheDocument()
  })
})
