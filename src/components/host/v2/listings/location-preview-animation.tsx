import Image from "next/image";
import styles from "./location-preview-animation.module.css";

export function LocationPreviewAnimation() {
  return (
    <div
      className={`${styles.stage} aspect-[3/2] max-w-full rounded-none bg-[#eaf3fb] lg:aspect-[145/149] lg:rounded-[3rem]`}
      aria-hidden="true"
    >
      <div className={`${styles.backdropPhoto} absolute inset-0`}>
        <Image
          src="/images/listing-animation-coastal-building.png"
          alt=""
          fill
          // Eager, not `priority`: this has to be decoded before the loop reaches it at
          // 2.4s, but preloading it as well would put both frames (3.4MB of PNG) in
          // front of first paint. The backdrop above keeps `priority` — it is frame one.
          loading="eager"
          sizes="(min-width: 1024px) 464px, 100vw"
          className="object-cover"
        />
      </div>

      <div className={`${styles.phone} absolute inset-0`}>
        <Image
          src="/images/listing-animation-coastal-phone.png"
          alt=""
          fill
          // Eager, not `priority`: this has to be decoded before the loop reaches it at
          // 2.4s, but preloading it as well would put both frames (3.4MB of PNG) in
          // front of first paint. The backdrop above keeps `priority` — it is frame one.
          loading="eager"
          sizes="(min-width: 1024px) 464px, 100vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
