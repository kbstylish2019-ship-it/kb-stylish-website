# CUSTOMER JOURNEY - DEPLOYMENT GUIDE

**Version**: 1.0  
**Last Updated**: October 18, 2025  
**Status**: Production Ready

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Must Complete:
- [ ] All tests passing
- [ ] Security audit done
- [ ] Database backup created
- [ ] Environment variables configured
- [ ] Team notified
- [ ] Monitoring enabled

---

## 💾 DATABASE MIGRATIONS

### 1. Backup First

```bash
supabase db dump -f backup-$(date +%Y%m%d).sql
```

### 2. Apply Migrations

```bash
supabase db push --linked
```

### 3. Verify

```sql
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;
```

---

## 🚀 FRONTEND DEPLOYMENT

### Vercel Deployment

```bash
# Deploy to production
vercel --prod

# Or push to main branch (auto-deploys)
git push origin main
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

### Smoke Tests:

1. **Homepage**: https://your-domain.com → Should load
2. **Shop**: /shop → Products display
3. **Auth**: Login/Register → Works with spinner
4. **Cart**: Add product → Cart updates
5. **Track Order**: /track-order → Order details show
6. **Profile**: /profile → User data displays

### Quick Test Script:

```bash
DOMAIN="https://your-domain.com"
curl -f $DOMAIN && echo "✅ Homepage OK"
curl -f $DOMAIN/shop && echo "✅ Shop OK"
curl -f $DOMAIN/track-order && echo "✅ Track Order OK"
```

---

## 🔄 ROLLBACK PROCEDURE

### Frontend Rollback (Vercel):

```bash
vercel rollback [previous-deployment-url]
```

### Database Rollback:

```bash
# Restore backup
supabase db restore backup-20251018.sql

# Or rollback specific migration
supabase migration down --version [version]
```

---

## 📊 MONITORING

### Check These Metrics:

- **Error Rate**: Should be < 0.5%
- **Response Time**: < 2s average
- **Uptime**: 99.9%+

### Alert Thresholds:

- 🚨 **Critical**: Error rate > 1%, Site down
- ⚠️ **Warning**: Response time > 3s, Error rate > 0.5%

---

## 🔧 COMMON ISSUES

### Build Fails
```bash
rm -rf .next && npm run build
```

### Environment Variables Missing
```bash
vercel env ls
vercel env add VARIABLE_NAME production
```

### Database Connection Error
- Check Supabase status
- Verify connection string
- Test with `psql $DATABASE_URL`

---

## 🎯 SUCCESS CRITERIA

✅ All smoke tests pass  
✅ Error rate < 0.5%  
✅ Response times < 2s  
✅ No customer complaints  
✅ Monitoring shows green

---

**Deploy with confidence!** 🚀
