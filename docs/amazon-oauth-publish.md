# Connect Amazon Seller and publish from Higlou

Higlou lists an **offer** on a product Amazon already sells. It matches by **UPC** or **ASIN**. It does not create a new Amazon catalog product (brand gating / product-type schemas).

## One-time setup (Higlou admin)

1. In [Seller Central](https://sellercentral.amazon.com/) go to **Apps and Services → Develop Apps → Add new app client**.
2. Roles: **Product Listing**, plus Inventory/Pricing if asked.
3. Register these URIs (production):
   - Login URI: `https://higlou.vercel.app/api/amazon/oauth/login`
   - Redirect URI: `https://higlou.vercel.app/api/amazon/oauth/callback`
4. Copy LWA client id, client secret, and application id into Vercel:

```
AMAZON_SP_API_ENV=production
AMAZON_LWA_CLIENT_ID=...
AMAZON_LWA_CLIENT_SECRET=...
AMAZON_APP_ID=amzn1.sellerapps.app....
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
AMAZON_APP_DRAFT=1
```

Token encryption reuses `EBAY_TOKEN_ENCRYPTION_KEY` unless `AMAZON_TOKEN_ENCRYPTION_KEY` is set.

5. Run the SQL migration [`supabase/migrations/20260818_amazon_connections.sql`](../supabase/migrations/20260818_amazon_connections.sql) on the Higlou Supabase project.

6. While the app is **Draft**, keep `AMAZON_APP_DRAFT=1` so consent uses `version=beta`.

## Seller flow

1. Settings → Stores → **Connect Amazon seller**
2. Approve Higlou in Seller Central
3. On Export: **Publish to Amazon**
4. Higlou looks up the catalog (UPC or `AMZ-` ASIN from an Amazon import) and puts the offer (price, qty, condition)

## Key files

- OAuth: `lib/amazon/sp-oauth.ts`, `app/api/amazon/oauth/*`
- Publish: `lib/amazon/publish-listing.ts`, `app/api/amazon/publish/route.ts`
- UI: `components/settings/amazon-connect-form.tsx`, Export panel
