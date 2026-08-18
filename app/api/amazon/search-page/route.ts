import { NextResponse } from "next/server";

export const runtime = "edge";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** Edge IP pool — Amazon often captchas Node/Vercel serverless. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 200) {
    return NextResponse.json({ error: "Type a product to search." }, { status: 400 });
  }
  const params = new URLSearchParams({ k: q, s: "review-rank" });
  try {
    const res = await fetch(`https://www.amazon.com/s?${params.toString()}`, {
      headers: {
        "User-Agent": IPHONE_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(18_000),
    });
    const html = await res.text();
    if (!html) return new NextResponse("", { status: 204 });
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
