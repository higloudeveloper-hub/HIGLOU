import { NextResponse } from "next/server";
import { z } from "zod";
import { pushEbayCsvToDonBaraton } from "@/lib/don-baraton/import-ebay-csv";
import { getDonBaratonConfig } from "@/lib/don-baraton/config";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  csv: z.string().min(1),
  fileName: z.string().min(1).default("Higlou_Export.csv"),
});

/**
 * Re-send an already-generated eBay CSV to Don Baratón without blocking eBay.
 * Prefer the automatic sync from POST /api/generate-csv; this is for retries.
 */
export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const auth = await requireUser();
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const config = getDonBaratonConfig();
  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Don Baratón sync is not configured. Set DON_BARATON_API_URL and DON_BARATON_IMPORT_TOKEN.",
      },
      { status: 503 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Expected JSON { csv, fileName }" },
      { status: 400 },
    );
  }

  const result = await pushEbayCsvToDonBaraton(body.csv, body.fileName);
  if (result.status === "ok") {
    return NextResponse.json({
      ok: true,
      batchId: result.batchId,
      summary: result.summary,
      message: result.message || "Imported to Don Baratón",
      storefrontUrl: config.apiUrl,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.status === "error" ? result.message : result.reason,
    },
    { status: result.status === "error" ? 502 : 503 },
  );
}
