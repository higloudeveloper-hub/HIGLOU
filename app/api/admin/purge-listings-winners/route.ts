import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  LISTINGS_WINNERS_PURGE_VERSION,
  maybeAutoPurgeListingsWinners,
  purgeListingsAndFindWinners,
} from "@/lib/admin/purge-listings-winners";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/** One-shot for deploy v2 — expires after historyPurgeVersion stamp. */
const BOOTSTRAP_PURGE_SECRET = "higlou-purge-vitrinas-20260924-v2";

function isOwner(email: string | null | undefined): boolean {
  const allow = String(process.env.HIGLOU_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const mine = String(email || "")
    .trim()
    .toLowerCase();
  const boot = String(process.env.FACEBOOK_BOOTSTRAP_USER_EMAIL || "")
    .trim()
    .toLowerCase();
  if (boot && mine === boot) return true;
  return Boolean(mine && allow.includes(mine));
}

function bearerOrQuerySecret(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const urlToken = new URL(request.url).searchParams.get("secret") || "";
  return token || urlToken;
}

function isBootstrapAuth(request: Request): boolean {
  const token = bearerOrQuerySecret(request);
  if (!token) return false;
  const cron = process.env.CRON_SECRET || process.env.RON_CRON_SECRET || "";
  if (cron && token === cron) return true;
  return token === BOOTSTRAP_PURGE_SECRET;
}

/**
 * Owner / cron / one-shot bootstrap: wipe Find Winners + listings + affiliate ghosts.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const admin = createAdminClient();

  if (isBootstrapAuth(request)) {
    const result = await maybeAutoPurgeListingsWinners(admin);
    return NextResponse.json({
      ...result,
      via: "bootstrap",
      version: LISTINGS_WINNERS_PURGE_VERSION,
    });
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isOwner(auth.user.email)) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  let body: { confirm?: string } = {};
  try {
    body = (await request.json()) as { confirm?: string };
  } catch {
    /* empty */
  }
  if (body.confirm !== "PURGE_LISTINGS_AND_WINNERS") {
    return NextResponse.json(
      {
        error:
          'Send { "confirm": "PURGE_LISTINGS_AND_WINNERS" } to wipe Find Winners + listings + afiliados.',
      },
      { status: 400 },
    );
  }

  const result = await purgeListingsAndFindWinners(admin);
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  if (!isBootstrapAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }
  const admin = createAdminClient();
  const result = await maybeAutoPurgeListingsWinners(admin);
  return NextResponse.json({
    ...result,
    via: "bootstrap",
    version: LISTINGS_WINNERS_PURGE_VERSION,
  });
}
