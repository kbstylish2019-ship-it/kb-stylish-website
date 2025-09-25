"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/apiClient";

interface ProfileViewProps {
  profile: UserProfile;
}

export default function ProfileView({ profile }: ProfileViewProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-[var(--kb-primary-brand)]/10 to-[var(--kb-accent-gold)]/10 rounded-2xl p-8 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`${profile.display_name}'s avatar`}
                className="w-24 h-24 rounded-full object-cover ring-4 ring-white/20"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--kb-primary-brand)] to-[var(--kb-accent-gold)] flex items-center justify-center ring-4 ring-white/20">
                <span className="text-2xl font-bold text-white">
                  {profile.display_name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {profile.is_verified && (
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-[var(--kb-accent-gold)] rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-black"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">
                {profile.display_name}
              </h1>
              {profile.is_verified && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[var(--kb-accent-gold)]/20 text-[var(--kb-accent-gold)]">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <p className="text-foreground/70 text-lg mb-1">@{profile.username}</p>
            <p className="text-sm text-foreground/60">
              Member since {new Date(profile.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-foreground/80 leading-relaxed">{profile.bio}</p>
          </div>
        )}
      </div>

      {/* Profile Details */}
      <div className="grid gap-6">
        {/* Account Information */}
        <div className="bg-background/50 backdrop-blur rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Account Information</h2>
          <div className="grid gap-4">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-foreground/70">Username</span>
              <span className="font-medium text-foreground">@{profile.username}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-foreground/70">Display Name</span>
              <span className="font-medium text-foreground">{profile.display_name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-foreground/70">Account Status</span>
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                profile.is_verified 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-yellow-500/20 text-yellow-400"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  profile.is_verified ? "bg-green-400" : "bg-yellow-400"
                )} />
                {profile.is_verified ? "Verified" : "Unverified"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-foreground/70">Role Version</span>
              <span className="font-mono text-sm bg-white/5 px-2 py-1 rounded text-foreground">
                v{profile.role_version}
              </span>
            </div>
          </div>
        </div>

        {/* Profile Statistics */}
        <div className="bg-background/50 backdrop-blur rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Profile Activity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-[var(--kb-primary-brand)] mb-1">
                {Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))}
              </div>
              <div className="text-sm text-foreground/70">Days Active</div>
            </div>
            <div className="text-center p-4 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-[var(--kb-accent-gold)] mb-1">
                {new Date(profile.updated_at).toLocaleDateString()}
              </div>
              <div className="text-sm text-foreground/70">Last Updated</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
