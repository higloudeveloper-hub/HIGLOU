import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  mapProductRow,
  parseProductPatch,
  productBodySchema,
  syncRelated,
} from "@/lib/products/persistence";
import {
  applyVariantSelection,
  variationsFromListing,
  withEncodedVariations,
} from "@/lib/listing/variations";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function loadProductBundle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  id: string,
) {
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!product) return null;

  const [{ data: images }, { data: specifics }] = await Promise.all([
    supabase
      .from("product_images")
      .select("*")
      .eq("product_id", id)
      .order("sort_order"),
    supabase.from("product_item_specifics").select("*").eq("product_id", id),
  ]);

  return mapProductRow(
    product as Record<string, unknown>,
    (images ?? []) as Array<Record<string, unknown>>,
    (specifics ?? []) as Array<Record<string, unknown>>,
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const product = await loadProductBundle(auth.supabase, auth.user.id, id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const json = (await request.json()) as Record<string, unknown>;
    const selectedRaw = json.selectedVariationAsins;
    delete json.selectedVariationAsins;
    if (Array.isArray(selectedRaw)) {
      const current = await loadProductBundle(auth.supabase, auth.user.id, id);
      if (!current) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      const set = variationsFromListing(current);
      if (set) {
        json.itemSpecifics = withEncodedVariations(
          current.itemSpecifics,
          applyVariantSelection(
            set,
            selectedRaw.map((value) => String(value || "")),
          ),
        );
      }
    }
    const { data, columns: patchColumns, requested } = parseProductPatch(json);
    const columns: Record<string, unknown> = {
      ...patchColumns,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await auth.supabase
      .from("products")
      .update(columns)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (requested.has("images") || requested.has("itemSpecifics")) {
      await syncRelated(auth.supabase, auth.user.id, id, {
        ...productBodySchema.parse({}),
        ...data,
        images: requested.has("images") ? (data.images ?? []) : [],
        itemSpecifics: requested.has("itemSpecifics")
          ? (data.itemSpecifics ?? [])
          : [],
      });
    }

    const product = await loadProductBundle(auth.supabase, auth.user.id, id);
    return NextResponse.json({ product });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { error } = await auth.supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
