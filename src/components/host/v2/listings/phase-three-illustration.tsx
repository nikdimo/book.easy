import Image from "next/image";
import styles from "./phase-three-illustration.module.css";

/**
 * The artwork that closes the flow, and the third of the family: same stage, same
 * staged arrival, same last-beat checkmark as `PhaseCompleteIllustration` and
 * `PhaseTwoIllustration`, so publishing reads as the last of three recurring moments
 * rather than a screen that happens to congratulate the host.
 *
 * Where phase one placed the house and phase two dressed it, this one puts it on a
 * platform — live — with the three things the host now manages it by orbiting below:
 * photos, availability and performance. The green check is the only green in the flow,
 * spent on the one screen that has earned it.
 *
 * Eight separate PNGs rather than one flattened image, because the point is the order
 * they appear in. Everything is positioned in percentages of a 4:3 stage, so the
 * composition survives every viewport unchanged instead of being re-laid-out per
 * breakpoint.
 */

type Layer = {
  /** File stem under `/images/listing-flow/phase-three/` and the React key. */
  name: string;
  /** Intrinsic size of the exported asset, trimmed to its alpha bounding box. */
  width: number;
  height: number;
  /** Placement of that bounding box on the stage, in percent. */
  left: number;
  top: number;
  size: number;
  motion: "trail" | "settle" | "land" | "rise" | "pop";
  /** Milliseconds after mount. The last layer finishes at 1740ms. */
  delay: number;
};

/** Declaration order is paint order: the card lies under everything, the check on top.
 *  The orbit is painted before the platform and the house so its far arc passes behind
 *  them, which is what makes the ring read as going around the listing rather than
 *  being drawn on top of it. */
const LAYERS: Layer[] = [
  { name: "card", width: 1100, height: 959, left: 12.29, top: 6.17, size: 75.99, motion: "trail", delay: 0 },
  { name: "ring", width: 673, height: 394, left: 28.1, top: 47.15, size: 46.48, motion: "trail", delay: 180 },
  { name: "platform", width: 495, height: 312, left: 35.47, top: 42.45, size: 34.22, motion: "settle", delay: 300 },
  { name: "house", width: 382, height: 390, left: 39.71, top: 22.05, size: 26.42, motion: "land", delay: 520 },
  { name: "photo", width: 197, height: 198, left: 26.62, top: 59.67, size: 13.62, motion: "rise", delay: 820 },
  { name: "calendar", width: 187, height: 202, left: 41.83, top: 69.24, size: 12.89, motion: "rise", delay: 950 },
  { name: "chart", width: 197, height: 192, left: 60.46, top: 64.4, size: 13.62, motion: "rise", delay: 1080 },
  { name: "check", width: 135, height: 135, left: 70.42, top: 15.82, size: 9.3, motion: "pop", delay: 1280 },
];

export function PhaseThreeIllustration() {
  return (
    <div className={styles.stage} aria-hidden="true">
      {LAYERS.map((layer) => (
        <Image
          key={layer.name}
          src={`/images/listing-flow/phase-three/${layer.name}.png`}
          alt=""
          width={layer.width}
          height={layer.height}
          // The stage caps at 30rem on desktop and runs to about 92vw on a phone, so a
          // layer never needs more than its share of either.
          sizes={`(min-width: 768px) ${Math.round(layer.size * 4.8)}px, ${Math.round(layer.size * 0.92)}vw`}
          // Only the layers that open the sequence are worth a preload hint. The rest
          // are in the viewport from the first layout, so the browser fetches them
          // straight away regardless, and each has at least 520ms of delay to arrive in.
          priority={layer.delay <= 300}
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
