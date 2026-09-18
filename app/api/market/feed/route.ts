import { NextResponse } from "next/server";
import { MARKET_DROPS, marketSpread } from "@/lib/market/catalog";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    drops: MARKET_DROPS.map((d) => ({
      id: d.id,
      name: d.name,
      title: d.title,
      blurb: d.blurb,
      photo: d.photo,
      buy: d.buy,
      sell: d.sell,
      comps: d.comps,
      spread: marketSpread(d),
      heat: d.heat,
      ships: d.ships,
      supplier: d.supplier,
      asin: d.asin ?? null,
      note: "Est. spread after supplier cost — not sold comps",
    })),
  });
}
