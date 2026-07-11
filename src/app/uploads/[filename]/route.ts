import { readFile, stat } from "fs/promises";
import { join, extname, basename } from "path";
import { NextResponse } from "next/server";
import { getUploadDir } from "@/lib/storage/local.adapter";

/**
 * Serves user-uploaded files with a live per-request disk read, instead of relying on
 * Next's static `public/` handler. That handler snapshots `public/` at server boot in
 * this Next.js fork — any file written after the process starts (i.e. every upload made
 * between deploys) 404s until the next restart. A route handler always runs fresh
 * application code per request, so it isn't subject to that snapshot.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

interface RouteParams {
  params: Promise<{ filename: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { filename: rawFilename } = await params;
  // Defense in depth: the dynamic segment can't itself contain `/`, but strip any
  // directory components anyway rather than trust it's already a bare filename.
  const filename = basename(rawFilename);

  const contentType = CONTENT_TYPES[extname(filename).toLowerCase()];
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = join(getUploadDir(), filename);

  try {
    const [stats, buffer] = await Promise.all([stat(filePath), readFile(filePath)]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        // Filenames are unique per upload (randomUUID/timestamp-based) and never
        // reused, so a successful response can be cached indefinitely.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
