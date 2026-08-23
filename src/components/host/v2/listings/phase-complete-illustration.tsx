import Image from "next/image";
import styles from "./phase-complete-illustration.module.css";

/**
 * The artwork that closes phase one: a house on its plot with the four things the host
 * has just told us about it — where it is, who it sleeps, what it sleeps them in, and
 * what it looks like — arriving around it, and a checkmark landing last.
 *
 * Eight separate PNGs rather than one flattened image, because the point is the order
 * they appear in: the sequence retells the phase the host just finished. Everything is
 * positioned in percentages of a 4:3 stage, so the composition survives every viewport
 * unchanged instead of being re-laid-out per breakpoint.
 */

type Layer = {
  /** File stem under `/images/listing-flow/phase-one/` and the React key. */
  name: string;
  /** Intrinsic size of the exported asset, trimmed to its alpha bounding box. */
  width: number;
  height: number;
  /** Placement of that bounding box on the stage, in percent. */
  left: number;
  top: number;
  size: number;
  motion: "trail" | "settle" | "rise" | "pop";
  /** Milliseconds after mount. The last layer finishes at 1660ms. */
  delay: number;
};

/** Declaration order is paint order: the path lies under everything, the check on top. */
const LAYERS: Layer[] = [
  { name: "path", width: 1042, height: 711, left: 12.36, top: 24.81, size: 72.36, motion: "trail", delay: 0 },
  { name: "house", width: 628, height: 646, left: 27.64, top: 16.76, size: 43.61, motion: "settle", delay: 120 },
  { name: "location", width: 323, height: 327, left: 7.78, top: 21.11, size: 22.43, motion: "rise", delay: 460 },
  { name: "guests", width: 324, height: 267, left: 7.5, top: 65.19, size: 22.5, motion: "rise", delay: 600 },
  { name: "beds", width: 320, height: 259, left: 59.03, top: 71.48, size: 22.22, motion: "rise", delay: 740 },
  { name: "photo", width: 324, height: 368, left: 73.75, top: 32.78, size: 22.5, motion: "rise", delay: 880 },
  { name: "plant", width: 151, height: 200, left: 33.89, top: 6.85, size: 10.49, motion: "rise", delay: 1020 },
  { name: "check", width: 197, height: 196, left: 79.44, top: 6.94, size: 13.67, motion: "pop", delay: 1200 },
];

export function PhaseCompleteIllustration() {
  return (
    <div className={styles.stage} aria-hidden="true">
      {LAYERS.map((layer) => (
        <Image
          key={layer.name}
          src={`/images/listing-flow/phase-one/${layer.name}.png`}
          alt=""
          width={layer.width}
          height={layer.height}
          // The stage caps at 30rem on desktop and runs to about 92vw on a phone, so a
          // layer never needs more than its share of either.
          sizes={`(min-width: 768px) ${Math.round(layer.size * 4.8)}px, ${Math.round(layer.size * 0.92)}vw`}
          // Only the two layers that open the sequence are worth a preload hint. The
          // rest are in the viewport from the first layout, so the browser fetches them
          // straight away regardless, and each has at least 460ms of delay to arrive in.
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
