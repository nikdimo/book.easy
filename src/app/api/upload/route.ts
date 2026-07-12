import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import convertHeic from "heic-convert";
import { auth } from "@/lib/auth";
import { getStorageAdapter } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MAX_IMAGE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE_MB || "50") * 1024 * 1024;

/** ISO-BMFF "ftyp" box brand at bytes 8-11 — the family of brands Apple's Camera/Photos
 * app writes for HEIC/HEIF stills (as opposed to HEVC video, which this deliberately
 * excludes). */
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "mif1", "msf1"]);
const MP4_BRANDS = new Set(["isom", "iso2", "avc1", "mp41", "mp42", "m4v ", "m4a ", "3gp4"]);
const QUICKTIME_BRANDS = new Set(["qt  "]);

function isHeicMagic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.has(buf.toString("ascii", 8, 12));
}

function isIsoBmffVideoMagic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12).toLowerCase();
  return MP4_BRANDS.has(brand) || QUICKTIME_BRANDS.has(brand);
}

function isWebmMagic(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  );
}

/** Allowed types, keyed by declared MIME type. `magic` sniffs the real file bytes so a
 * renamed/relabeled file can't slip through on a spoofed Content-Type. HEIC/HEIF are
 * converted to JPEG below — only Safari can render `.heic` in an `<img>`, so storing it
 * as-is would show broken photos in every other browser. */
const ALLOWED_TYPES: Record<
  string,
  {
    ext: string;
    magic: (buf: Buffer) => boolean;
    convertToJpeg?: boolean;
    mediaType: "IMAGE" | "VIDEO";
  }
> = {
  "image/jpeg": {
    ext: "jpg",
    mediaType: "IMAGE",
    magic: (buf) =>
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    mediaType: "IMAGE",
    magic: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  "image/webp": {
    ext: "webp",
    mediaType: "IMAGE",
    magic: (buf) =>
      buf.length >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP",
  },
  "image/heic": { ext: "jpg", magic: isHeicMagic, convertToJpeg: true, mediaType: "IMAGE" },
  "image/heif": { ext: "jpg", magic: isHeicMagic, convertToJpeg: true, mediaType: "IMAGE" },
  // Many phones (esp. Android/Chrome, sometimes Safari) send no Content-Type — or a
  // generic one — for HEIC files picked from the photo library. Sniff for it directly
  // rather than rejecting on a missing/wrong declared type.
  "application/octet-stream": {
    ext: "jpg",
    magic: isHeicMagic,
    convertToJpeg: true,
    mediaType: "IMAGE",
  },
  "": { ext: "jpg", magic: isHeicMagic, convertToJpeg: true, mediaType: "IMAGE" },
  "video/mp4": { ext: "mp4", magic: isIsoBmffVideoMagic, mediaType: "VIDEO" },
  "video/quicktime": { ext: "mov", magic: isIsoBmffVideoMagic, mediaType: "VIDEO" },
  "video/webm": { ext: "webm", magic: isWebmMagic, mediaType: "VIDEO" },
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`upload:${session.user.id}`, 100, 10 * 60 * 1000);
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const typeInfo = ALLOWED_TYPES[file.type];
  if (!typeInfo) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, HEIC, MP4, MOV, WebM" },
      { status: 400 }
    );
  }

  const maxSize = typeInfo.mediaType === "VIDEO" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  const maxSizeMb = typeInfo.mediaType === "VIDEO"
    ? process.env.MAX_VIDEO_SIZE_MB || "50"
    : process.env.MAX_FILE_SIZE_MB || "10";

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max size: ${maxSizeMb}MB` },
      { status: 400 }
    );
  }

  let buffer = Buffer.from(await file.arrayBuffer());

  if (!typeInfo.magic(buffer)) {
    return NextResponse.json(
      { error: "File content does not match its declared type" },
      { status: 400 }
    );
  }

  let outputMimeType = file.type || "image/heic";
  if (typeInfo.convertToJpeg) {
    try {
      buffer = Buffer.from(
        await convertHeic({ buffer, format: "JPEG", quality: 0.9 })
      );
    } catch {
      return NextResponse.json(
        { error: "Couldn't process that HEIC photo. Try converting it to JPEG first." },
        { status: 400 }
      );
    }
    outputMimeType = "image/jpeg";
  }

  // Never trust the client-supplied filename for the on-disk path — it's attacker
  // controlled and a `../` in it could otherwise escape the upload directory.
  const safeName = `${randomUUID()}.${typeInfo.ext}`;
  const storage = getStorageAdapter();
  const url = await storage.upload(buffer, safeName, outputMimeType);

  return NextResponse.json({ url, mediaType: typeInfo.mediaType });
}
