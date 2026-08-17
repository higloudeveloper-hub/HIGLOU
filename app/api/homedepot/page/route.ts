import { NextResponse } from "next/server";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import { fetchHomeDepotPageHtml } from "@/lib/homedepot/fetch-page";

export const runtime = "edge";

/** Edge IP pool — Home Depot often 403s Node/Vercel serverless. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!parseHomeDepotLink(url)) {
    return NextResponse.json(
      { error: "Paste a Home Depot product link." },
      { status: 400 },
    );
  }
  try {
    const html = await fetchHomeDepotPageHtml(url);
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
