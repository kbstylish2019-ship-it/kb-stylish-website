import React from 'react';
import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/apiClient';
import ProfileView from '@/components/profile/ProfileView';

export default async function ProfilePage() {
  // Fetch user profile server-side with RLS enforcement
  const profile = await getUserProfile();

  // Redirect to login if no profile found (user not authenticated)
  if (!profile) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-white/10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="py-8">
            <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
            <p className="mt-2 text-foreground/70">
              Manage your account information and preferences
            </p>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <ProfileView profile={profile} />
      </div>
    </div>
  );
}
