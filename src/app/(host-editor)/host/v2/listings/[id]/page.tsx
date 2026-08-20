import { redirect } from "next/navigation";

/** Opening a listing means opening its photos — the section a host returns to most, and
 *  the one the brief makes the default. */
export default async function ListingEditorIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/host/v2/listings/${id}/photos`);
}
