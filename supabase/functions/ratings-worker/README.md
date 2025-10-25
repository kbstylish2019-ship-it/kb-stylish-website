# Ratings Worker - Product Rating Aggregation

## Purpose
Processes `update_product_rating` jobs from the job queue to keep product ratings in sync with approved reviews.

## How It Works
1. **Job Creation**: When a review is submitted/approved, a job is queued
2. **Worker Trigger**: Cron job runs this worker every 2 minutes
3. **Processing**: Worker fetches up to 10 pending jobs
4. **Aggregation**: Calls `update_product_rating_stats` RPC for each product
5. **Completion**: Marks jobs as completed or retries on failure

## Deployment

### Deploy the function:
```bash
cd supabase/functions
supabase functions deploy ratings-worker
```

### Setup Cron Job (Option 1 - Supabase Dashboard):
1. Go to Database → Cron Jobs in Supabase Dashboard
2. Create new cron job:
   - Name: `ratings-worker-trigger`
   - Schedule: `*/2 * * * *` (every 2 minutes)
   - Command: 
     ```sql
     SELECT net.http_post(
       url:='https://poxjcaogjupsplrcliau.supabase.co/functions/v1/ratings-worker',
       headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
     );
     ```

### Setup Cron Job (Option 2 - pg_cron extension):
```sql
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the worker
SELECT cron.schedule(
  'ratings-worker-trigger',
  '*/2 * * * *',  -- Every 2 minutes
  $$
  SELECT net.http_post(
    url:='https://poxjcaogjupsplrcliau.supabase.co/functions/v1/ratings-worker',
    headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  ) AS result;
  $$
);
```

### Setup Cron Job (Option 3 - Supabase Edge Function Cron):
1. Go to Edge Functions in Supabase Dashboard
2. Select `ratings-worker`
3. Click "Add trigger"
4. Choose "Cron"
5. Set schedule: `*/2 * * * *`

## Monitoring

### Check job queue status:
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time_seconds
FROM job_queue
WHERE job_type = 'update_product_rating'
GROUP BY status;
```

### View failed jobs:
```sql
SELECT id, payload, error_message, attempts, created_at
FROM job_queue
WHERE job_type = 'update_product_rating'
  AND status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Check recent product rating updates:
```sql
SELECT 
  p.id,
  p.name,
  p.average_rating,
  p.review_count,
  p.rating_distribution,
  p.updated_at
FROM products p
WHERE p.updated_at > NOW() - INTERVAL '1 hour'
  AND p.review_count > 0
ORDER BY p.updated_at DESC
LIMIT 20;
```

## Performance
- Processes up to 10 jobs per invocation (2 minutes)
- Each job takes ~50-200ms
- Can handle up to 300 jobs/hour (sufficient for most e-commerce sites)
- Retry logic with exponential backoff prevents thundering herd

## Troubleshooting

### Jobs stuck in "processing":
```sql
-- Reset stuck jobs (locked for > 5 minutes)
UPDATE job_queue
SET status = 'pending', locked_until = NULL
WHERE job_type = 'update_product_rating'
  AND status = 'processing'
  AND locked_until < NOW() - INTERVAL '5 minutes';
```

### Force process specific product:
```sql
-- Queue immediate rating update
INSERT INTO job_queue (job_type, priority, payload)
VALUES (
  'update_product_rating',
  1,  -- High priority
  jsonb_build_object('product_id', '<product-id-here>')
);
```

## Security
- Uses service role key (not exposed to client)
- Job queue protected by RLS
- Only accessible via Edge Function (no direct public access)
