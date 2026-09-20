import { isKeepaConfigured } from "@/lib/keepa/config";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Higlou eBay Listing Generator",
    brand: "Higlou Store",
    keepa: isKeepaConfigured() ? "configured" : "missing",
  });
}
