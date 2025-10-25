# 🚀 SUPABASE CLI COMMANDS - QUICK REFERENCE

## AUTHENTICATION

### Login with Access Token:
```bash
# Method 1: Direct token login
supabase login --access-token YOUR_ACCESS_TOKEN_HERE

# Method 2: Environment variable
set SUPABASE_ACCESS_TOKEN=your_token_here
supabase login

# Method 3: Interactive login (opens browser)
supabase login
```

### Get Access Token:
1. Go to: https://supabase.com/dashboard/account/tokens
2. Click: "Generate new token"
3. Copy token
4. Use in command above

### Verify Login:
```bash
# Check auth status
supabase projects list

# Should show your projects including poxjcaogjupsplrcliau
```

---

## PROJECT MANAGEMENT

### Link Local Project to Remote:
```bash
# Link to your project
supabase link --project-ref poxjcaogjupsplrcliau

# Verify link
supabase status
```

### Project Info:
```bash
# List all projects
supabase projects list

# Get project details
supabase projects describe --project-ref poxjcaogjupsplrcliau
```

---

## EDGE FUNCTIONS

### Deploy Function:
```bash
# Deploy review-manager function
supabase functions deploy review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --no-verify-jwt

# Deploy specific version
supabase functions deploy review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --no-verify-jwt \\
  --import-map supabase/functions/import_map.json
```

### List Functions:
```bash
# List all edge functions
supabase functions list --project-ref poxjcaogjupsplrcliau
```

### View Function Logs:
```bash
# Tail logs in real-time
supabase functions logs review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --follow

# Get last 100 logs
supabase functions logs review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --limit 100
```

### Delete Function:
```bash
# Delete a function (careful!)
supabase functions delete review-manager \\
  --project-ref poxjcaogjupsplrcliau
```

---

## DATABASE MANAGEMENT

### Migrations:
```bash
# Pull remote migrations
supabase db pull --project-ref poxjcaogjupsplrcliau

# Create new migration
supabase migration new migration_name

# Push local migrations to remote
supabase db push --project-ref poxjcaogjupsplrcliau

# Reset database (careful!)
supabase db reset --project-ref poxjcaogjupsplrcliau
```

### Run SQL:
```bash
# Execute SQL file
supabase db execute --file ./supabase/migrations/your_migration.sql \\
  --project-ref poxjcaogjupsplrcliau

# Execute SQL directly
supabase db execute --sql "SELECT * FROM reviews LIMIT 10;" \\
  --project-ref poxjcaogjupsplrcliau
```

### Database Diff:
```bash
# Show differences between local and remote
supabase db diff --project-ref poxjcaogjupsplrcliau
```

---

## LOCAL DEVELOPMENT

### Start Local Supabase:
```bash
# Start all services (PostgreSQL, GoTrue, PostgREST, etc.)
supabase start

# Check status
supabase status

# Stop services
supabase stop
```

### Generate TypeScript Types:
```bash
# Generate types from your schema
supabase gen types typescript \\
  --project-id poxjcaogjupsplrcliau \\
  --schema public \\
  > src/types/supabase.ts
```

---

## SECRETS MANAGEMENT

### Set Secret:
```bash
# Set environment variable for edge function
supabase secrets set MY_SECRET=value \\
  --project-ref poxjcaogjupsplrcliau

# Set multiple secrets from file
supabase secrets set --env-file .env.production \\
  --project-ref poxjcaogjupsplrcliau
```

### List Secrets:
```bash
# List all secrets
supabase secrets list --project-ref poxjcaogjupsplrcliau
```

### Unset Secret:
```bash
# Remove a secret
supabase secrets unset MY_SECRET \\
  --project-ref poxjcaogjupsplrcliau
```

---

## QUICK DEPLOY WORKFLOW

### Complete Deployment:
```bash
# 1. Link project (one-time)
supabase link --project-ref poxjcaogjupsplrcliau

# 2. Deploy edge function
supabase functions deploy review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --no-verify-jwt

# 3. View logs to verify
supabase functions logs review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --follow

# 4. Test function
curl -X POST \\
  https://poxjcaogjupsplrcliau.supabase.co/functions/v1/review-manager \\
  -H "Authorization: Bearer YOUR_ANON_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"fetch","filters":{"productId":"test"}}'
```

---

## TROUBLESHOOTING

### Check CLI Version:
```bash
supabase --version

# Update CLI
npm update -g supabase

# Or with pnpm
pnpm update -g supabase
```

### Clear Cache:
```bash
# Clear Supabase CLI cache
supabase logout
rm -rf ~/.supabase
supabase login
```

### Debug Mode:
```bash
# Run commands with debug output
supabase --debug functions deploy review-manager \\
  --project-ref poxjcaogjupsplrcliau
```

---

## COMMON ISSUES

### Issue: "Not logged in"
```bash
# Solution:
supabase login --access-token YOUR_TOKEN
```

### Issue: "Project not linked"
```bash
# Solution:
supabase link --project-ref poxjcaogjupsplrcliau
```

### Issue: "JWT verification failed"
```bash
# Solution: Disable JWT verification in dashboard OR
supabase functions deploy review-manager \\
  --no-verify-jwt \\
  --project-ref poxjcaogjupsplrcliau
```

### Issue: "Module not found" in edge function
```bash
# Solution: Ensure _shared folder is included
# Or use single-file deployment
```

---

## PROJECT-SPECIFIC COMMANDS

### For KB Stylish (Your Project):
```bash
# Navigate to project
cd d:/kb-stylish

# Deploy review-manager
supabase functions deploy review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --no-verify-jwt

# Generate types
supabase gen types typescript \\
  --project-id poxjcaogjupsplrcliau \\
  > src/types/supabase.ts

# View recent logs
supabase functions logs review-manager \\
  --project-ref poxjcaogjupsplrcliau \\
  --limit 50
```

---

## DASHBOARD URLs

- **Project Dashboard**: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau
- **Edge Functions**: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/functions
- **Database**: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/editor
- **API Settings**: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/settings/api
- **Access Tokens**: https://supabase.com/dashboard/account/tokens

---

**Quick Start**: Run these 3 commands to deploy:
```bash
supabase login --access-token YOUR_TOKEN
supabase link --project-ref poxjcaogjupsplrcliau
supabase functions deploy review-manager --project-ref poxjcaogjupsplrcliau --no-verify-jwt
```
