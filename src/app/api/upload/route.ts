import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storeUploadedFile } from "@/lib/storage/store-upload";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Stores one file and hands its URL back to the browser.
 *
 * The validation, sniffing, size ceiling, HEIC conversion and the write itself live in
 * `storeUploadedFile` — shared with the Host V2 draft photo route, which stores a file
 * and records it on the draft in one server-owned operation.
 */
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error("Unable to parse upload request", error);
    return NextResponse.json(
      { error: "The upload request could not be read. Check the file size and try again." },
      { status: 400 }
    );
  }
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const stored = await storeUploadedFile(file);
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: stored.status });
  }

  return NextResponse.json({
    url: stored.url,
    mediaType: stored.mediaType,
    isPanorama: stored.isPanorama,
  });
}
