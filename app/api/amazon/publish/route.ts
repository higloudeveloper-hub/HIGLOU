import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  amazonSpMissingReason,
  isAmazonSpConfigured,
} from "@/lib/amazon/sp-config";
import {
  getAmazonConnectionPublic,
  getValidAmazonAccessToken,
} from "@/lib/amazon/sp-oauth";
import { publishAmazonOffer } from "@/lib/amazon/publish-listing";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  productId: z.string().uuid().optional(),
  listing: z.object({
    sku: z.string().min(1),
    title: z.string().min(1),
    upc: z.string().optional().default(""),
    asin: z.string().optional().default(""),
    brand: z.string().optional().default(""),
    model: z.string().optional().default(""),
    mpn: z.string().optional().default(""),
    price: z.number().positive(),
    quantity: z.number().int().min(1).default(1),
    condition: z.string().optional().default("New"),
    conditionId: z.string().optional().default("1000"),
    handlingTime: z.number().int().min(1).max(30).optional().default(2),
    description: z.string().optional().default(""),
    features: z.array(z.string()).optional().default([]),
    images: z.array(z.string()).optional().default([]),
    color: z.string().optional().default(""),
    material: z.string().optional().default(""),
    countryOfManufacture: z.string().optional().default(""),
    categoryName: z.string().optional().default(""),
    packageLengthIn: z.number().positive().nullable().optional(),
    packageWidthIn: z.number().positive().nullable().optional(),
    packageDepthIn: z.number().positive().nullable().optional(),
    itemSpecifics: z
      .array(
        z.object({
          label: z.string().optional(),
          key: z.string().optional(),
          value: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
  }),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isAmazonSpConfigured()) {
    return NextResponse.json(
      { error: amazonSpMissingReason(), code: "AMAZON_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const connection = await getAmazonConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  if (!connection.connected) {
    return NextResponse.json(
      {
        error: "Connect your Amazon seller account in Settings first.",
        code: "AMAZON_NOT_CONNECTED",
      },
      { status: 409 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send the listing SKU, title, and price." },
      { status: 400 },
    );
  }

  try {
    const creds = await getValidAmazonAccessToken(auth.supabase, auth.user.id);
    const result = await publishAmazonOffer({
      accessToken: creds.token,
      sellingPartnerId: creds.sellingPartnerId,
      listing: parsed.listing,
    });

    if (parsed.productId) {
      try {
        const admin = createAdminClient();
        await admin
          .from("products")
          .update({
            amazon_sku: result.sku,
            amazon_asin: result.asin,
            amazon_status: result.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", parsed.productId)
          .eq("user_id", auth.user.id);
      } catch {
        /* listing can still succeed if the extra columns are not migrated yet */
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon publish failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
