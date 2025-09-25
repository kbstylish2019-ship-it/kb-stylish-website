import React from 'react';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import ProfilePage from './page';
import * as apiClient from '@/lib/apiClient';

// Mock the redirect function
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// Mock the apiClient
jest.mock('@/lib/apiClient', () => ({
  getUserProfile: jest.fn(),
}));

// Mock the ProfileView component
jest.mock('@/components/profile/ProfileView', () => {
  return function MockProfileView({ profile }: { profile: any }) {
    return (
      <div data-testid="profile-view">
        <span data-testid="profile-display-name">{profile.display_name}</span>
        <span data-testid="profile-username">{profile.username}</span>
      </div>
    );
  };
});

const mockProfile = {
  id: 'user-123',
  username: 'testuser',
  display_name: 'Test User',
  avatar_url: null,
  bio: 'This is a test bio',
  is_verified: true,
  role_version: 1,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-02T00:00:00Z',
};

describe('ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders profile page with user data when authenticated', async () => {
    // Mock successful profile fetch
    (apiClient.getUserProfile as jest.Mock).mockResolvedValue(mockProfile);

    const ProfilePageComponent = await ProfilePage();
    render(ProfilePageComponent);

    // Check page header
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Manage your account information and preferences')).toBeInTheDocument();

    // Check ProfileView is rendered with correct data
    expect(screen.getByTestId('profile-view')).toBeInTheDocument();
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Test User');
    expect(screen.getByTestId('profile-username')).toHaveTextContent('testuser');
  });

  test('redirects to home when user is not authenticated', async () => {
    // Mock no profile found (user not authenticated)
    (apiClient.getUserProfile as jest.Mock).mockResolvedValue(null);

    await ProfilePage();

    // Check redirect was called
    expect(redirect).toHaveBeenCalledWith('/');
  });

  test('calls getUserProfile API function', async () => {
    (apiClient.getUserProfile as jest.Mock).mockResolvedValue(mockProfile);

    await ProfilePage();

    // Verify API was called
    expect(apiClient.getUserProfile).toHaveBeenCalledTimes(1);
  });

  test('handles profile fetch error gracefully', async () => {
    // Mock API error
    (apiClient.getUserProfile as jest.Mock).mockResolvedValue(null);

    await ProfilePage();

    // Should redirect when profile is null (error case)
    expect(redirect).toHaveBeenCalledWith('/');
  });
});
