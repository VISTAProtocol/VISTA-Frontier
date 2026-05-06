import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const protectedPrefixes = ["/dashboard"];

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const requiresAuth = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (requiresAuth && !sessionCookie) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth", "/dashboard/:path*"],
};
