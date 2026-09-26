import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  disconnectFacebook,
  getFacebookConnectionPublic,
  maybeBootstrapFacebookConnection,
  saveFacebookConnection,
} from "@/lib/facebook/connection";
import { HIGLOU_FACEBOOK } from "@/lib/facebook/permanent-token";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const saveSchema = z.object({
  pageId: z.string().min(5).max(40).optional(),
  pageName: z.string().max(120).optional().nullable(),
  accessToken: z.string().min(20).max(4000),
  appId: z.string().min(5).max(40).optional().nullable(),
  appSecret: z.string().min(8).max(200).optional().nullable(),
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
      defaults: {
        pageId: HIGLOU_FACEBOOK.pageId,
        pageName: HIGLOU_FACEBOOK.pageName,
        appId: HIGLOU_FACEBOOK.appId,
      },
    });
  }

  let connection = await getFacebookConnectionPublic(
    auth.supabase,
    auth.user.id,
  );

  // Overnight bootstrap: Page token from Vercel env → this user
  if (!connection.connected) {
    const bootstrapped = await maybeBootstrapFacebookConnection(
      auth.supabase,
      auth.user.id,
      auth.user.email,
    );
    if (bootstrapped?.connected) connection = bootstrapped;
  }

  return NextResponse.json({
    connection,
    defaults: {
      pageId: HIGLOU_FACEBOOK.pageId,
      pageName: HIGLOU_FACEBOOK.pageName,
      appId: HIGLOU_FACEBOOK.appId,
    },
  });
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
      { error: "Send { accessToken, appSecret? }" },
      { status: 400 },
    );
  }

  const saved = await saveFacebookConnection(auth.supabase, {
    userId: auth.user.id,
    pageId: parsed.pageId || HIGLOU_FACEBOOK.pageId,
    pageName: parsed.pageName || HIGLOU_FACEBOOK.pageName,
    accessToken: parsed.accessToken,
    appId: parsed.appId || HIGLOU_FACEBOOK.appId,
    appSecret: parsed.appSecret,
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
  const connection = await getFacebookConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  return NextResponse.json({
    ok: true,
    connection: {
      ...connection,
      connected: false,
      pageId: null,
      pageName: null,
      lastError: null,
    },
  });
}
