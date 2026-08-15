import { NextResponse } from "next/server";
import { z } from "zod";
import { publishProductToDonBaraton } from "@/lib/marketplace/publish-listing";
import { requireOwner } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

const bodySchema = z.object({
  productId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Connect the database to publish to Don Baraton.",
      },
      { status: 503 },
    );
  }

  const auth = await requireOwner();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const listing = await publishProductToDonBaraton(auth.supabase, {
      productId: body.productId,
      userId: auth.user.id,
    });
    return NextResponse.json({
      ok: true,
      listing,
      storefrontUrl: `/item/${listing.slug}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish listing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
