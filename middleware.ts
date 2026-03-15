// middleware.ts  (root of the project, next to package.json)
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // If user is authenticated and tries to visit auth pages, redirect to /map
    const isAuthPage = req.nextUrl.pathname.startsWith("/auth");
    const token = req.nextauth.token;

    if (isAuthPage && token) {
      return NextResponse.redirect(new URL("/map", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true = allow. Return false = redirect to signIn page.
      authorized({ token, req }) {
        const { pathname } = req.nextUrl;

        // Always allow auth pages and public pages
        if (
          pathname.startsWith("/auth") ||
          pathname === "/" ||
          pathname.startsWith("/_next") ||
          pathname.startsWith("/api/auth")
        ) {
          return true;
        }

        // /map and any other protected route needs a token
        if (pathname.startsWith("/map")) {
          return !!token;
        }

        return true;
      },
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};