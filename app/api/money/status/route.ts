import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { isAmazonAssociatesConfigured } from "@/lib/monetization/affiliate/amazon-associates";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const enabled = isMoneyEngineEnabled();
  return NextResponse.json({
    enabled,
    flags: enabled
      ? getMonetizationFlags()
      : {
          moneyEngine: false,
          affiliateEngine: false,
          smartLinks: false,
          moneyScore: false,
        },
    associateConfigured: isAmazonAssociatesConfigured(),
  });
}
