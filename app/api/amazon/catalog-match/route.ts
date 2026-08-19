import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { resolveAmazonCatalogMatch } from "@/lib/amazon/catalog-resolve";
import {
  amazonSpMissingReason,
  getAmazonSpConfig,
  isAmazonSpConfigured,
} from "@/lib/amazon/sp-config";
import {
  getAmazonConnectionPublic,
  getValidAmazonAccessToken,
} from "@/lib/amazon/sp-oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  productId: z.string().uuid().optional(),
  listing: z.object({
    title: z.string().min(1),
    sku: z.string().optional().default(""),
    upc: z.string().optional().default(""),
    asin: z.string().optional().default(""),
    amazonAsin: z.string().optional().default(""),
    brand: z.string().optional().default(""),
    model: z.string().optional().default(""),
    mpn: z.string().optional().default(""),
    description: z.string().optional().default(""),
    imageLabels: z.array(z.string()).optional().default([]),
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
      { error: "Send the listing title to search Amazon." },
      { status: 400 },
    );
  }

  try {
    const creds = await getValidAmazonAccessToken(auth.supabase, auth.user.id);
    const cfg = getAmazonSpConfig();
    const resolved = await resolveAmazonCatalogMatch({
      accessToken: creds.token,
      marketplaceId: cfg.marketplaceId,
      listing: parsed.listing,
    });

    if (
      parsed.productId &&
      resolved.mode === "existing" &&
      /^[A-Z0-9]{10}$/i.test(resolved.asin)
    ) {
      try {
        const admin = createAdminClient();
        await admin
          .from("products")
          .update({
            amazon_asin: resolved.asin.toUpperCase(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", parsed.productId)
          .eq("user_id", auth.user.id);
      } catch {
        /* preview still works if the extra column is not migrated */
      }
    }

    return NextResponse.json({
      ok: true,
      mode: resolved.mode,
      asin: resolved.asin,
      title: resolved.title,
      productType: resolved.productType,
      imageUrl: resolved.imageUrl || resolved.catalog?.images?.[0] || "",
      query: resolved.query || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon catalog search failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
