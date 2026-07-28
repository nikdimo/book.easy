import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getStorageAdapter } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<
  string,
  { extension: string; matches: (buffer: Buffer) => boolean }
> = {
  "image/jpeg": {
    extension: "jpg",
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47,
  },
  "image/webp": {
    extension: "webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  },
  "application/pdf": {
    extension: "pdf",
    matches: (buffer) =>
      buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-",
  },
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const limit = rateLimit(`support-evidence:${session.user.id}`, 20, 10 * 60_000);
  if (!limit.success) {
    return Response.json(
      { error: "Too many uploads. Please wait a few minutes." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "The upload request could not be read" },
      { status: 400 }
    );
  }
  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  const type = ALLOWED_TYPES[entry.type];
  if (!type) {
    return Response.json(
      { error: "Allowed evidence: JPEG, PNG, WebP, or PDF" },
      { status: 400 }
    );
  }
  if (entry.size < 1 || entry.size > MAX_SIZE) {
    return Response.json(
      { error: "Evidence files can be up to 10 MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await entry.arrayBuffer());
  if (!type.matches(buffer)) {
    return Response.json(
      { error: "File content does not match its type" },
      { status: 400 }
    );
  }

  const url = await getStorageAdapter().upload(
    buffer,
    `${randomUUID()}.${type.extension}`,
    entry.type
  );
  return Response.json({
    url,
    fileName: entry.name.slice(0, 255),
    mimeType: entry.type,
    sizeBytes: entry.size,
  });
}
