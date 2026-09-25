import { NextResponse } from "next/server";
import {
  COMPARE_CATEGORIES,
  COMPARE_LANES,
  loadCompareTrending,
} from "@/lib/compare/trending";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Public marketplace floor for Higlou Compare.
 * GET ?lane=hot_deals&category=home&limit=12
 */
export async function GET(request: Request) {
  const rate = checkRateLimit({
    key: `compare-trend:${clientKeyFromRequest(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Esperá un minuto." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
        },
      },
    );
  }

  const url = new URL(request.url);
  const lane = url.searchParams.get("lane");
  const categoryId = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit") || 12);
  const seed = Number(url.searchParams.get("seed") || Date.now() % 97);

  try {
    const result = await loadCompareTrending({
      lane,
      categoryId,
      limit: Number.isFinite(limit) ? limit : 12,
      seed: Number.isFinite(seed) ? seed : 0,
    });
    return NextResponse.json({
      ...result,
      lanes: COMPARE_LANES,
      categories: COMPARE_CATEGORIES,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "No pudimos cargar tendencias Keepa.",
        items: [],
        lanes: COMPARE_LANES,
        categories: COMPARE_CATEGORIES,
      },
      { status: 502 },
    );
  }
}
