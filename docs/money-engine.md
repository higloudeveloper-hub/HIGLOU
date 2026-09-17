# Money Engine / Money Center

Private monetization module. **Off by default.** Existing Higlou flows are unchanged when flags are disabled.

## Enable

```env
MONEY_ENGINE_ENABLED=true
AFFILIATE_ENGINE_ENABLED=true
SMART_LINKS_ENABLED=true
MONEY_SCORE_ENABLED=true
AMAZON_ASSOCIATE_TAG=your-tag-20
AMAZON_ASSOCIATE_MARKETPLACE=US
```

Apply migration:

`supabase/migrations/20260916_monetization.sql`

## Surfaces

| Path | Role |
|------|------|
| `/money` | Money Center dashboard |
| `/go/[id]` | Smart link redirect + click log |
| Review listing | Product Money Card |
| `/api/money/*` | Recommendation, score, affiliate, QR, dashboard, watchlist |

## Rules

- REAL DATA > UNKNOWN > FAKE DATA
- Never invent affiliate commissions or conversions
- Do not claim self-purchase commissions
- Smart links redirect once to a real Associates URL (`tag=`) — no destination cloaking
- Opportunity / Find Winners scores are **not** replaced; Money Score is additive

## Code

- `lib/monetization/` — decision engine, score, affiliate adapters, smart links, QR
- Does **not** modify `components/studio/money-engine.tsx` (legacy ListingPipeline alias)
