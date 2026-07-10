import "server-only";
import { addDays } from "date-fns";
import { db } from "@/lib/db";

export {
  parseLocalYmd,
  dateKey,
  eachStayNight,
  buildPriceOverrideMap,
  computeStayPricing,
} from "@/lib/utils/stay-pricing";

export async function getListingDatePricesFromDb(listingId: string, from: Date, to: Date) {
  return db.listingDatePrice.findMany({
    where: {
      listingId,
      date: { gte: from, lt: to },
    },
    orderBy: { date: "asc" },
  });
}

export async function getFutureDatePriceRowsForListing(listingId: string, monthsAhead = 18) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDays(from, monthsAhead * 31);
  return db.listingDatePrice.findMany({
    where: {
      listingId,
      date: { gte: from, lte: to },
    },
    select: { id: true, date: true, nightlyRate: true },
    orderBy: { date: "asc" },
  });
}
