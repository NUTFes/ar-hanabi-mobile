import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.slice("Basic ".length);
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex !== -1) {
      const username = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);

      const expectedUsername = process.env.ADMIN_USERNAME ?? "";
      const expectedPassword = process.env.ADMIN_PASSWORD ?? "";

      if (username === expectedUsername && password === expectedPassword) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
