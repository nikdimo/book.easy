import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { join, extname, basename } from "path";
import { NextResponse } from "next/server";
import { getUploadDir } from "@/lib/storage/local.adapter";

/**
 * Serves user-uploaded files with a live per-request disk read, instead of relying on
 * Next's static `public/` handler. That handler snapshots `public/` at server boot in
 * this Next.js fork — any file written after the process starts (i.e. every upload made
 * between deploys) 404s until the next restart. A route handler always runs fresh
 * application code per request, so it isn't subject to that snapshot.
 *
 * Responses stream from disk rather than being buffered whole. The previous
 * `readFile` implementation pulled the entire file into memory per request, which a
 * grid of listing cards turned into dozens of concurrent full-file buffers on the
 * same event loop that renders HTML — and for video, a browser asking only for
 * metadata still got the whole file. Range support means media requests now transfer
 * just the bytes asked for.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/** Cheap, stable validator built from size and mtime — no file hashing. Upload
 * filenames are already unique per file, so this only has to change when a file is
 * somehow replaced in place. */
function buildETag(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/** Parses a single-range `bytes=start-end` header. Multi-range requests (comma
 * separated) are deliberately not supported.
 *
 * Anything unusable — malformed, or well-formed but outside the file — returns `null`
 * and the caller serves the whole body. RFC 9110 permits ignoring a Range header, and
 * that is preferable here to answering 416: this runtime turns a body-less response
 * into a 500, so a strictly-correct 416 would be worse than the fallback it replaces. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix form (`bytes=-500`): the last N bytes.
    const suffixLength = Number(rawEnd);
    if (suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function streamFile(filePath: string, start?: number, end?: number) {
  const nodeStream = createReadStream(filePath, { start, end });
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { filename: rawFilename } = await params;
  // Defense in depth: the dynamic segment can't itself contain `/`, but strip any
  // directory components anyway rather than trust it's already a bare filename.
  const filename = basename(rawFilename);

  const contentType = CONTENT_TYPES[extname(filename).toLowerCase()];
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = join(getUploadDir(), filename);

  let stats;
  try {
    stats = await stat(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // NOTE: this runtime rewrites `Cache-Control` on route-handler responses to
  // `public, max-age=0`, so the long-lived value below does not survive to the client.
  // That predates this file's rewrite (the previous implementation set the same header
  // and was overridden identically) and means uploads are currently re-downloaded
  // rather than served from browser cache. Serving `/uploads` from Nginx fixes it for
  // real — see the config in the accompanying notes — which is why the header is kept
  // here rather than dropped: it becomes correct the moment Nginx is in front.
  const etag = buildETag(stats.size, stats.mtimeMs);
  // Filenames are unique per upload (randomUUID/timestamp-based) and never reused,
  // so a successful response can be cached indefinitely.
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": new Date(stats.mtimeMs).toUTCString(),
  };

  const range = parseRange(req.headers.get("range"), stats.size);

  if (range) {
    const chunkSize = range.end - range.start + 1;
    return new NextResponse(streamFile(filePath, range.start, range.end), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${stats.size}`,
        "Content-Length": String(chunkSize),
      },
    });
  }

  return new NextResponse(streamFile(filePath), {
    headers: { ...baseHeaders, "Content-Length": String(stats.size) },
  });
}
