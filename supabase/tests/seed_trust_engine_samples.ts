#!/usr/bin/env tsx

/**
 * Trust Engine Sample Data Seeder (one-off)
 * - Ensures trust_seed.json exists (runs main seed if missing)
 * - Creates a few approved reviews for the seeded product
 * - Adds some sharded vote counts so UI is not empty
 *
 * Usage:
 *  pnpm tsx supabase/tests/seed_trust_engine_samples.ts
 *  npm  run  seed:trust:samples
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { run as runSeed } from './seed_trust_engine';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Seed = {
  product: { id: string; slug: string; name: string };
  seededReviews: Array<{ id: string; author_id: string; title: string }>;
};

async function ensureSeed(): Promise<Seed> {
  const artifact = path.join('supabase', 'tests', 'trust_seed.json');
  if (!fs.existsSync(artifact)) {
    await runSeed();
  }
  const raw = fs.readFileSync(artifact, 'utf-8');
  return JSON.parse(raw);
}

async function run() {
  const seed = await ensureSeed();

  // Create two additional approved reviews by synthetic users (service role bypasses RLS)
  const reviewsToCreate = [
    { title: 'Sample Review A', comment: 'Great quality and fast delivery!', rating: 5 },
    { title: 'Sample Review B', comment: 'Decent product, value for money.', rating: 4 },
  ];

  const createdIds: string[] = [];

  for (const r of reviewsToCreate) {
    const { data: review, error } = await admin
      .from('reviews')
      .insert({
        product_id: seed.product.id,
        user_id: seed.seededReviews[0].author_id, // any existing user
        order_id: (await admin.from('orders').select('id').limit(1).single()).data?.id, // any order for ref
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        is_approved: true,
        moderation_status: 'approved',
        helpful_votes: 0,
        unhelpful_votes: 0,
      })
      .select('id')
      .single();

    if (error) throw error;
    createdIds.push(review!.id);

    // Add some sharded counts (e.g., helpful=3, unhelpful=1)
    await admin.from('review_vote_shards').insert([
      { review_id: review!.id, shard: 0, helpful_count: 2, unhelpful_count: 0 },
      { review_id: review!.id, shard: 1, helpful_count: 1, unhelpful_count: 1 },
    ]);

    // Update denormalized counters for convenience
    await admin
      .from('reviews')
      .update({ helpful_votes: 3, unhelpful_votes: 1 })
      .eq('id', review!.id);
  }

  console.log('Seeded sample reviews:', createdIds);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
