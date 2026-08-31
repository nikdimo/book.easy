/**
 * Sends the one due host reminder, expires unanswered booking requests, and completes
 * stays whose checkout has passed.
 * Run every 10 minutes in production; every operation here is idempotent.
 */
import {
  completePastBookings,
  expirePendingBookings,
  sendDueBookingRequestReminders,
} from "../src/lib/services/booking.service";
import { processBookingEmailOutbox } from "../src/lib/services/booking-email-outbox.service";
import { processPendingNotificationPushes } from "../src/lib/services/notification.service";
import { ensureMissingBookingConversations } from "../src/lib/services/chat.service";
import { processMessageEmailOutbox } from "../src/lib/services/message-email-outbox.service";
import { reconcileBookingTimelineEvents } from "../src/lib/services/booking-timeline.service";
import { processBookingPaymentReminders } from "../src/lib/services/booking-payment-reminder.service";

const reminded = await sendDueBookingRequestReminders();
const expired = await expirePendingBookings();
// Stays end on this timer too. Completion used to hang off the review-reminder timer
// alone, so disabling review reminders silently stopped bookings completing — and with
// them payment tracking and the review window (L7). Both timers now run the same
// idempotent, guarded sweep; whichever fires first does the work and the other finds
// nothing to do.
await completePastBookings();
const deliveries = await processBookingEmailOutbox();
const pushes = await processPendingNotificationPushes();
const conversations = await ensureMissingBookingConversations();
const messageEmails = await processMessageEmailOutbox();
const timelineEvents = await reconcileBookingTimelineEvents();
const paymentReminders = await processBookingPaymentReminders();

console.info(
  `[bookings] Queued ${reminded} booking reminder${reminded === 1 ? "" : "s"} and ${paymentReminders} payment reminder${paymentReminders === 1 ? "" : "s"}; expired ${expired} request${expired === 1 ? "" : "s"}; sent ${deliveries.sent} booking email${deliveries.sent === 1 ? "" : "s"} and ${messageEmails.sent} message email${messageEmails.sent === 1 ? "" : "s"}; retried ${pushes} push notification${pushes === 1 ? "" : "s"}; reconciled ${conversations.processed} conversation${conversations.processed === 1 ? "" : "s"} and ${timelineEvents} timeline event${timelineEvents === 1 ? "" : "s"}; ${deliveries.failed + messageEmails.failed + conversations.failed} failed; ${deliveries.exhausted + messageEmails.exhausted} exhausted.`
);

if (deliveries.exhausted + messageEmails.exhausted > 0) {
  console.error(
    `[bookings] ${deliveries.exhausted + messageEmails.exhausted} email deliver${deliveries.exhausted + messageEmails.exhausted === 1 ? "y has" : "ies have"} exhausted all retries and require operator attention.`
  );
  process.exitCode = 1;
}
