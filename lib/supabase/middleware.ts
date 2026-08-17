import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/login", "/forgot-password", "/auth", "/welcome", "/hd-capture"];
const PUBLIC_EXACT_PATHS = [
  "/api/health",
  "/",
  "/api/ebay/account-deletion",
];

/** Inline — Edge middleware must not import app lib paths that can break the bundle. */
function cleanEnvUrl(value: string | undefined | null): string {
  let v = String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\t]+/g, "")
    .trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith("`") && v.endsWith("`"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/\/+$/, "");
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/i.test(pathname)
  );
}

export async function updateSession(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const supabaseUrl = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = String(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    )
      .replace(/[\r\n\t]+/g, "")
      .trim();
    const isDev = process.env.NODE_ENV === "development";

    if (!supabaseUrl || !supabaseAnonKey) {
      if (isDev) {
        const response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.headers.set("x-higlou-auth", "dev-bypass");
        return response;
      }

      if (isPublicPath(pathname) || isStaticAsset(pathname)) {
        return NextResponse.next();
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "message",
        "Supabase configuration is required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return NextResponse.redirect(loginUrl);
    }

    let supabaseResponse = NextResponse.next({
      request,
    });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Guests see the marketing landing; signed-in users go to Studio Home.
    if (user && (pathname === "/" || pathname === "/welcome")) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/home";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }

    if (isStaticAsset(pathname) || isPublicPath(pathname)) {
      if (user && (pathname === "/login" || pathname === "/forgot-password")) {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/home";
        homeUrl.search = "";
        return NextResponse.redirect(homeUrl);
      }
      return supabaseResponse;
    }

    if (!user) {
      // API callers (fetch) must get JSON — never an HTML login redirect.
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Authentication required. Sign in and try again." },
          { status: 401 },
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  } catch {
    // Never crash the whole site on middleware failure.
    return NextResponse.next({ request });
  }
}
