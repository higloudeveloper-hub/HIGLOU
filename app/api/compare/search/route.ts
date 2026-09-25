import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCompareProducts } from "@/lib/compare/trending";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const bodySchema = z.object({
  q: z.string().min(2).max(120),
  limit: z.number().int().min(4).max(20).optional(),
});

/**
 * Public: keyword search → Keepa products for Compare marketplace.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `compare-search:${clientKeyFromRequest(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas. Esperá un minuto." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
        },
      },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Enviá { q: "auriculares bluetooth" }' },
      { status: 400 },
    );
  }

  try {
    const result = await searchCompareProducts(body.q, { limit: body.limit });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Búsqueda Keepa no disponible.",
        items: [],
      },
      { status: 502 },
    );
  }
}
