import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const requestWindows = new Map<string, { count: number; resetAt: number }>();

export async function requireHostForLocation() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) return null;
  return session.user.id;
}

export function allowLocationRequest(
  userId: string,
  limit = 60,
  windowMs = 60_000
) {
  const now = Date.now();
  const current = requestWindows.get(userId);
  if (!current || current.resetAt <= now) {
    requestWindows.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function normalizeIp(value: string) {
  const candidate = value.trim().replace(/^\[|\]$/g, "");
  if (isIP(candidate)) return candidate;

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1])) return ipv4WithPort[1];
  return null;
}

function isPublicIp(ip: string) {
  if (
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  ) {
    return false;
  }
  const secondOctet = Number(ip.split(".")[1]);
  if (ip.startsWith("172.") && secondOctet >= 16 && secondOctet <= 31) {
    return false;
  }
  return true;
}

export function clientIpFromRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    forwarded,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const ip = normalizeIp(value);
    if (ip && isPublicIp(ip)) return ip;
  }
  return null;
}

export function deploymentLocationFromHeaders(request: NextRequest) {
  const latitude = Number(request.headers.get("x-vercel-ip-latitude"));
  const longitude = Number(request.headers.get("x-vercel-ip-longitude"));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  let city = "";
  try {
    city = decodeURIComponent(request.headers.get("x-vercel-ip-city") || "");
  } catch {
    city = request.headers.get("x-vercel-ip-city") || "";
  }
  return {
    latitude,
    longitude,
    city,
    country: "",
    countryCode: request.headers.get("x-vercel-ip-country") || "",
  };
}
