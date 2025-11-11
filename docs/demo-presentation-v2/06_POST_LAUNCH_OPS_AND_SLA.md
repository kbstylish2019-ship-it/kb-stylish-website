# Post‑Launch Operations & SLA (Nepal‑friendly)

Objective: keep beta healthy and prove reliability. This is the ethical upsell.

What we set up:
- Error Tracking: Sentry for Next.js (server + client) with source maps
- Uptime: UptimeRobot/BetterStack checks for web + API + DB health endpoints
- Logs: Supabase logs review + alerts on error spikes
- On‑call: business‑hours or 24/7 escalation path
- Backups/DR: Supabase backups + restore drills

Suggested Retainer (choose one):
- Basic (Rs 15,000/mo): Sentry + uptime + weekly checks + minor fixes (4 hrs)
- Standard (Rs 30,000/mo): + performance/db reviews + security patches + reports (10 hrs)
- Premium (Rs 60,000/mo): + 24/7, incident response, load testing, quarterly pen‑test coordination (24 hrs)

Why it’s fair:
- Sentry events, uptime monitors, and DR drills cost time and money
- Proactive ops prevents costly downtime during beta

Note: Sentry packages and monitor quotas can be tuned to your volume to control cost.
