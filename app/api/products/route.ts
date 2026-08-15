import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  mapProductRow,
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("products")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id));

  let coverByProduct = new Map<string, string>();
  if (ids.length > 0) {
    const { data: images } = await auth.supabase
      .from("product_images")
      .select("product_id, public_url, is_primary, sort_order")
      .in("product_id", ids)
      .order("sort_order", { ascending: true });

    const sorted = [...(images ?? [])].sort((a, b) => {
      const primaryA = a.is_primary ? 0 : 1;
      const primaryB = b.is_primary ? 0 : 1;
      if (primaryA !== primaryB) return primaryA - primaryB;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });

    const photosByProduct = new Map<string, string[]>();
    coverByProduct = new Map();
    for (const img of sorted) {
      const productId = String(img.product_id);
      const url = String(img.public_url ?? "").replace(/[\r\n\t]+/g, "").trim();
      if (!url) continue;
      const list = photosByProduct.get(productId) ?? [];
      if (list.length < 6) {
        list.push(url);
        photosByProduct.set(productId, list);
      }
      if (!coverByProduct.has(productId)) coverByProduct.set(productId, url);
    }

    return NextResponse.json({
      products: rows.map((row) => {
        const product = mapProductRow(row);
        const photos = photosByProduct.get(String(row.id)) ?? [];
        return {
          ...product,
          coverUrl: coverByProduct.get(String(row.id)) ?? null,
          photos,
          photoCount: photos.length,
        };
      }),
    });
  }

  return NextResponse.json({
    products: rows.map((row) => {
      const product = mapProductRow(row);
      return {
        ...product,
        coverUrl: coverByProduct.get(String(row.id)) ?? null,
        photos: [] as string[],
        photoCount: 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const json = await request.json();
    const data = productBodySchema.parse(json);
    const columns = toDbColumns(data);

    const { data: inserted, error } = await auth.supabase
      .from("products")
      .insert({
        ...columns,
        user_id: auth.user.id,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message || "Failed to create product" },
        { status: 500 },
      );
    }

    // Product row is the source of truth for /listings. Related rows are best-effort
    // so a specifics/image glitch cannot hide the listing from the library.
    try {
      await syncRelated(auth.supabase, auth.user.id, inserted.id, data);
    } catch (relatedError) {
      console.error("product related sync failed", relatedError);
    }

    const [{ data: images }, { data: specifics }] = await Promise.all([
      auth.supabase
        .from("product_images")
        .select("*")
        .eq("product_id", inserted.id)
        .order("sort_order"),
      auth.supabase
        .from("product_item_specifics")
        .select("*")
        .eq("product_id", inserted.id),
    ]);

    return NextResponse.json(
      {
        product: mapProductRow(
          inserted as Record<string, unknown>,
          (images ?? []) as Array<Record<string, unknown>>,
          (specifics ?? []) as Array<Record<string, unknown>>,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
