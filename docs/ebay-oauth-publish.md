# Connect real eBay stores (OAuth) and publish from Higlou

## What this enables

Each Higlou user connects **their own** eBay seller account once. Higlou then can:

1. **Create eBay draft** — Inventory item + unpublished offer (Sell Inventory API)
2. **Publish live** — same flow + `publishOffer` (requires business policies)
3. Keep **Export CSV** / Don Baratón as fallback

## One-time setup (Higlou admin)

1. Create an app at [developer.ebay.com](https://developer.ebay.com/) (start with **Sandbox**).
2. Create a **RuName** whose Accept URL is:
   - Production: `https://higlou-magic-studio-psi.vercel.app/api/ebay/oauth/callback`
   - Local: `http://localhost:3000/api/ebay/oauth/callback`
3. Scopes: `sell.inventory`, `sell.account`, `sell.fulfillment`, `commerce.identity.readonly` (+ base `api_scope`).
4. Apply SQL migration: [`supabase/migrations/20260806_ebay_connections.sql`](../supabase/migrations/20260806_ebay_connections.sql)
5. Set Vercel / `.env` (see `.env.example`):

```
EBAY_ENV=sandbox
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_RU_NAME=...                 # the RuName string, not a URL
EBAY_TOKEN_ENCRYPTION_KEY=...    # ≥32 random chars
EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN=...
NEXT_PUBLIC_APP_URL=https://higlou-magic-studio-psi.vercel.app
```

6. Register Marketplace Account Deletion endpoint:
   `https://higlou-magic-studio-psi.vercel.app/api/ebay/account-deletion`

7. Deploy: `npx vercel --prod` to the Dayron project that owns `*-psi.vercel.app`.

## Seller flow

1. Settings → **eBay store connection** → Connect eBay store
2. Approve Higlou on eBay
3. On Export: **Create eBay draft** (or Publish live when policies are filled)

## Key files

- OAuth: `lib/ebay/oauth.ts`, `app/api/ebay/oauth/*`
- Publish: `app/api/ebay/publish/route.ts`, `lib/ebay/inventory-api.ts`
- UI: `components/settings/ebay-connect-form.tsx`, Export panel
