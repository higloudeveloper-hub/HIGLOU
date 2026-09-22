import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isOwner(email: string | null | undefined): boolean {
  const allow = String(process.env.HIGLOU_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const mine = String(email || "")
    .trim()
    .toLowerCase();
  // Also allow the Facebook bootstrap owner email
  const boot = String(process.env.FACEBOOK_BOOTSTRAP_USER_EMAIL || "")
    .trim()
    .toLowerCase();
  if (boot && mine === boot) return true;
  return Boolean(mine && allow.includes(mine));
}

const LEGACY_TABLES = [
  "don_baraton_order_items",
  "don_baraton_shipments",
  "don_baraton_orders",
  "don_baraton_listings",
  "db_product_images",
  "db_products",
] as const;

/**
 * Owner-only inventory of legacy Don Baratón tables still in Supabase.
 * DROP must run via SQL migration (service role JS cannot DROP without a DB function).
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isOwner(auth.user.email)) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const admin = createAdminClient();
  const present: string[] = [];
  const gone: string[] = [];

  for (const table of LEGACY_TABLES) {
    const probe = await admin.from(table).select("*", { count: "exact", head: true });
    if (probe.error) gone.push(table);
    else present.push(`${table} (rows≈${probe.count ?? "?"})`);
  }

  let bucket = "gone";
  try {
    const { data, error } = await admin.storage
      .from("don-baraton-images")
      .list("", { limit: 1 });
    if (error) bucket = `gone (${error.message})`;
    else bucket = `present (sample ${(data || []).length})`;
  } catch {
    bucket = "gone";
  }

  return NextResponse.json({
    ok: true,
    present,
    gone,
    bucket,
    sqlMigration: "supabase/migrations/20260922_drop_don_baraton_legacy.sql",
    instruction:
      present.length === 0
        ? "Nada legacy de Don Baratón en tablas — ya limpio."
        : "En Supabase → SQL Editor → pegá y Run el archivo 20260922_drop_don_baraton_legacy.sql",
  });
}

/** Wipe rows from legacy tables (not DROP). Prefer the SQL migration for full removal. */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isOwner(auth.user.email)) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const admin = createAdminClient();
  const cleared: string[] = [];
  const skipped: string[] = [];

  for (const table of LEGACY_TABLES) {
    const probe = await admin.from(table).select("*", { count: "exact", head: true });
    if (probe.error) {
      skipped.push(table);
      continue;
    }
    // Delete all rows — uuid tables use id; if filter fails, skip
    const { error } = await admin
      .from(table)
      .delete()
      .not("id", "is", null);
    if (error) skipped.push(`${table}: ${error.message}`);
    else cleared.push(table);
  }

  // Empty don-baraton-images via Storage API (SQL DELETE is blocked by Supabase)
  let bucketNote = "bucket already gone or empty";
  try {
    const { data: root, error: listErr } = await admin.storage
      .from("don-baraton-images")
      .list("", { limit: 100 });
    if (listErr) {
      skipped.push(`don-baraton-images: ${listErr.message}`);
    } else if (root?.length) {
      const paths: string[] = [];
      for (const entry of root) {
        if (entry.id == null && entry.name) {
          // folder — list one level deep
          const { data: kids } = await admin.storage
            .from("don-baraton-images")
            .list(entry.name, { limit: 100 });
          for (const kid of kids || []) {
            paths.push(`${entry.name}/${kid.name}`);
          }
        } else if (entry.name) {
          paths.push(entry.name);
        }
      }
      if (paths.length) {
        const { error: rmErr } = await admin.storage
          .from("don-baraton-images")
          .remove(paths);
        if (rmErr) skipped.push(`don-baraton-images remove: ${rmErr.message}`);
        else cleared.push(`don-baraton-images (${paths.length} files)`);
      }
      bucketNote = "files cleared via Storage API — delete the empty bucket in Dashboard → Storage if you want";
    }
  } catch (e) {
    skipped.push(
      `don-baraton-images: ${e instanceof Error ? e.message : "error"}`,
    );
  }

  return NextResponse.json({
    ok: true,
    cleared,
    skipped,
    bucketNote,
    note:
      "Filas/tablas: preferí el SQL (solo DROP TABLE). Bucket: usá Storage API o Dashboard — nunca DELETE en storage.objects.",
  });
}
