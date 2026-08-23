import "server-only";
import { randomUUID } from "node:crypto";
import convertHeic from "heic-convert";
import { getStorageAdapter } from "./index";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";

/**
 * The one place a browser-supplied file becomes a stored file.
 *
 * Lifted out of `/api/upload` so a second caller — the Host V2 draft photo route, which
 * has to store a file *and* record it on the draft in the same request — cannot end up
 * with a looser copy of the type allow-list, the magic-byte sniffing, the size ceiling
 * or the HEIC conversion. Authentication and rate limiting stay with the callers, which
 * is where the identity being limited lives.
 */

const MAX_IMAGE_SIZE = () => parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;
const MAX_VIDEO_SIZE = () => parseInt(process.env.MAX_VIDEO_SIZE_MB || "50") * 1024 * 1024;

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
    mediaType: ListingMediaTypeValue;
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

export interface StoredUpload {
  url: string;
  mediaType: ListingMediaTypeValue;
}

export type StoreUploadResult =
  | ({ ok: true } & StoredUpload)
  | { ok: false; status: number; error: string };

/** Validates and stores one browser-supplied file. Never throws for a bad file — a
 *  rejected upload is an expected outcome with a status the caller passes straight on. */
export async function storeUploadedFile(file: File): Promise<StoreUploadResult> {
  const typeInfo = ALLOWED_TYPES[file.type];
  if (!typeInfo) {
    return {
      ok: false,
      status: 400,
      error: "Invalid file type. Allowed: JPEG, PNG, WebP, HEIC, MP4, MOV, WebM",
    };
  }

  const isVideo = typeInfo.mediaType === "VIDEO";
  const maxSize = isVideo ? MAX_VIDEO_SIZE() : MAX_IMAGE_SIZE();
  const maxSizeMb = isVideo
    ? process.env.MAX_VIDEO_SIZE_MB || "50"
    : process.env.MAX_FILE_SIZE_MB || "10";

  if (file.size > maxSize) {
    return { ok: false, status: 400, error: `File too large. Max size: ${maxSizeMb}MB` };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error("Unable to read uploaded file", error);
    return {
      ok: false,
      status: 400,
      error: "The uploaded file could not be read. Please try again.",
    };
  }

  if (!typeInfo.magic(buffer)) {
    return {
      ok: false,
      status: 400,
      error: "File content does not match its declared type",
    };
  }

  let outputMimeType = file.type || "image/heic";
  if (typeInfo.convertToJpeg) {
    try {
      buffer = Buffer.from(await convertHeic({ buffer, format: "JPEG", quality: 0.9 }));
    } catch {
      return {
        ok: false,
        status: 400,
        error: "Couldn't process that HEIC photo. Try converting it to JPEG first.",
      };
    }
    outputMimeType = "image/jpeg";
  }

  // Never trust the client-supplied filename for the on-disk path — it's attacker
  // controlled and a `../` in it could otherwise escape the upload directory.
  const safeName = `${randomUUID()}.${typeInfo.ext}`;
  try {
    const storage = getStorageAdapter();
    const url = await storage.upload(buffer, safeName, outputMimeType);
    return { ok: true, url, mediaType: typeInfo.mediaType };
  } catch (error) {
    console.error("Unable to store uploaded file", error);
    return {
      ok: false,
      status: 500,
      error: "The server could not save this file. Please try again later.",
    };
  }
}

/**
 * True only for a URL this app's own storage produced.
 *
 * Every deletion goes through this first. An imported listing's photo is a remote URL on
 * somebody else's CDN and a hand-written value could be a path traversal; neither is a
 * file we may unlink, and both are rejected here rather than at the adapter, which sees
 * only a basename by then.
 */
export function isManagedUploadUrl(url: string): boolean {
  return /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(url) && !url.includes("..");
}

/** Best-effort removal of a stored file. Deliberately swallows failures: the database is
 *  already consistent by the time this runs, and a leftover byte-blob is a smaller
 *  problem than an error thrown at a host who did nothing wrong. */
export async function deleteStoredFile(url: string): Promise<boolean> {
  if (!isManagedUploadUrl(url)) return false;
  try {
    await getStorageAdapter().delete(url);
    return true;
  } catch (error) {
    console.error("Unable to delete stored file", url, error);
    return false;
  }
}
