import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  disconnectFacebook,
  getFacebookConnectionPublic,
  saveFacebookConnection,
} from "@/lib/facebook/connection";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const saveSchema = z.object({
  pageId: z.string().min(5).max(40),
  pageName: z.string().max(120).optional().nullable(),
  accessToken: z.string().min(20).max(4000),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      connection: {
        connected: false,
        pageId: null,
        pageName: null,
        connectedAt: null,
        lastError: null,
        lastShareAt: null,
        encryptionReady: false,
      },
    });
  }
  const connection = await getFacebookConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  return NextResponse.json({ connection });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is required to save Facebook connection" },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof saveSchema>;
  try {
    parsed = saveSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send { pageId, accessToken }" },
      { status: 400 },
    );
  }

  const saved = await saveFacebookConnection(auth.supabase, {
    userId: auth.user.id,
    pageId: parsed.pageId,
    pageName: parsed.pageName,
    accessToken: parsed.accessToken,
  });
  if (!saved.ok) {
    return NextResponse.json(
      {
        error: saved.error,
        connection: saved.connection || null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, connection: saved.connection });
}

export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }
  await disconnectFacebook(auth.supabase, auth.user.id);
  return NextResponse.json({ ok: true });
}
