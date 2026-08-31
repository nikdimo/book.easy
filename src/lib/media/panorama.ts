/**
 * Full spherical equirectangular photos are conventionally 2:1. The tolerance covers
 * camera stitching and exports that shave a few pixels from either edge. Tiny 2:1
 * graphics are excluded so banners and screenshots are not mistaken for panoramas.
 *
 * Kept browser-safe so the upload validator and local photo preview use the exact same
 * rule. The server remains authoritative when it inspects the uploaded file and its XMP.
 */
export function isEquirectangularPanoramaDimensions(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return false;
  const ratio = width / height;
  return width >= 1600 && height >= 800 && ratio >= 1.9 && ratio <= 2.1;
}
