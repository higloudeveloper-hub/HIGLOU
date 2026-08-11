# Higlou clean migration map

## New ownership (source of truth)

| Thing | Value |
|--------|--------|
| Gmail | `higloudeveloper@gmail.com` |
| GitHub | https://github.com/higloudeveloper-hub/HIGLOU |
| Supabase org | `higloudeveloper-hub's Org` |
| Supabase project name | `higlou-magic-studio` (create under that org) |

## Old (backup only — still works via API)

| Thing | Value |
|--------|--------|
| Supabase | `ateaihzmiezmfrkpyvuh` |
| GitHub (legacy) | `unitybox123/higlou-magic-studio` |
| Vercel | Dayron team → `higlou-magic-studio-psi.vercel.app` |

## Don Baratón (do not mix)

| Thing | Value |
|--------|--------|
| Supabase | `Don Baraton sup` / `cfjoajcvixkzbhkdzwsj` |

## Steps

1. Create Supabase **project** `higlou-magic-studio` under the new org (US East).
2. SQL Editor → paste `supabase/bootstrap/001_full_schema.sql` → Run.
3. Copy Project URL + anon + service_role into `.env.migrate`:
   ```
   NEW_SUPABASE_URL=https://xxxxx.supabase.co
   NEW_SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEW_ADMIN_EMAIL=higloudeveloper@gmail.com
   NEW_ADMIN_PASSWORD=ChooseAStrongPass123!
   ```
4. `node scripts/migrate/export-from-old.mjs` (already done if `_migration_backup/LATEST` exists)
5. `node scripts/migrate/import-to-new.mjs`
6. Point `.env.local` + Vercel Production to the new URL/keys.
7. Push code to `higloudeveloper-hub/HIGLOU`.
8. Recreate eBay RuName Accept URL if domain stays psi (same callback path).
