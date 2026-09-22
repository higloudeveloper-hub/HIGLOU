import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  deleteFacebookPagePosts,
  listFacebookPagePosts,
} from "@/lib/facebook/delete-page-posts";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const deleteSchema = z.object({
  /** How many newest posts to delete */
  max: z.coerce.number().int().min(1).max(500).default(50),
  /** Must type BORRAR for max > 50 */
  confirm: z.string().optional(),
});

/** Preview: list recent Page posts. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const creds = await loadFacebookPageCredentials(
    auth.supabase,
    auth.user.id,
  );
  if (!creds) {
    return NextResponse.json(
      { error: "Conectá tu Facebook Page en Settings primero." },
      { status: 400 },
    );
  }

  const listed = await listFacebookPagePosts({
    pageId: creds.pageId,
    accessToken: creds.accessToken,
    limit: 25,
  });
  if (!listed.ok) {
    return NextResponse.json({ error: listed.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    pageId: creds.pageId,
    pageName: creds.pageName,
    posts: listed.posts,
    hasMore: listed.hasMore,
  });
}

/** Bulk delete newest published Page posts. */
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let parsed: z.infer<typeof deleteSchema>;
  try {
    const json = await request.json().catch(() => ({}));
    parsed = deleteSchema.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Send { max: 50|200|500, confirm?: \"BORRAR\" }" },
      { status: 400 },
    );
  }

  if (parsed.max > 50 && String(parsed.confirm || "").trim().toUpperCase() !== "BORRAR") {
    return NextResponse.json(
      {
        error:
          'Para borrar más de 50 posts escribí confirm: "BORRAR" (mayúsculas).',
      },
      { status: 400 },
    );
  }

  const creds = await loadFacebookPageCredentials(
    auth.supabase,
    auth.user.id,
  );
  if (!creds) {
    return NextResponse.json(
      { error: "Conectá tu Facebook Page en Settings primero." },
      { status: 400 },
    );
  }

  const result = await deleteFacebookPagePosts({
    pageId: creds.pageId,
    accessToken: creds.accessToken,
    max: parsed.max,
  });

  return NextResponse.json({
    ok: result.ok,
    deleted: result.deleted,
    failed: result.failed,
    remainingHint: result.remainingHint,
    errors: result.errors,
    message:
      result.deleted > 0
        ? `Se borraron ${result.deleted} post${result.deleted === 1 ? "" : "s"}${
            result.remainingHint
              ? ". Todavía quedan más — volvé a ejecutar."
              : "."
          }`
        : result.errors[0] || "No se borró ningún post.",
  });
}
