import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith('/api/proxy/')) {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('X-User-Id', session.userId);
    
    if (process.env.ECHOFIND_API_KEY) {
      requestHeaders.set('Authorization', `Bearer ${process.env.ECHOFIND_API_KEY}`);
    }

    const backendUrl = process.env.BACKEND_API_URL;
    if (!backendUrl) {
      return NextResponse.json({ error: "BACKEND_API_URL is not configured" }, { status: 500 });
    }

    const path = req.nextUrl.pathname.replace('/api/proxy/', '/api/v1/');
    const targetUrl = new URL(path, backendUrl);
    
    req.nextUrl.searchParams.forEach((val, key) => {
      targetUrl.searchParams.append(key, val);
    });

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for Clerk's auto-proxy path
    '/__clerk/:path*',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
