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
| `/money` | Money Center + Autopilot (piloto) |
| `/winners` | Find Winners — feed the machine |
| `/go/[id]` | Smart link redirect + click log |
| Review listing | Product Money Card |
| `/api/money/*` | Recommendation, score, affiliate, QR, dashboard, watchlist, autopilot |

## Autopilot (Money Machine)

1. Open **Find Winners** and run a live scan (fills opportunity ledger).
2. Open **Money Center** → flip **ENCENDIDO** → **Run cycle**.
3. Review the ranked money queue (SELL / BOTH / AFFILIATE / WATCH).
4. Import / publish yourself — Autopilot v1 does **not** buy or publish alone.

Env: `AUTOPILOT_ENABLED=true` (requires `MONEY_ENGINE_ENABLED=true`).

## Rules

- REAL DATA > UNKNOWN > FAKE DATA
- Never invent affiliate commissions or conversions
- Do not claim self-purchase commissions
- Smart links redirect once to a real Associates URL (`tag=`) — no destination cloaking
- Opportunity / Find Winners scores are **not** replaced; Money Score is additive

## Code

- `lib/monetization/` — decision engine, score, affiliate adapters, smart links, QR
- Does **not** modify `components/studio/money-engine.tsx` (legacy ListingPipeline alias)
