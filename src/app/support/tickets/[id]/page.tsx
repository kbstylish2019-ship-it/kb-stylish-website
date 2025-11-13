import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchTicketDetails } from '@/lib/supportApi';
import TicketDetailsClient from '@/components/support/TicketDetailsClient';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

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

export default async function TicketDetailsPage({ params }: { params: { id: string } }) {
  // Check authentication
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/support/tickets');
  }
  
  // Fetch ticket details
  const ticketResponse = await fetchTicketDetails(params.id);
  
  // Handle error state
  if (!ticketResponse.success || !ticketResponse.ticket) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/support/tickets"
            className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Tickets
          </Link>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-500">Failed to Load Ticket</h2>
            <p className="mt-2 text-sm text-red-400">
              {ticketResponse.error || 'Unable to fetch ticket details. Please try again later.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Link */}
        <Link
          href="/support/tickets"
          className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Tickets
        </Link>

        {/* Ticket Details */}
        <TicketDetailsClient 
          ticket={ticketResponse.ticket}
          messages={ticketResponse.messages || []}
        />
      </div>
    </main>
  );
}
