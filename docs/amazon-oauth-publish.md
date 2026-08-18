# Connect Amazon Seller and publish from Higlou

Higlou lists an **offer** on a product Amazon already sells. It matches by **UPC** or **ASIN**. It does not create a new Amazon catalog product (brand gating / product-type schemas).

Private SP-API apps (Higlou Store) do not expose Login/Redirect URIs. Connect by pasting the self-authorize **refresh token** in Settings.

## One-time setup (Higlou admin)

1. Create the SP-API app in the Solution Provider Portal (Production, Sellers). The Amazon app name can stay whatever Amazon approved.
2. Copy LWA client id, client secret, and application id into the **Higlou** Vercel project (`higlou.vercel.app`):

```
AMAZON_SP_API_ENV=production
AMAZON_LWA_CLIENT_ID=...
AMAZON_LWA_CLIENT_SECRET=...
AMAZON_APP_ID=amzn1.sp.solution....
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
AMAZON_APP_DRAFT=1
```

Token encryption reuses `EBAY_TOKEN_ENCRYPTION_KEY` unless `AMAZON_TOKEN_ENCRYPTION_KEY` is set. Optional: `AMAZON_SELLING_PARTNER_ID` if Amazon does not return the merchant token.

3. Run the SQL migration [`supabase/migrations/20260818_amazon_connections.sql`](../supabase/migrations/20260818_amazon_connections.sql) on the Higlou Supabase project.

## Seller flow

1. Amazon Developer Console → your app → **Ver** authorizations → copy **Ficha de actualización**
2. Higlou Settings → Stores → paste token → **Save Amazon token**
3. On Export: **Publish to Amazon**
4. Higlou matches the Amazon catalog, copies product facts, asks Amazon what is still missing, fills those fields, and goes live only if Amazon returns VALID.

## Key files

- Self-authorize: `lib/amazon/sp-oauth.ts`, `app/api/amazon/self-authorize/route.ts`
- Publish: `lib/amazon/publish-listing.ts`, `app/api/amazon/publish/route.ts`
- UI: `components/settings/amazon-connect-form.tsx`, Export panel
