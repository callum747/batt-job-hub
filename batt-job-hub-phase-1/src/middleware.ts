import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { authConfigured, isAllowedEmail, previewMode } from "@/lib/config";

const PUBLIC = ["/login", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Local preview before Google is set up (development only).
  if (previewMode) return NextResponse.next();

  // Live site without keys: only the sign-in page, which explains why.
  if (!authConfigured) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const allowed = token && isAllowedEmail(token.email as string | undefined);

  if (!allowed && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  if (allowed && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico).*)"],
};
