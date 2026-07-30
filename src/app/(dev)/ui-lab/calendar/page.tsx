import { notFound } from "next/navigation";
import { CalendarLab } from "./lab-client";

// Throwaway preview route for the calendar workspace redesign.
// Delete src/app/(dev) to remove it — nothing outside that folder imports from it.

export const metadata = { title: "UI lab — calendar" };

export default function CalendarLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CalendarLab />;
}
