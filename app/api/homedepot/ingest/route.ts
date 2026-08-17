import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/images/storage";
import { verifyHomeDepotCaptureToken } from "@/lib/homedepot/capture-token";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const HD_ORIGIN =
  /^https:\/\/(www\.)?homedepot\.(com|ca|com\.mx)$/i;

const bodySchema = z.object({
  token: z.string().min(16).max(500),
  url: z.string().min(8).max(2000),
  html: z.string().min(800).max(6_000_000),
});

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && HD_ORIGIN.test(origin) ? origin : "https://www.homedepot.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

function capturePath(userId: string, token: string): string {
  const safe = token.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 180);
  return `${userId}/hd-capture/${safe || "token"}.json`;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Sign in to import from Home Depot." }, { status: 503, headers });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send the Home Depot gallery JSON." }, { status: 400, headers });
  }

  const verified = verifyHomeDepotCaptureToken(parsed.token);
  if (!verified) {
    return NextResponse.json({ error: "Capture expired. Import the link again." }, { status: 401, headers });
  }

  const rate = checkRateLimit({
    key: `hd-ingest:${verified.userId}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many captures. Wait a minute." }, { status: 429, headers });
  }

  try {
    const admin = createAdminClient();
    const payload = JSON.stringify({
      url: parsed.url,
      html: parsed.html,
      userId: verified.userId,
      at: Date.now(),
    });
    const { error } = await admin.storage.from(PRODUCT_IMAGES_BUCKET).upload(
      capturePath(verified.userId, parsed.token),
      Buffer.from(payload),
      { contentType: "text/plain", upsert: true },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture failed";
    return NextResponse.json({ error: message }, { status: 502, headers });
  }
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Sign in to import from Home Depot." }, { status: 503 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const token = new URL(request.url).searchParams.get("token") || "";
  const verified = verifyHomeDepotCaptureToken(token);
  if (!verified || verified.userId !== auth.user.id) {
    return NextResponse.json({ ok: false, pending: true });
  }

  const rate = checkRateLimit({
    key: `hd-ingest-read:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, pending: true });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .download(capturePath(auth.user.id, token));
    if (error || !data) {
      return NextResponse.json({ ok: false, pending: true });
    }
    const text = await data.text();
    const row = JSON.parse(text) as { url?: string; html?: string; userId?: string };
    if (row.userId !== auth.user.id || !row.url || !row.html) {
      return NextResponse.json({ ok: false, pending: true });
    }
    await admin.storage.from(PRODUCT_IMAGES_BUCKET).remove([
      capturePath(auth.user.id, token),
    ]);
    return NextResponse.json({ ok: true, url: row.url, html: row.html });
  } catch {
    return NextResponse.json({ ok: false, pending: true });
  }
}
