/**
 * Getting a listing's own photos onto the device the host is going to post from.
 *
 * Two mechanisms, because the two platforms that matter answer differently. A desktop
 * browser saves files with an anchor carrying `download`, which works here only because
 * the uploads are same-origin — a cross-origin bucket would ignore the attribute and
 * navigate instead. A phone has something better: `navigator.share` with files puts
 * "Save to Photos" (and Instagram, and everything else) in the system sheet, which is
 * the one path that reliably reaches an iOS camera roll. Safari's `<a download>` tends
 * to open an image rather than save it, and that is precisely the host who needs the
 * file most, since Instagram cannot be posted from a browser at all.
 */

export type MediaSaveOutcome =
  | { kind: "shared" }
  | { kind: "downloaded"; count: number }
  | { kind: "failed" };

/** Whether this browser can hand real files to the system share sheet. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.canShare !== "function" || !navigator.share) return false;
  // Chrome answers `true` for an empty list, so the probe carries a token file: the
  // question is whether files are supported at all, not whether these ones are.
  try {
    return navigator.canShare({
      files: [new File([""], "probe.jpg", { type: "image/jpeg" })],
    });
  } catch {
    return false;
  }
}

/** The file name a saved photo lands under. The listing's own path is meaningless in a
 *  camera roll; a slug and an index are at least findable. */
function fileNameFor(url: string, slug: string, index: number): string {
  const extension = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url)?.[1] ?? "jpg";
  return `${slug}-${index + 1}.${extension.toLowerCase()}`;
}

function mimeFor(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return "image/jpeg";
}

/**
 * Saves the given media, by whichever route this browser offers.
 *
 * The blobs are fetched before `navigator.share` is called, which spends the click's
 * user activation on strict browsers. That is why a rejection is not treated as an
 * error: it falls through to the anchor path rather than telling a host that saving
 * failed when the sheet simply declined to open. `text` is deliberately not passed
 * alongside — a share carrying both files and a caption is dropped wholesale by several
 * targets, and the caption has its own copy control.
 */
export async function saveListingMedia(
  urls: string[],
  slug: string,
): Promise<MediaSaveOutcome> {
  if (urls.length === 0) return { kind: "failed" };

  if (canShareFiles()) {
    try {
      const files = await Promise.all(
        urls.map(async (url, index) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error("unreachable");
          const name = fileNameFor(url, slug, index);
          return new File([await response.blob()], name, { type: mimeFor(name) });
        }),
      );
      if (navigator.canShare({ files })) {
        await navigator.share({ files });
        return { kind: "shared" };
      }
    } catch (error) {
      // A host who changed their mind is not a failure, and must not be told anything.
      if (error instanceof DOMException && error.name === "AbortError") {
        return { kind: "shared" };
      }
      // Anything else — activation spent, a target that refused the files, a fetch that
      // failed — falls through to the anchor below.
    }
  }

  return downloadEach(urls, slug);
}

/**
 * The desktop path: one anchor click per file.
 *
 * Sequential rather than simultaneous, and the browser will ask once whether this site
 * may save several files. That prompt is expected — a zip would avoid it, but a zip on
 * a phone is a folder iOS cannot get photos out of into the gallery, and this same
 * function is the fallback there when the share sheet declines.
 */
function downloadEach(urls: string[], slug: string): MediaSaveOutcome {
  if (typeof document === "undefined") return { kind: "failed" };
  urls.forEach((url, index) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileNameFor(url, slug, index);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });
  return { kind: "downloaded", count: urls.length };
}
