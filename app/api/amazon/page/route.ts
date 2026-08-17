import { NextResponse } from "next/server";
import { parseAmazonLink } from "@/lib/amazon/asin";
import { fetchAmazonPageHtml } from "@/lib/amazon/fetch-page";

export const runtime = "edge";

/** Edge IP pool — Amazon often captchas Node/Vercel serverless. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!parseAmazonLink(url)?.asin) {
    return NextResponse.json(
      { error: "Paste an Amazon product link." },
      { status: 400 },
    );
  }
  try {
    const html = await fetchAmazonPageHtml(url);
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
