import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchUserSupportTickets } from '@/lib/supportApi';
import MyTicketsClient from '@/components/support/MyTicketsClient';
import { MessageCircle } from 'lucide-react';

// Helper to create Supabase server client
async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

export default async function MyTicketsPage() {
  // Check authentication
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/support/tickets');
  }
  
  // Fetch user's support tickets
  const ticketsResponse = await fetchUserSupportTickets(20, 0);
  
  // Handle error state
  if (!ticketsResponse.success || !ticketsResponse.tickets) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-500">Failed to Load Tickets</h2>
            <p className="mt-2 text-sm text-red-400">
              {ticketsResponse.error || 'Unable to fetch your support tickets. Please refresh the page or try again later.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <MessageCircle className="h-6 w-6 text-[var(--kb-accent-gold)]" />
            <h1 className="text-2xl font-bold text-foreground">
              My Support Tickets
            </h1>
          </div>
          <p className="text-foreground/70">
            Track and manage your support requests
          </p>
        </div>

        {/* Tickets List */}
        <MyTicketsClient 
          initialTickets={ticketsResponse.tickets}
          totalCount={ticketsResponse.total || 0}
        />
      </div>
    </main>
  );
}
