import "server-only";

import { auth } from "@/lib/auth";

const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1"]);

function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.MOBILE_WEB_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function isAllowedMobileOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (configuredOrigins().has(origin)) return true;

  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      return url.protocol === "http:" && LOCAL_PREVIEW_HOSTS.has(url.hostname);
    } catch {
      return false;
    }
  }

  return false;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && isAllowedMobileOrigin(request)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  return headers;
}

export function mobileJson(
  request: Request,
  body: unknown,
  init: ResponseInit = {}
): Response {
  const headers = corsHeaders(request);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return Response.json(body, { ...init, headers });
}

export function mobileOptions(request: Request): Response {
  if (!isAllowedMobileOrigin(request)) {
    return mobileJson(request, { error: "Origin not allowed" }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function requireMobileHost(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access;

  if (!access.user.isHost && access.user.role !== "ADMIN") {
    return {
      response: mobileJson(
        request,
        { error: "Host access required", code: "HOST_REQUIRED" },
        { status: 403 }
      ),
    };
  }

  return access;
}

export async function requireMobileUser(request: Request) {
  if (!isAllowedMobileOrigin(request)) {
    return { response: mobileJson(request, { error: "Origin not allowed" }, { status: 403 }) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: mobileJson(
        request,
        { error: "Authentication required", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }

  return { user: session.user };
}

export async function requireMobileAdmin(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access;

  if (access.user.role !== "ADMIN" && access.user.role !== "SUPERADMIN") {
    return {
      response: mobileJson(
        request,
        { error: "Admin access required", code: "ADMIN_REQUIRED" },
        { status: 403 }
      ),
    };
  }

  return access;
}

