import { redirect } from "next/navigation";

export default function AdminSuggestionsPage() {
  redirect("/admin/settings?tab=suggestions");
}
