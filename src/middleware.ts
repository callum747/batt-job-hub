import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured, isAllowedEmail, previewMode } from "@/lib/config";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Local preview before Supabase is set up: let everything through (development only).
  if (previewMode) return NextResponse.next();

  // Live site without keys: nothing is reachable except the sign-in page, which explains why.
  if (!authConfigured) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = user && isAllowedEmail(user.email);

  if (!allowed && !isPublic) {
    const url = new URL("/login", request.url);
    if (user) url.searchParams.set("error", "domain");
    return NextResponse.redirect(url);
  }

  if (allowed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico).*)"],
};
