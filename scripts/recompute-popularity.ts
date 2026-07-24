/**
 * Recomputes every listing's popularity score from recent views and bookings, and
 * prunes view rows that have aged out of the scoring window.
 *
 * Run it on a schedule — hourly is plenty, since the score is a weeks-long trend. Safe
 * to run by hand at any time; it recomputes from the event tables rather than
 * incrementing, so a missed run just means slightly stale scores, never drift.
 *
 *   npm run popularity:recompute
 *
 * To install the hourly timer on the VPS (once):
 *
 *   sudo cp scripts/systemd/book-easy-popularity.service \
 *           scripts/systemd/book-easy-popularity.timer /etc/systemd/system/
 *   sudo systemctl daemon-reload
 *   sudo systemctl enable --now book-easy-popularity.timer
 *
 * Check WorkingDirectory/User in book-easy-popularity.service match the real deploy.
 * Until the timer is installed the site simply never shows a "Popular homes" section —
 * scores stay at 0, which the home page reads as "no signal" rather than "unpopular".
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { recomputePopularityScores } from "../src/lib/services/popularity.service";

async function main() {
  const startedAt = Date.now();
  const result = await recomputePopularityScores();

  console.log(
    `Popularity recomputed in ${Date.now() - startedAt}ms — ` +
      `${result.listingsScored} listings scored, ` +
      `${result.listingsUpdated} updated, ` +
      `${result.viewsPruned} expired view rows pruned.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
