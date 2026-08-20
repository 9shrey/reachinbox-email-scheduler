import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Next.js 16 renamed the `middleware` file/export convention to `proxy`.
export async function proxy(request: Request) {
  const session = await auth();
  const url = new URL(request.url);

  const isDashboard = url.pathname.startsWith("/dashboard");
  const isLogin = url.pathname === "/login";

  if (isDashboard && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isLogin && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
