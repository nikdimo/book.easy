import "server-only";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, join, isAbsolute, resolve } from "path";
import { existsSync } from "fs";
import type { StorageAdapter } from "./index";

// A relative UPLOAD_DIR (the default) would otherwise resolve against
// `process.cwd()` at the moment each fs call runs — which depends on how the process
// was launched (e.g. a systemd unit's `WorkingDirectory`) and isn't guaranteed to match
// the project root that Next.js serves `public/` from. Anchoring to `process.cwd()`
// once, right here, at least makes that resolution explicit and consistent for every
// call below, instead of relying on each fs function's own implicit relative handling.
const RAW_UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";
const UPLOAD_DIR = isAbsolute(RAW_UPLOAD_DIR)
  ? RAW_UPLOAD_DIR
  : resolve(process.cwd(), RAW_UPLOAD_DIR);

/** Used by the `/uploads/[filename]` route handler, which reads files directly from
 * disk on every request rather than relying on Next's static `public/` serving (see
 * that route for why). */
export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export class LocalStorageAdapter implements StorageAdapter {
  private uploadDir: string;

  constructor() {
    this.uploadDir = UPLOAD_DIR;
  }

  async upload(file: Buffer, filename: string, _mimeType: string): Promise<string> {
    const dir = this.uploadDir;
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Defense in depth: strip any directory components even though callers are expected
    // to pass an already-safe, server-generated filename (see api/upload/route.ts).
    const safeInput = basename(filename);
    const uniqueName = `${Date.now()}-${safeInput}`;
    const filePath = join(dir, uniqueName);
    await writeFile(filePath, file);

    return `/uploads/${uniqueName}`;
  }

  async delete(path: string): Promise<void> {
    const safeName = basename(path);
    const filePath = join(this.uploadDir, safeName);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist
    }
  }

  getUrl(path: string): string {
    return path;
  }
}
