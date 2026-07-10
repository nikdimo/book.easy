import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStorageAdapter } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;

/** Allowed types, keyed by declared MIME type. `magic` sniffs the real file bytes so a
 * renamed/relabeled file can't slip through on a spoofed Content-Type. */
const ALLOWED_TYPES: Record<
  string,
  { ext: string; magic: (buf: Buffer) => boolean }
> = {
  "image/jpeg": {
    ext: "jpg",
    magic: (buf) =>
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  "image/png": {
    ext: "png",
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
    magic: (buf) =>
      buf.length >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP",
  },
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
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max size: ${process.env.MAX_FILE_SIZE_MB || 10}MB` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!typeInfo.magic(buffer)) {
    return NextResponse.json(
      { error: "File content does not match its declared type" },
      { status: 400 }
    );
  }

  // Never trust the client-supplied filename for the on-disk path — it's attacker
  // controlled and a `../` in it could otherwise escape the upload directory.
  const safeName = `${randomUUID()}.${typeInfo.ext}`;
  const storage = getStorageAdapter();
  const url = await storage.upload(buffer, safeName, file.type);

  return NextResponse.json({ url });
}
