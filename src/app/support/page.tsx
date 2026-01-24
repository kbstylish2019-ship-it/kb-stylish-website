import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import SupportForm from '@/components/support/SupportForm';
import { MessageCircle, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

interface SupportCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

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

export default async function SupportPage() {
  // Check authentication
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/support');
  }
  
  // Fetch support categories from database directly
  const { data: categories, error: categoriesError } = await supabase
    .from('support_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  
  const supportCategories: SupportCategory[] = categories || [];
  
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <MessageCircle className="h-8 w-8 text-[var(--kb-accent-gold)]" />
            <h1 className="text-3xl font-bold text-foreground">
              Help & Support
            </h1>
          </div>
          <p className="text-lg text-foreground/80 max-w-2xl mx-auto">
            Need help with an order, have a question, or want to suggest a product? We're here for you! Submit your request and our team will respond within 24 hours.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Support Form */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                How Can We Help You?
              </h2>
              <p className="text-sm text-foreground/60 mb-6">
                Whether it's a support issue, general inquiry, or product suggestion - we're all ears!
              </p>
              <SupportForm categories={supportCategories} />
            </div>
          </div>

          {/* Support Information */}
          <div className="space-y-6">
            {/* Response Time */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-[var(--kb-accent-gold)]" />
                <h3 className="text-lg font-semibold text-foreground">Response Time</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-foreground/80">General Inquiries: 24 hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <span className="text-foreground/80">Order Issues: 12 hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-foreground/80">Urgent Issues: 4 hours</span>
                </div>
              </div>
            </div>

            {/* Support Categories */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-[var(--kb-accent-gold)]" />
                <h3 className="text-lg font-semibold text-foreground">Common Issues</h3>
              </div>
              <div className="space-y-2 text-sm">
                {supportCategories.slice(0, 4).map((category: SupportCategory) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: category.color }}
                    ></div>
                    <span className="text-foreground/80">{category.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Alternatives */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="h-5 w-5 text-[var(--kb-accent-gold)]" />
                <h3 className="text-lg font-semibold text-foreground">Other Ways to Reach Us</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-foreground/60">Email</div>
                  <a 
                    href="mailto:kbstylish2019@gmail.com" 
                    className="text-[var(--kb-accent-gold)] hover:underline"
                  >
                    kbstylish2019@gmail.com
                  </a>
                </div>
                <div>
                  <div className="text-foreground/60">Phone</div>
                  <a 
                    href="tel:+9779801227448" 
                    className="text-[var(--kb-accent-gold)] hover:underline"
                  >
                    +977 9801227448
                  </a>
                </div>
                <div>
                  <div className="text-foreground/60">Hours</div>
                  <div className="text-foreground/80">Mon-Fri: 9 AM - 6 PM NPT</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
