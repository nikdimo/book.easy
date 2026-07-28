/**
 * Opens review windows for newly completed stays, publishes approved reviews whose
 * double-blind window expired, and sends the next due reminder exactly once.
 *
 * Install the bundled systemd timer on the VPS:
 *   sudo cp scripts/systemd/book-easy-review-reminders.service \
 *           scripts/systemd/book-easy-review-reminders.timer /etc/systemd/system/
 *   sudo systemctl daemon-reload
 *   sudo systemctl enable --now book-easy-review-reminders.timer
 */
import "dotenv/config";
import { completePastBookings } from "../src/lib/services/booking.service";
import { processDueReviewReminders } from "../src/lib/services/review.service";

await completePastBookings();
const sent = await processDueReviewReminders();
console.info(`[reviews] Sent ${sent} due reminder${sent === 1 ? "" : "s"}.`);
