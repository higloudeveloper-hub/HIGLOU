import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { buildQrSvg, qrSvgToDataUrl } from "@/lib/monetization/qr";

export const runtime = "nodejs";

const bodySchema = z.object({
  pathOrUrl: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled() || !getMonetizationFlags().smartLinks) {
    return NextResponse.json({ error: "Smart Links disabled" }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid QR payload" }, { status: 400 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const target = parsed.pathOrUrl.startsWith("http")
    ? parsed.pathOrUrl
    : `${appUrl}${parsed.pathOrUrl.startsWith("/") ? "" : "/"}${parsed.pathOrUrl}`;

  const qr = buildQrSvg(target);
  if (!qr.ok) {
    return NextResponse.json({ error: qr.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    target,
    svg: qr.svg,
    dataUrl: qrSvgToDataUrl(qr.svg),
  });
}
