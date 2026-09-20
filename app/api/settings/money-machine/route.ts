import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { isGoogleVisionConfigured } from "@/lib/google-vision/client";
import { isKeepaConfigured } from "@/lib/keepa/config";
import { isAmazonAssociatesConfigured } from "@/lib/monetization/affiliate/amazon-associates";
import {
  DEFAULT_MONEY_MACHINE_PREFS,
  MONEY_MACHINE_SERVICES,
  type MachineServiceStatus,
  type MoneyMachinePrefs,
} from "@/lib/monetization/machine-setup";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function envOn(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function envPresent(name: string) {
  return Boolean((process.env[name] || "").trim());
}

async function loadPrefs(userId: string): Promise<MoneyMachinePrefs> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_MONEY_MACHINE_PREFS };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("money_machine_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return { ...DEFAULT_MONEY_MACHINE_PREFS };
    return {
      moneyEngine: data.money_engine ?? true,
      affiliateEngine: data.affiliate_engine ?? true,
      smartLinks: data.smart_links ?? true,
      moneyScore: data.money_score ?? true,
      autopilot: data.autopilot ?? true,
      openaiPref: data.openai_pref ?? true,
      visionPref: data.vision_pref ?? true,
      keepaPref: data.keepa_pref ?? true,
      associateTag: String(data.associate_tag || ""),
      associateMarketplace: String(data.associate_marketplace || "US"),
    };
  } catch {
    return { ...DEFAULT_MONEY_MACHINE_PREFS };
  }
}

