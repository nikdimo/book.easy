/** True for files this app actually stored (and controls the naming of) via the local
 * upload pipeline — as opposed to an external URL a host may have pasted in directly.
 * Only ever delete files matching this; deleting based on an arbitrary external URL's
 * basename could collide with an unrelated locally-stored file. */
export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith("/uploads/");
}
