/**
 * Pulls every connected external calendar (Airbnb, Booking.com, …) and mirrors its
 * reservations onto the matching listing as availability blocks.
 *
 * Run it hourly — that is roughly how often the channels themselves poll, so syncing
 * faster only adds requests without closing the window meaningfully. Safe to run by
 * hand at any time: each feed is replaced in full from what the remote calendar says
 * right now, so a missed run means stale dates, never drift or duplicates.
 *
 *   npm run calendars:sync
 *
 * To install the hourly timer on the VPS (once):
 *
 *   sudo cp scripts/systemd/book-easy-calendar-sync.service \
 *           scripts/systemd/book-easy-calendar-sync.timer /etc/systemd/system/
 *   sudo systemctl daemon-reload
 *   sudo systemctl enable --now book-easy-calendar-sync.timer
 *
 * Check WorkingDirectory/User in book-easy-calendar-sync.service match the real deploy.
 * Until the timer is installed, calendars only refresh when a host presses "Update now"
 * on the availability screen — connections keep working, they just stop being automatic.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { syncAllCalendarFeeds } from "../src/lib/calendar-sync/service";

async function main() {
  const startedAt = Date.now();
  const results = await syncAllCalendarFeeds();

  const failed = results.filter((result) => !result.ok);
  const nights = results.reduce((total, result) => total + result.blockedNights, 0);

  console.log(
    `Calendar sync finished in ${Date.now() - startedAt}ms — ` +
      `${results.length} feeds checked, ${results.length - failed.length} succeeded, ` +
      `${nights} nights blocked in total.`
  );

  for (const failure of failed) {
    console.error(`  feed ${failure.feedId}: ${failure.error ?? "unknown error"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
