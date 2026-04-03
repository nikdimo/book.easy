import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
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

    const uniqueName = `${Date.now()}-${filename}`;
    const filePath = join(dir, uniqueName);
    await writeFile(filePath, file);

    return `/uploads/${uniqueName}`;
  }

  async delete(path: string): Promise<void> {
    const filePath = join(this.uploadDir, path.replace("/uploads/", ""));
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
