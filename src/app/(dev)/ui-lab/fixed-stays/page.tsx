import { notFound } from "next/navigation";
import { FixedStaysLab } from "./lab-client";

// Throwaway preview route for the fixed stay periods feature (phase one, UI only).
// Delete src/app/(dev) to remove it — nothing outside that folder imports from it.

export const metadata = { title: "UI lab — fixed stay periods" };

export default function FixedStaysLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FixedStaysLab />;
}
