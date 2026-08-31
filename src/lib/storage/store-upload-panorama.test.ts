import { describe, expect, it } from "vitest";
import { detectEquirectangularPanorama } from "./store-upload";

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(21);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]).copy(buffer);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

function webpHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

describe("detectEquirectangularPanorama", () => {
  it("recognizes a standard 2:1 panorama", () => {
    expect(detectEquirectangularPanorama(pngHeader(6000, 3000))).toBe(true);
    expect(detectEquirectangularPanorama(jpegHeader(6000, 3000))).toBe(true);
    expect(detectEquirectangularPanorama(webpHeader(6000, 3000))).toBe(true);
  });

  it("allows small stitching/export differences around 2:1", () => {
    expect(detectEquirectangularPanorama(pngHeader(3900, 2000))).toBe(true);
  });

  it("does not mistake ordinary or tiny wide images for 360 photos", () => {
    expect(detectEquirectangularPanorama(pngHeader(4000, 3000))).toBe(false);
    expect(detectEquirectangularPanorama(pngHeader(1200, 600))).toBe(false);
  });

  it("honors explicit equirectangular GPano metadata", () => {
    expect(
      detectEquirectangularPanorama(
        Buffer.from('<GPano:ProjectionType>equirectangular</GPano:ProjectionType>'),
      ),
    ).toBe(true);
  });
});
