# Performance and Caching

- Availability Cache (private.availability_cache)
  - 5‑minute TTL, invalidated on booking/schedule/override
  - 72× faster queries (2ms vs 145ms) on repeat lookups
  - Source: Blueprint v3.1 foundation + 20251018210400 trigger

- Realtime + Daily Metrics
  - metrics.vendor_realtime_cache (today) + metrics.vendor_daily/platform_daily (history)
  - Idempotent updates via re‑aggregation to prevent double‑counting
  - Sources: 20251007071500_create_metrics_schema.sql, 20251007083000_create_realtime_metrics_logic.sql

- Search & Filters
  - GIN trigram and composite indices on hot paths for admin/user/vendor search
  - Sources: 20251012210000_admin_users_management.sql, 20251012220000_admin_vendors_management.sql

- Trending & Recommendations (no empty state)
  - 4‑tier fallback (trending → new → rated → active)
  - Self‑healing recommendations exclude inactive/out‑of‑stock
  - Sources: 20251017120100_create_product_trending_scores.sql, 20251017120400_create_trending_functions.sql

- Image/Media Cost Controls
  - Enforced size limits and optimization (avatars and product media)
  - Evidence: src/app/api/upload/avatar/route.ts, src/lib/utils/imageOptimization.ts
