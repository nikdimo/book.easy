import "server-only";
import { writeFile, mkdir, unlink } from "fs/promises";
import { basename, join } from "path";
import { existsSync } from "fs";
import type { StorageAdapter } from "./index";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";

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
