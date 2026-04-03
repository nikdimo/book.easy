export interface StorageAdapter {
  upload(file: Buffer, filename: string, mimeType: string): Promise<string>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
}

import { LocalStorageAdapter } from "./local.adapter";

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!adapter) {
    adapter = new LocalStorageAdapter();
  }
  return adapter;
}
