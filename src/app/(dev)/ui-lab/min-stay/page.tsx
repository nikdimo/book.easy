import { notFound } from "next/navigation";
import { MinStayLab } from "./lab-client";

export const metadata = { title: "UI lab — minimum stay" };

export default function MinStayLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MinStayLab />;
}
