import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handleProxy(request, resolvedParams.path);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handleProxy(request, resolvedParams.path);
}

async function handleProxy(request: NextRequest, pathArray: string[]) {
  // 1. Verify Authentication
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Reconstruct URL
  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    console.error("BACKEND_API_URL is not configured.");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const path = pathArray.join("/");
  const targetUrl = new URL(`/api/v1/${path}`, backendUrl);

  // Copy query parameters
  const searchParams = request.nextUrl.searchParams;
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  // 3. Prepare headers
  const headers = new Headers();
  
  // Forward Content-Type if present (important for multipart/form-data vs application/json)
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  // Inject secure API key
  const apiKey = process.env.ECHOFIND_API_KEY;
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  // Inject user ID for backend rate limiting
  headers.set("X-User-Id", session.userId);

  // 4. Forward the Request
  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: headers,
    };

    // Only forward body if it's not a GET/HEAD request
    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = request.body;
      // We need to set duplex: 'half' when forwarding a ReadableStream body in Node
      // @ts-ignore - duplex is not in standard types but required by undici
      fetchOptions.duplex = 'half';
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    // 5. Proxy the response back
    // Use the original response body
    const body = response.body;
    
    const responseHeaders = new Headers(response.headers);
    // Remove headers that might cause issues when proxying
    responseHeaders.delete("content-encoding");
    
    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
