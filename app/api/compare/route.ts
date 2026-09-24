import { NextResponse } from "next/server";
import { z } from "zod";
import { compareAmazonProduct } from "@/lib/compare/from-amazon";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(3).max(800),
});

/**
 * Public: paste Amazon link → same product cheaper elsewhere + affiliate Amazon.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `compare:${clientKeyFromRequest(request)}`,
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
      { error: "Enviá { url: \"https://www.amazon.com/dp/…\" }" },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const result = await compareAmazonProduct(body.url, { pageOrigin: origin });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