async function detectStatuses(userId: string, prefs: MoneyMachinePrefs) {
  const flags = getMonetizationFlags();
  let ebayConnected = false;
  let amazonConnected = false;
  let monetizationDb = false;

  if (isSupabaseConfigured()) {
    try {
      const admin = createAdminClient();
      const [{ data: ebay }, { data: amz }, mig] = await Promise.all([
        admin
          .from("ebay_connections")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        admin
          .from("amazon_connections")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        admin.from("affiliate_links").select("id").limit(1),
      ]);
      ebayConnected = Boolean(ebay);
      amazonConnected = Boolean(amz);
      monetizationDb = !mig.error;
    } catch {
      /* leave defaults */
    }
  }

  const tagReady =
    Boolean(prefs.associateTag.trim()) || isAmazonAssociatesConfigured();

  const map: Record<string, { status: MachineServiceStatus; detail: string }> = {
    supabase: {
      status: isSupabaseConfigured() ? "ready" : "missing",
      detail: isSupabaseConfigured()
        ? "Project URL configured"
        : "Supabase env missing",
    },
    monetization_db: {
      status: monetizationDb ? "ready" : "missing",
      detail: monetizationDb
        ? "Money tables reachable"
        : "Run 20260916_monetization.sql (+ 20260917 settings)",
    },
    ebay_seller: {
      status: ebayConnected ? "connected" : "missing",
      detail: ebayConnected ? "Store connected" : "Connect in Settings → Stores",
    },
    amazon_seller: {
      status: amazonConnected ? "connected" : "missing",
      detail: amazonConnected
        ? "Seller account connected"
        : "Connect SP-API in Settings → Stores",
    },
    openai: {
      status: envPresent("OPENAI_API_KEY") ? "ready" : "missing",
      detail: envPresent("OPENAI_API_KEY")
        ? "API key present on server"
        : "Add OPENAI_API_KEY in Vercel",
    },
    google_vision: {
      status: isGoogleVisionConfigured() ? "ready" : "optional",
      detail: isGoogleVisionConfigured()
        ? "Service Account configured"
        : "Optional — improves OCR",
    },
    keepa: await (async () => {
      if (!isKeepaConfigured()) {
        return {
          status: "missing" as MachineServiceStatus,
          detail: "Add KEEPA_API_KEY for stronger winners",
        };
      }
      try {
        const { keepaTokenStatus } = await import("@/lib/keepa/client");
        const tok = await keepaTokenStatus();
        return {
          status: "ready" as MachineServiceStatus,
          detail: `Keepa live · ${tok.tokensLeft} tokens left`,
        };
      } catch (error) {
        return {
          status: "warn" as MachineServiceStatus,
          detail:
            error instanceof Error
              ? error.message
              : "Keepa key present but API failed",
        };
      }
    })(),
    amazon_associates: {
      status: tagReady ? "ready" : "missing",
      detail: tagReady
        ? "Tracking ID available"
        : "Paste Associate Tracking ID below",
    },
    smart_links: {
      status: flags.smartLinks && prefs.smartLinks ? "ready" : "warn",
      detail: flags.smartLinks
        ? prefs.smartLinks
          ? "Enabled"
          : "Turned off in preferences"
        : "Enable SMART_LINKS_ENABLED on Vercel",
    },
    money_engine: {
      status: flags.moneyEngine && prefs.moneyEngine ? "ready" : "missing",
      detail: flags.moneyEngine
        ? prefs.moneyEngine
          ? "Master switch on"
          : "Off in preferences"
        : "MONEY_ENGINE_ENABLED missing on Vercel",
    },
    autopilot: {
      status: flags.autopilot && prefs.autopilot ? "ready" : "warn",
      detail: flags.autopilot
        ? prefs.autopilot
          ? "Armed when you flip ENCENDIDO"
          : "Off in preferences"
        : "AUTOPILOT_ENABLED off on Vercel",
    },
  };

  return map;
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const prefs = await loadPrefs(auth.user.id);
  const statuses = await detectStatuses(auth.user.id, prefs);
  const services = MONEY_MACHINE_SERVICES.map((svc) => ({
    ...svc,
    status: statuses[svc.id]?.status || ("warn" as MachineServiceStatus),
    detail: statuses[svc.id]?.detail || "",
  }));

  const missingRequired = services.filter(
    (s) =>
      s.status === "missing" &&
      ["supabase", "openai", "ebay_seller", "money_engine", "monetization_db"].includes(
        s.id,
      ),
  );

  return NextResponse.json({
    prefs,
    flags: getMonetizationFlags(),
    envHints: {
      MONEY_ENGINE_ENABLED: envOn("MONEY_ENGINE_ENABLED") || envPresent("MONEY_ENGINE_ENABLED"),
      AFFILIATE_ENGINE_ENABLED: envOn("AFFILIATE_ENGINE_ENABLED"),
      SMART_LINKS_ENABLED: envOn("SMART_LINKS_ENABLED"),
      AUTOPILOT_ENABLED: envOn("AUTOPILOT_ENABLED"),
      KEEPA_API_KEY: envPresent("KEEPA_API_KEY"),
      OPENAI_API_KEY: envPresent("OPENAI_API_KEY"),
      AMAZON_ASSOCIATE_TAG: isAmazonAssociatesConfigured(),
    },
    services,
    missingRequired: missingRequired.map((s) => s.id),
    readyPct: Math.round(
      (services.filter((s) => s.status === "ready" || s.status === "connected")
        .length /
        services.length) *
        100,
    ),
  });
}

const putSchema = z.object({
  moneyEngine: z.boolean().optional(),
  affiliateEngine: z.boolean().optional(),
  smartLinks: z.boolean().optional(),
  moneyScore: z.boolean().optional(),
  autopilot: z.boolean().optional(),
  openaiPref: z.boolean().optional(),
  visionPref: z.boolean().optional(),
  keepaPref: z.boolean().optional(),
  associateTag: z.string().max(64).optional(),
  associateMarketplace: z.string().max(8).optional(),
});

export async function PUT(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase required to save Money Machine settings" },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof putSchema>;
  try {
    parsed = putSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const current = await loadPrefs(auth.user.id);
  const next: MoneyMachinePrefs = {
    ...current,
    ...Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== undefined),
    ),
    associateTag:
      parsed.associateTag !== undefined
        ? parsed.associateTag.trim()
        : current.associateTag,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("money_machine_settings").upsert(
    {
      user_id: auth.user.id,
      money_engine: next.moneyEngine,
      affiliate_engine: next.affiliateEngine,
      smart_links: next.smartLinks,
      money_score: next.moneyScore,
      autopilot: next.autopilot,
      openai_pref: next.openaiPref,
      vision_pref: next.visionPref,
      keepa_pref: next.keepaPref,
      associate_tag: next.associateTag,
      associate_marketplace: next.associateMarketplace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("money_machine_settings")
          ? "Run migration 20260917_money_machine_settings.sql first"
          : error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, prefs: next });
}
