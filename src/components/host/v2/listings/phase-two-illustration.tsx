import Image from "next/image";
import styles from "./phase-two-illustration.module.css";

/**
 * The artwork that closes phase two, and the twin of `PhaseCompleteIllustration`: same
 * stage, same staged arrival, same last-beat checkmark, so the two pauses in the flow
 * read as one recurring moment.
 *
 * Where phase one showed the house being placed, this one shows what the host has just
 * dressed it with — amenities, photos, a title and a description — orbiting the listing
 * itself, in the order those steps were met.
 *
 * Seven separate PNGs rather than one flattened image, because the point is the order
 * they appear in. Everything is positioned in percentages of a square stage, so the
 * composition survives every viewport unchanged instead of being re-laid-out per
 * breakpoint.
 */

type Layer = {
  /** File stem under `/images/listing-flow/phase-two/` and the React key. */
  name: string;
  /** Intrinsic size of the exported asset, trimmed to its alpha bounding box. */
  width: number;
  height: number;
  /** Placement of that bounding box on the stage, in percent. */
  left: number;
  top: number;
  size: number;
  motion: "trail" | "settle" | "land" | "rise" | "pop";
  /** Milliseconds after mount. The last layer finishes at 1580ms. */
  delay: number;
};

/** Declaration order is paint order: the orbit lies under everything, the check on top. */
const LAYERS: Layer[] = [
  { name: "ring", width: 900, height: 882, left: 15, top: 15, size: 70, motion: "trail", delay: 0 },
  { name: "tile", width: 700, height: 574, left: 24, top: 43, size: 52, motion: "settle", delay: 120 },
  { name: "sparkle", width: 470, height: 465, left: 35, top: 29, size: 30, motion: "land", delay: 360 },
  { name: "wifi", width: 250, height: 245, left: 9, top: 14, size: 18, motion: "rise", delay: 620 },
  { name: "photo", width: 250, height: 250, left: 9, top: 66, size: 18, motion: "rise", delay: 760 },
  { name: "text", width: 250, height: 248, left: 72, top: 61, size: 18, motion: "rise", delay: 900 },
  { name: "check", width: 230, height: 231, left: 73, top: 6, size: 16, motion: "pop", delay: 1120 },
];

export function PhaseTwoIllustration() {
  return (
    <div className={styles.stage} aria-hidden="true">
      {LAYERS.map((layer) => (
        <Image
          key={layer.name}
          src={`/images/listing-flow/phase-two/${layer.name}.png`}
          alt=""
          width={layer.width}
          height={layer.height}
          // The stage caps at 30rem on desktop and runs to about 92vw on a phone, so a
          // layer never needs more than its share of either.
          sizes={`(min-width: 768px) ${Math.round(layer.size * 4.8)}px, ${Math.round(layer.size * 0.92)}vw`}
          // Only the two layers that open the sequence are worth a preload hint. The
          // rest are in the viewport from the first layout, so the browser fetches them
          // straight away regardless, and each has at least 360ms of delay to arrive in.
          priority={layer.motion === "trail" || layer.motion === "settle"}
          className={`${styles.layer} ${styles[layer.motion]}`}
          style={
            {
              "--left": `${layer.left}%`,
              "--top": `${layer.top}%`,
              "--width": `${layer.size}%`,
              "--delay": `${layer.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
