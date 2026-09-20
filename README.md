# Higlou Magic Studio

Private Higlou app that analyzes product photos and builds a perfect listing CSV for **eBay** and the same payload for our marketplace.

**ZXing barcodes → Google Vision OCR (smart) → OpenAI multimodal → result fusion → Higlou HTML + eBay CSV → optional publish to Don Baraton**

Scope: product analysis and listing export only (no creative/campaign image studio).

> Marketplace storefront (**Don Baraton Outlet**) is a separate repo:  
> https://github.com/unitybox123/MARKET-PLACE-OUTLET

## Brand

- App: **Higlou Magic Studio** (eBay listing generator)
- Accent: `#f4c928`
- Never use “Highlou”

## Setup

```bash
cp .env.example .env.local
npm install
```

Fill `.env.local` (never commit secrets):

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_CLIENT_EMAIL=
GOOGLE_CLOUD_PRIVATE_KEY=
GOOGLE_VISION_ENABLED=true
GOOGLE_VISION_MODE=fallback
GOOGLE_VISION_MAX_IMAGES=4
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PRODUCT_IMAGES_BUCKET=product-images
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Apply `supabase/schema.sql` (includes `ai_usage_events`). Create Auth admin manually. Create public-read bucket `product-images`.

```bash
npm run dev
```

## Hybrid analysis

| Layer | Role |
|------|------|
| ZXing (`@zxing/library`, encapsulated) | Local barcode/UPC/EAN/QR decode + checksum validation |
| Google Cloud Vision | OCR on packaging/label candidates only (`TEXT_DETECTION`, document fallback) |
| OpenAI multimodal | Primary reasoning + listing generation with OCR/barcode evidence |
| Fusion engine | Priority: user → valid barcode → OCR → OpenAI → defaults |

Modes for Vision: `off` | `fallback` (default) | `always`.

UI: **Create Listing With AI** runs the full pipeline. **Improve OCR** forces Vision on OCR candidates.

If Vision or ZXing fails, analysis continues with the remaining providers (non-blocking).

### Google Cloud Vision setup

1. Create/select a GCP project and enable billing.
2. Enable **Cloud Vision API**.
3. Create a dedicated Service Account with Vision user permissions only.
4. Create a JSON key and map fields into `.env.local` (**do not commit the JSON**):

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CLIENT_EMAIL=your-sa@your-project.iam.gserviceaccount.com
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_VISION_ENABLED=true
GOOGLE_VISION_MODE=fallback
GOOGLE_VISION_MAX_IMAGES=4
```

5. Convert real newlines in the private key to `\n` inside the quoted env value.
6. Restart `npm run dev` after changing env vars.
7. Set budget alerts in GCP.
8. Disable OCR anytime via Settings → **AI Providers** (uncheck Google Vision) or OCR Mode `Off` — no code change required.

**Never use API Keys for Vision.** Authentication is Service Account only, server-side via `@google-cloud/vision`.

Pipeline order: **ZXing → Google Vision (selected images) → OpenAI**. Vision failures never block OpenAI. OCR results are cached by image hash.

### ZXing notes

Packaged behind `lib/barcode/decoder.ts` (`BarcodeDecoder` interface) so it can be swapped if the upstream library stays under-maintained.

### OpenAI

Server-only `OPENAI_API_KEY`. Never use `NEXT_PUBLIC_` for secrets.

## Usage & costs (500 products / month target)

Operating estimates only — **not an invoice**. Marketplace fees, COGS, and taxes are excluded.

| Target | Value |
|--------|------:|
| Monthly products | 500 |
| Optimized opex | ~$60–$70 |
| Recommended budget | $75–$100 |
| Per-product goal | ~$0.12–$0.20 |

Controls:

- Editable rates via `.env` + `provider_pricing_settings` (never scrape prices)
- Real OpenAI `usage` tokens recorded in `ai_usage_events`
- Google Vision in `fallback` mode (max 4 images), after ZXing
- Economy model first; Advanced / Deep Analysis only on fallback or explicit request
- OCR cache by image hash; partial title/description regen without re-analyzing images
- Dashboard: **Usage & Costs** (`/usage`)
- Settings → **Budget & Cost Controls** (`warn_only` by default)

Apply migration `supabase/migrations/20260713_costs.sql` (also included in `schema.sql`).

## CSV integrity

Seed: `templates/ebay-draft-listing-template.csv`  
SHA256: `E8840560B3359BAB0825F1BEE48DAD3F4C58D6AF9BC2B412630FB928C4793C3A`

- Exact `#INFO` preserved
- UTF-8 BOM
- Headers by name
- Photos: HTTPS URLs with `|`
- Description: Higlou Store HTML

## Affiliate & Facebook

- **Affiliate hub** (`/affiliate`): current Amazon Associates links, click/revenue stats, share to Facebook / WhatsApp / X.
- **Settings → Stores → Facebook**: each user connects their own Page (token encrypted at rest).
- **Promo Facebook** (`/facebook`): carousel/vitrina unlocked for every signed-in account.
- Apply migration `supabase/migrations/20260920_facebook_connections.sql`.
- Optional `FACEBOOK_TOKEN_ENCRYPTION_KEY` (falls back to `EBAY_TOKEN_ENCRYPTION_KEY`, ≥32 chars).

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
```

## Troubleshooting

| Issue | Fix |
|------|-----|
| Invalid Google credentials | Check client email + private key `\n` escaping |
| Billing not enabled | Enable GCP billing |
| Vision API not enabled | Enable Cloud Vision API |
| OCR empty | Use Improve OCR / add packaging photos |
| Barcode not decoded | Try clearer barcode photos; checksum must validate for UPC/EAN |
| OpenAI validation fails | Check model output / retries |
| Image URL forbidden | Must be owned Supabase HTTPS URL (or allowed demo hosts) |
