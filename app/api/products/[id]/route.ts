import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  mapProductRow,
  productBodySchema,
  syncRelated,
} from "@/lib/products/persistence";

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

const fieldMap: Record<string, string> = {
  title: "title",
  subtitle: "subtitle",
  brand: "brand",
  collection: "collection",
  model: "model",
  sku: "sku",
  upc: "upc",
  mpn: "mpn",
  categoryId: "category_id",
  categoryName: "category_name",
  condition: "condition",
  conditionId: "condition_id",
  conditionDescription: "condition_description",
  price: "price",
  quantity: "quantity",
  listingFormat: "listing_format",
  descriptionHtml: "description_html",
  descriptionSummary: "description_summary",
  itemSpecifics: "item_specifics",
  features: "features",
  setIncludes: "set_includes",
  colors: "colors",
  materials: "materials",
  size: "size",
  productType: "product_type",
  shippingPolicyId: "shipping_policy_id",
  returnPolicyId: "return_policy_id",
  paymentPolicyId: "payment_policy_id",
  handlingTime: "handling_time",
  itemLocation: "item_location",
  postalCode: "postal_code",
  country: "country",
  status: "status",
  packageWeightLbs: "package_weight_lbs",
  packageWeightOz: "package_weight_oz",
  packageLengthIn: "package_length_in",
  packageWidthIn: "package_width_in",
  packageDepthIn: "package_depth_in",
  packageSource: "package_source",
};

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
    const json = await request.json();
    const data = productBodySchema.partial().parse(json);
    const columns: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === "images") continue;
      const column = fieldMap[key];
      if (column) columns[column] = value;
    }

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

    if (data.images || data.itemSpecifics) {
      await syncRelated(auth.supabase, auth.user.id, id, {
        ...productBodySchema.parse({}),
        ...data,
        images: data.images ?? [],
        itemSpecifics: data.itemSpecifics ?? [],
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
