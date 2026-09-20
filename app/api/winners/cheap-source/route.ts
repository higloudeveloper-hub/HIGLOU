import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { findCheaperSources } from "@/lib/sourcing/find-cheaper";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().min(2).max(300),
  brand: z.string().max(120).optional().default(""),
  mpn: z.string().max(80).optional().default(""),
  upc: z.string().max(32).optional().default(""),
  imageUrl: z.string().max(2000).optional().default(""),
  buyPrice: z.number().positive().nullable().optional(),
  sellPrice: z.number().positive().nullable().optional(),
});

/**
 * Locate the same winner cheaper: Alibaba, AliExpress, brand direct,
 * plus Google Vision web/OCR identity when configured.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rate = checkRateLimit({
    key: `cheap-source:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many cheap-source lookups. Wait a minute." },
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
      { error: "Send title (and preferably imageUrl + buyPrice)." },
      { status: 400 },
    );
  }

  try {
    const imageUrl = String(body.imageUrl || "").trim();
    const result = await findCheaperSources({
      title: body.title,
      brand: body.brand,
      mpn: body.mpn,
      upc: body.upc,
      imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,
      buyPrice: body.buyPrice,
      sellPrice: body.sellPrice,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cheap source lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
