import { NextResponse } from "next/server";
import { parseWalmartLink } from "@/lib/walmart/item-id";
import { fetchWalmartPageHtml } from "@/lib/walmart/fetch-page";

export const runtime = "edge";

/** Edge IP pool — Walmart often captchas Node/Vercel serverless. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!parseWalmartLink(url)?.itemId) {
    return NextResponse.json(
      { error: "Paste a Walmart product link." },
      { status: 400 },
    );
  }
  try {
    const html = await fetchWalmartPageHtml(url);
    if (!html) {
      return new NextResponse("", { status: 204 });
    }
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse("", { status: 204 });
  }
}
