import type { Translator } from "@/lib/i18n/t";
import { t } from "@/lib/i18n/t";

/**
 * React Native cannot use the web app's live DOM translation fallback. This catalog
 * keeps mobile-only fixed copy in the same reviewed translation pipeline as the web
 * UI. The runtime mobile API returns these translations keyed by their English source.
 */
export function mobileUiCatalog(translator: Translator): string[] {
  return [
    t(translator, "mobile.generic.language", "Language"),
    t(
      translator,
      "mobile.generic.choose_language",
      "Choose the language used across the application."
    ),
    t(translator, "mobile.generic.reviewed_languages", "Reviewed languages"),
    t(translator, "mobile.generic.notifications", "Notifications"),
    t(translator, "mobile.generic.messages", "MESSAGES"),
    t(translator, "mobile.generic.unread", "unread"),
    t(translator, "mobile.generic.just_now", "Just now"),
    t(translator, "mobile.generic.minute_ago", "{count} minute ago"),
    t(translator, "mobile.generic.minutes_ago", "{count} minutes ago"),
    t(translator, "mobile.generic.hour_ago", "{count} hour ago"),
    t(translator, "mobile.generic.hours_ago", "{count} hours ago"),
    t(translator, "mobile.generic.day_ago", "{count} day ago"),
    t(translator, "mobile.generic.days_ago", "{count} days ago"),
    t(translator, "mobile.generic.loading", "Loading"),
    t(translator, "mobile.generic.try_again", "Try again."),
    t(translator, "mobile.generic.cancel", "Cancel"),
    t(translator, "mobile.generic.confirm", "Confirm"),
    t(translator, "mobile.generic.delete", "Delete"),
    t(translator, "mobile.generic.hide", "Hide"),
    t(translator, "mobile.generic.edit", "Edit"),
    t(translator, "mobile.generic.preview", "Preview"),
    t(translator, "mobile.generic.continue", "Continue"),
    t(translator, "mobile.generic.all", "All"),
    t(translator, "mobile.generic.prices", "Prices"),
    t(translator, "mobile.generic.blocks", "Blocks"),
    t(translator, "mobile.generic.bookings", "Bookings"),
    t(translator, "mobile.generic.days", "days"),
    t(translator, "mobile.generic.night", "night"),
    t(translator, "mobile.generic.session", "Session"),
    t(translator, "mobile.generic.host", "HOST"),
    t(translator, "mobile.generic.dashboard", "Dashboard"),
    t(translator, "mobile.dashboard.title", "Host Dashboard"),
    t(translator, "mobile.dashboard.create_listing", "Create Listing"),
    t(translator, "mobile.dashboard.my_listings", "My Listings"),
    t(translator, "mobile.dashboard.pending_requests", "Pending Requests"),
    t(translator, "mobile.dashboard.confirmed", "Confirmed"),
    t(translator, "mobile.dashboard.total_bookings", "Total Bookings"),
    t(translator, "mobile.dashboard.unavailable", "Dashboard unavailable"),
    t(translator, "mobile.listings.new_listing", "New Listing"),
    t(translator, "mobile.listings.in_progress_drafts", "In-progress drafts"),
    t(translator, "mobile.listings.stopped_at_step", "Stopped at Step"),
    t(translator, "mobile.listings.of", "of"),
    t(translator, "mobile.listings.last_edited", "Last edited"),
    t(translator, "mobile.listings.no_listings", "No listings yet"),
    t(
      translator,
      "mobile.listings.no_listings_description",
      "Create your first listing to start receiving bookings."
    ),
    t(translator, "mobile.listings.unavailable", "Listings unavailable"),
    t(translator, "mobile.listings.booking", "booking"),
    t(translator, "mobile.listings.bookings", "bookings"),
    t(translator, "mobile.listings.pending_review", "Pending Review"),
    t(translator, "mobile.listings.approved", "Approved"),
    t(translator, "mobile.listings.rejected", "Rejected"),
    t(translator, "mobile.listings.unpublished", "Unpublished"),
    t(translator, "mobile.listings.suspended", "Suspended"),
    t(translator, "mobile.listings.archived", "Archived"),
    t(translator, "mobile.listings.draft", "Draft"),
    t(translator, "mobile.listings.delete_draft", "Delete draft"),
    t(translator, "mobile.listings.delete_draft_error", "Could not delete draft"),
    t(translator, "mobile.listings.delete_error", "Could not delete listing"),
    t(translator, "mobile.listings.hide_error", "Could not hide listing"),
    t(translator, "mobile.listings.hide_site", "Hide from site"),
    t(translator, "mobile.listings.from_site", "from the site?"),
    t(translator, "mobile.bookings.title", "Booking Requests"),
    t(translator, "mobile.bookings.no_bookings", "No bookings yet"),
    t(
      translator,
      "mobile.bookings.no_bookings_description",
      "Bookings will appear here when guests request to stay at your listings."
    ),
    t(translator, "mobile.bookings.unavailable", "Bookings unavailable"),
    t(translator, "mobile.bookings.guest", "Guest"),
    t(translator, "mobile.bookings.dates", "Dates"),
    t(translator, "mobile.bookings.guests", "Guests"),
    t(translator, "mobile.bookings.total", "Total"),
    t(translator, "mobile.bookings.pending", "Pending"),
    t(translator, "mobile.bookings.cancelled_guest", "Cancelled by Guest"),
    t(translator, "mobile.bookings.cancelled_host", "Cancelled by Host"),
    t(translator, "mobile.bookings.cancelled_admin", "Cancelled by Admin"),
    t(translator, "mobile.bookings.completed", "Completed"),
    t(translator, "mobile.bookings.confirm_action", "Confirm"),
    t(translator, "mobile.bookings.reject_action", "Reject"),
    t(translator, "mobile.bookings.cancel_action", "Cancel booking"),
    t(
      translator,
      "mobile.bookings.cancel_warning",
      "Cancelling a confirmed booking should only be used for emergencies. A reason is required."
    ),
    t(translator, "mobile.bookings.reason", "Reason (required)"),
    t(translator, "mobile.bookings.confirm_cancel", "Confirm cancellation"),
    t(translator, "mobile.bookings.keep", "Keep booking"),
    t(translator, "mobile.bookings.update_error", "Could not update booking"),
    t(translator, "mobile.calendar.title", "Availability & pricing"),
    t(translator, "mobile.calendar.calendar", "Calendar"),
    t(
      translator,
      "mobile.calendar.instructions",
      "Select a date range, then apply availability or pricing actions."
    ),
    t(translator, "mobile.calendar.manual_block", "Manual block"),
    t(translator, "mobile.calendar.booking", "Booking"),
    t(translator, "mobile.calendar.custom_price", "Custom price"),
    t(translator, "mobile.calendar.select_range", "Select a date range"),
    t(translator, "mobile.calendar.mixed_prices", "Mixed prices"),
    t(translator, "mobile.calendar.custom_price_days", "custom price days"),
    t(translator, "mobile.calendar.blocked_days", "blocked days"),
    t(translator, "mobile.calendar.booked_days", "booked days"),
    t(translator, "mobile.calendar.reason", "Block reason (optional)"),
    t(translator, "mobile.calendar.reason_example", "e.g. Maintenance, private stay"),
    t(translator, "mobile.calendar.edit_price", "Edit price"),
    t(translator, "mobile.calendar.reset_price", "Reset price"),
    t(translator, "mobile.calendar.make_available", "Make available"),
    t(translator, "mobile.calendar.block", "Block"),
    t(translator, "mobile.calendar.make_selected", "Make selected range available"),
    t(
      translator,
      "mobile.calendar.make_selected_description",
      "This removes manual blocks in the selected range. Booking holds stay untouched."
    ),
    t(translator, "mobile.calendar.block_selected", "Block selected range"),
    t(
      translator,
      "mobile.calendar.block_selected_description",
      "This will block the selected range for booking requests."
    ),
    t(translator, "mobile.calendar.bulk", "Bulk Future Actions"),
    t(
      translator,
      "mobile.calendar.bulk_description",
      "These actions affect all future dates and stay separate from the date-by-date calendar workflow."
    ),
    t(translator, "mobile.calendar.block_all", "Block all future"),
    t(translator, "mobile.calendar.block_all_title", "Block all future dates"),
    t(
      translator,
      "mobile.calendar.block_all_description",
      "This will block every currently available future date. Existing booking holds remain as-is."
    ),
    t(translator, "mobile.calendar.make_all", "Make all future available"),
    t(translator, "mobile.calendar.make_all_title", "Make all future dates available"),
    t(
      translator,
      "mobile.calendar.make_all_description",
      "This will remove all manual future blocks. Confirmed and pending booking holds are kept."
    ),
    t(translator, "mobile.calendar.exceptions", "Upcoming Exceptions"),
    t(
      translator,
      "mobile.calendar.exceptions_description",
      "Review the upcoming blocked dates, bookings, and custom price periods in one timeline."
    ),
    t(
      translator,
      "mobile.calendar.no_exceptions",
      "No upcoming exceptions for the selected filter."
    ),
    t(translator, "mobile.calendar.booking_hold", "Booking hold"),
    t(translator, "mobile.calendar.blocked", "Blocked"),
    t(translator, "mobile.calendar.booked", "Booked"),
    t(translator, "mobile.calendar.price_override", "Price override"),
    t(translator, "mobile.calendar.no_reason", "No reason provided"),
    t(translator, "mobile.calendar.reserved", "Reserved dates"),
    t(translator, "mobile.calendar.remove_price", "Remove custom price"),
    t(translator, "mobile.calendar.revert_price", "Nights will revert to the base price."),
    t(translator, "mobile.calendar.set_rate", "Set a nightly rate for the selected range."),
    t(translator, "mobile.calendar.nightly_price", "Nightly price"),
    t(translator, "mobile.calendar.base_rate", "Base rate"),
    t(translator, "mobile.calendar.save_price", "Save price"),
    t(translator, "mobile.calendar.update_error", "Could not update calendar"),
    t(translator, "mobile.calendar.unavailable", "Calendar unavailable"),
    t(translator, "mobile.calendar.pricing_missing", "Listing pricing is missing"),
    t(
      translator,
      "mobile.calendar.pricing_missing_description",
      "Add pricing on the listing edit page before managing the calendar."
    ),
    t(translator, "mobile.notifications.activity", "ACTIVITY"),
    t(
      translator,
      "mobile.notifications.subtitle",
      "Booking updates and new messages in one place."
    ),
    t(translator, "mobile.notifications.mark_all", "Mark all read"),
    t(translator, "mobile.notifications.caught_up", "You're all caught up"),
    t(
      translator,
      "mobile.notifications.empty",
      "Booking and chat notifications will appear here."
    ),
    t(translator, "mobile.inbox.title", "Inbox"),
    t(
      translator,
      "mobile.inbox.subtitle",
      "Every booking has a private conversation with the guest."
    ),
    t(translator, "mobile.inbox.unavailable", "Inbox unavailable"),
    t(translator, "mobile.inbox.empty", "No conversations yet"),
    t(
      translator,
      "mobile.inbox.empty_description",
      "A thread is created automatically when a booking is made."
    ),
    t(translator, "mobile.chat.start", "Start the conversation"),
    t(
      translator,
      "mobile.chat.start_description",
      "Share arrival details and answer questions about this booking."
    ),
    t(translator, "mobile.chat.booking_conversation", "Booking conversation"),
    t(translator, "mobile.chat.write", "Write a message"),
    t(translator, "mobile.chat.send", "Send"),
    t(translator, "mobile.login.property_management", "PROPERTY MANAGEMENT"),
    t(translator, "mobile.login.welcome", "Welcome back"),
    t(
      translator,
      "mobile.login.subtitle",
      "Manage listings, availability, and booking requests wherever you are."
    ),
    t(translator, "mobile.login.google", "Continue with Google"),
    t(translator, "mobile.login.or", "OR"),
    t(translator, "mobile.login.email", "Email address"),
    t(translator, "mobile.login.email_action", "Continue with email"),
    t(
      translator,
      "mobile.login.google_window",
      "Complete Google sign-in in the secure window."
    ),
    t(translator, "mobile.login.invalid_email", "Enter a valid email address."),
    t(
      translator,
      "mobile.login.same_account",
      "Uses the same secure account and login options as the host control panel."
    ),
    t(translator, "mobile.builder.new_listing", "NEW LISTING"),
    t(translator, "mobile.builder.step_property_type", "Property type"),
    t(
      translator,
      "mobile.builder.step_property_type_description",
      "What kind of place will guests book?"
    ),
    t(translator, "mobile.builder.step_location", "Location"),
    t(
      translator,
      "mobile.builder.step_location_description",
      "Help guests understand where they will stay."
    ),
    t(translator, "mobile.builder.step_property_details", "Property details"),
    t(
      translator,
      "mobile.builder.step_property_details_description",
      "Set the capacity and sleeping arrangements."
    ),
    t(translator, "mobile.builder.step_amenities", "Amenities"),
    t(
      translator,
      "mobile.builder.step_amenities_description",
      "Choose what your property offers."
    ),
    t(translator, "mobile.builder.step_photos", "Photos"),
    t(
      translator,
      "mobile.builder.step_photos_description",
      "Add at least 3 photos and choose the best one first."
    ),
    t(translator, "mobile.builder.step_description", "Description"),
    t(
      translator,
      "mobile.builder.step_description_description",
      "Give guests a clear, inviting overview."
    ),
    t(translator, "mobile.builder.step_pricing", "Pricing"),
    t(
      translator,
      "mobile.builder.step_pricing_description",
      "Set the price and minimum stay, then publish."
    ),
    t(
      translator,
      "mobile.builder.saved",
      "Your progress is saved as a draft after every step."
    ),
    t(translator, "mobile.builder.complete", "Complete listing builder"),
    t(
      translator,
      "mobile.builder.bridge",
      "The same seven-step builder opens securely and uses the same saved drafts as the web control panel."
    ),
    t(translator, "mobile.account.all_tools", "All existing host tools"),
    t(translator, "mobile.account.profile_detail", "Name, photo, and personal details"),
    t(translator, "mobile.account.browse", "Browse public properties"),
  ];
}
