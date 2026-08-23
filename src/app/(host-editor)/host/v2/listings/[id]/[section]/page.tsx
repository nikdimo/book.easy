import { notFound, redirect } from "next/navigation";
import {
  EDITOR_OVERVIEW_SLUG,
  editorSectionHref,
  findEditorSection,
} from "@/lib/host/v2/editor-sections";

/**
 * The catch-all under a listing, and nothing more.
 *
 * Every editor section has a route of its own now, and a static segment always wins
 * over this dynamic one — so anything arriving here is a slug no section claims. There
 * is nothing left to hand off to: the classic editor is no longer a destination, so a
 * junk slug is simply not a page.
 *
 * The redirect is the belt to that braces: if a section is ever added to
 * `EDITOR_SECTIONS` before its route exists, a host lands on the listing overview
 * rather than a 404 for a section the navigation is actively offering them.
 */
export default async function EditorSectionCatchAll({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section: slug } = await params;
  if (!findEditorSection(slug)) notFound();
  redirect(editorSectionHref(id, EDITOR_OVERVIEW_SLUG));
}
