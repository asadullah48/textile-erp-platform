import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Coarse gate only: bounce visitors without a session cookie to /login.
// Real authorization happens in the API on every request.
export function middleware(request: NextRequest) {
  if (!request.cookies.get("access_token")?.value) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/fabric-lots/:path*", "/fabric-rolls/:path*", "/suppliers/:path*", "/yarn/:path*",
    "/weaving/:path*", "/knitting/:path*", "/imports/:path*", "/reports/:path*", "/team/:path*",
  ],
};
